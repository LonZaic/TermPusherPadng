import React, { useCallback, useRef, useState, useEffect } from 'react';
import TerminalPanel from './TerminalPanel';
import CanvasPanel from './CanvasPanel';
import CommandPanel from './CommandPanel';
import TabBar from './TabBar';
import NewConversationDialog from './NewConversationDialog';
import ThemeDialog from './ThemeDialog';
import ImageOCRDialog from './ImageOCRDialog';
import NotesPanel from './NotesPanel';
import APISettingsDialog from './APISettingsDialog';
import { assignTabColor } from './tabColors';
import type { TabColor } from './tabColors';
import { addRecentCommand, addRecentProject } from './commandTracker';
import { DEFAULT_THEME, applyTheme } from './themeEngine';
import type { ThemeState } from './themeEngine';
import './App.css';

interface TabState {
  tabId: string;
  name: string;
  projectPath: string | null;
  cwd: string;
  color: TabColor;
  type: 'terminal' | 'canvas';
}

function App() {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [writing, setWriting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeState>(DEFAULT_THEME);
  const [themeVersion, setThemeVersion] = useState(0);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrImageDataUrl, setOcrImageDataUrl] = useState<string | null>(null);
  const termRef = useRef<{ focus: () => void }>(null);

  // Learning Notes state
  const [noteMode, setNoteMode] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
    try {
      const raw = localStorage.getItem('notes-api-config');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          provider: parsed.provider || 'anthropic',
          apiKey: parsed.apiKey || '',
          model: parsed.model || 'claude-sonnet-4-20250514',
          baseUrl: parsed.baseUrl || 'https://api.anthropic.com/v1/messages',
        };
      }
    } catch { /* ignore */ }
    return { provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com/v1/messages' };
  });
  const [noteStatus, setNoteStatus] = useState('');
  const convMonitorRef = useRef({
    phase: 'idle' as 'idle' | 'collecting' | 'summarizing',
    question: '',
    answerBuffer: '',
    tabId: '',
    tabName: '',
    silenceTimer: null as ReturnType<typeof setTimeout> | null,
    maxWaitTimer: null as ReturnType<typeof setTimeout> | null,
  });

  const activeTab = tabs.find((t) => t.tabId === activeTabId);

  const handleSummarize = useCallback(async () => {
    const monitor = convMonitorRef.current;
    if (monitor.phase !== 'collecting') return;

    monitor.phase = 'summarizing';
    if (monitor.silenceTimer) clearTimeout(monitor.silenceTimer);
    if (monitor.maxWaitTimer) clearTimeout(monitor.maxWaitTimer);

    if (!apiConfig.apiKey) {
      setNoteStatus('API key not configured. Open Settings to configure.');
      convMonitorRef.current = { phase: 'idle', question: '', answerBuffer: '', tabId: '', tabName: '', silenceTimer: null, maxWaitTimer: null };
      setTimeout(() => setNoteStatus(''), 4000);
      return;
    }

    setNoteStatus('Generating note...');

    try {
      const result = await window.electronAPI.summarizeQA({
        question: monitor.question,
        answer: monitor.answerBuffer,
        tabId: monitor.tabId,
        tabName: monitor.tabName,
        config: apiConfig,
      });

      if (result.error) {
        setNoteStatus('Note generation failed: ' + result.error);
      } else if (result.note) {
        setNotes(prev => [result.note!, ...prev]);
        setNoteStatus('Note generated: ' + result.note.title);
      }
    } catch (err: any) {
      setNoteStatus('Note generation error: ' + (err.message || 'Unknown error'));
    }

    convMonitorRef.current = { phase: 'idle', question: '', answerBuffer: '', tabId: '', tabName: '', silenceTimer: null, maxWaitTimer: null };
    setTimeout(() => setNoteStatus(''), 4000);
  }, [apiConfig]);

  // Initialize tabs from main process
  useEffect(() => {
    let cancelled = false;

    window.electronAPI.getTabs().then(({ tabs: rawTabs, activeTabId: aid }) => {
      if (cancelled) return;
      const existing: TabState[] = [];
      const withColors: TabState[] = [];
      for (const t of rawTabs) {
        const color = assignTabColor(t.projectPath, existing);
        const ts: TabState = { ...t, color };
        existing.push(ts);
        withColors.push(ts);
      }
      setTabs(withColors);
      setActiveTabId(aid);
      setLoading(false);
    }).catch((err) => {
      console.error('getTabs failed:', err);
      if (!cancelled) setLoading(false);
    });

    const unsubCreated = window.electronAPI.onTabCreated((tab) => {
      setTabs((prev) => {
        // deduplicate
        if (prev.some((t) => t.tabId === tab.tabId)) return prev;
        const color = assignTabColor(tab.projectPath, prev);
        return [...prev, { ...tab, color }];
      });
      // auto-switch to newly created tab (from menu or folder open)
      setActiveTabId(tab.tabId);
      setTimeout(() => termRef.current?.focus(), 80);
    });

    const unsubClosed = window.electronAPI.onTabClosed(({ tabId, activeTabId: newActive }) => {
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId));
      setActiveTabId(newActive || '');
    });

    const unsubActivate = window.electronAPI.onActivateTab((tabId) => {
      setActiveTabId(tabId);
      setTimeout(() => termRef.current?.focus(), 50);
    });

    return () => {
      cancelled = true;
      unsubCreated();
      unsubClosed();
      unsubActivate();
    };
  }, []);

  // Write complete handler
  useEffect(() => {
    const cleanup = window.electronAPI.onWriteComplete((_result) => {
      setWriting(false);
    });
    return cleanup;
  }, []);

  // Load theme from localStorage and apply
  useEffect(() => {
    try {
      const raw = localStorage.getItem('app-theme');
      if (raw) {
        const saved: ThemeState = JSON.parse(raw);
        setTheme(saved);
        applyTheme(saved);
      }
    } catch { /* ignore */ }
  }, []);

  // Listen for theme menu IPC
  useEffect(() => {
    const unsub = window.electronAPI.onOpenTheme(() => setThemeOpen(true));
    return () => { if (unsub) unsub(); };
  }, []);

  // Handle new window initial project
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#initialProject=')) {
      const projectPath = decodeURIComponent(hash.slice('#initialProject='.length));
      window.electronAPI.createTab(projectPath, null).then(() => {
        window.location.hash = '';
      });
    }
  }, []);

  // Ctrl+Shift+V: paste clipboard image for OCR
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        navigator.clipboard.read().then((items) => {
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                item.getType(type).then((blob) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setOcrImageDataUrl(reader.result as string);
                    setOcrOpen(true);
                  };
                  reader.readAsDataURL(blob);
                });
                return;
              }
            }
          }
        }).catch(() => { /* clipboard read failed, likely no image */ });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Paste event: detect image in clipboard (exclude paste inside xterm textarea)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const target = e.target as HTMLElement;
      if (target && (target.closest('.xterm-helper-textarea') || target.closest('textarea'))) return;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => {
            setOcrImageDataUrl(reader.result as string);
            setOcrOpen(true);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  // Load notes on mount
  useEffect(() => {
    window.electronAPI.loadNotes().then(setNotes).catch(() => {});
  }, []);

  // Listen for Notes menu IPC events
  useEffect(() => {
    const unsubs = [
      window.electronAPI.onToggleNoteMode(() => setNoteMode(v => !v)),
      window.electronAPI.onOpenNotesPanel(() => setNotesPanelOpen(true)),
      window.electronAPI.onOpenAPISettings(() => setApiSettingsOpen(true)),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);

  // Monitor PTY output for conversation detection (silence-based)
  useEffect(() => {
    const SILENCE_MS = 2500;
    const cleanup = window.electronAPI.onPtyOutput((eventTabId, data) => {
      const monitor = convMonitorRef.current;
      if (monitor.phase !== 'collecting' || eventTabId !== monitor.tabId) return;

      monitor.answerBuffer += data;

      if (monitor.silenceTimer) clearTimeout(monitor.silenceTimer);
      monitor.silenceTimer = setTimeout(() => {
        if (convMonitorRef.current.phase === 'collecting') {
          handleSummarize();
        }
      }, SILENCE_MS);
    });
    return cleanup;
  }, [handleSummarize]);

  // Cleanup conversation monitor on unmount
  useEffect(() => {
    return () => {
      const m = convMonitorRef.current;
      if (m.silenceTimer) clearTimeout(m.silenceTimer);
      if (m.maxWaitTimer) clearTimeout(m.maxWaitTimer);
    };
  }, []);

  const handleSwitchTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return;
    const result = await window.electronAPI.switchTab(tabId);
    setActiveTabId(result.tabId);
    setTimeout(() => termRef.current?.focus(), 50);
  }, [activeTabId]);

  const handleCloseTab = useCallback(async (tabId: string) => {
    if (tabs.length <= 1) return;
    await window.electronAPI.closeTab(tabId);
  }, [tabs.length]);

  const handleNewConversation = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleDialogConfirm = useCallback(async (
    projectPath: string | null,
    openInNewWindow: boolean,
    tabType?: 'terminal' | 'canvas',
  ) => {
    setDialogOpen(false);
    if (tabType === 'canvas') {
      await window.electronAPI.createCanvasTab();
    } else {
      if (projectPath) addRecentProject(projectPath);
      if (openInNewWindow) {
        await window.electronAPI.openNewWindow(projectPath);
      } else {
        await window.electronAPI.createTab(projectPath, null);
      }
    }
  }, []);

  const handleWriteCommand = useCallback((command: string) => {
    if (writing || !activeTabId) return;
    setWriting(true);
    window.electronAPI.writeToTerminal(activeTabId, command);
    addRecentCommand(command, 'panel');
    termRef.current?.focus();
  }, [writing, activeTabId]);

  const handleResumeSession = useCallback(async (tool: string, id: string, command: string) => {
    if (writing) return;
    setWriting(true);
    try {
      const tab = await window.electronAPI.createTab(null, null);
      window.electronAPI.writeToTerminal(tab.tabId, command);
      addRecentCommand(command, 'panel');
      termRef.current?.focus();
    } catch {
      setWriting(false);
    }
  }, [writing]);

  const handleCommandCapture = useCallback((command: string) => {
    addRecentCommand(command, 'terminal');

    if (!noteMode) return;
    if (!apiConfig.apiKey) {
      setNoteStatus('Configure API key in Settings to enable note generation.');
      setTimeout(() => setNoteStatus(''), 4000);
      return;
    }
    if (convMonitorRef.current.phase !== 'idle') return;

    const tab = activeTab;
    if (!tab) return;

    const SILENCE_MS = 2500;
    const MAX_WAIT_MS = 60000;

    convMonitorRef.current = {
      phase: 'collecting',
      question: command,
      answerBuffer: '',
      tabId: tab.tabId,
      tabName: tab.name,
      silenceTimer: setTimeout(() => handleSummarize(), SILENCE_MS),
      maxWaitTimer: setTimeout(() => handleSummarize(), MAX_WAIT_MS),
    };
  }, [noteMode, apiConfig, activeTab, handleSummarize]);

  const handleThemeApply = useCallback((t: ThemeState) => {
    setTheme(t);
    setThemeVersion((v) => v + 1);
    applyTheme(t);
    try { localStorage.setItem('app-theme', JSON.stringify(t)); } catch { /* ignore */ }
  }, []);

  const handleOCRInsert = useCallback((text: string) => {
    if (!activeTabId) return;
    addRecentCommand('(识图)', 'panel');
    window.electronAPI.writeToTerminal(activeTabId, text);
    termRef.current?.focus();
  }, [activeTabId]);

  const handleOpenOCR = useCallback(() => {
    setOcrImageDataUrl(null);
    setOcrOpen(true);
  }, []);

  const handleSaveAPIConfig = useCallback((config: APIConfig) => {
    setApiConfig(config);
    try { localStorage.setItem('notes-api-config', JSON.stringify(config)); } catch { /* ignore */ }
    setApiSettingsOpen(false);
  }, []);

  const handleUpdateNote = useCallback(async (noteId: string, updates: Partial<LearningNote>) => {
    const success = await window.electronAPI.updateNote(noteId, updates);
    if (success) {
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));
    }
  }, []);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const success = await window.electronAPI.deleteNote(noteId);
    if (success) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
    }
  }, []);

  const handleExportNotes = useCallback(async (noteIds: string[]) => {
    const markdown = await window.electronAPI.exportNotes(noteIds);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learning-notes-' + new Date().toISOString().slice(0, 10) + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleProjectOpen = useCallback((projectPath: string) => {
    addRecentProject(projectPath);
  }, []);

  const glassActive = theme.mode === 'image' && theme.glassEnabled && theme.backgroundImage;
  const bgStyle: React.CSSProperties = {};
  if (theme.mode === 'gradient' && theme.gradientColors.length >= 2) {
    bgStyle.background = `linear-gradient(${theme.gradientAngle}deg, ${theme.gradientColors.join(', ')})`;
  } else if (theme.mode === 'image' && theme.backgroundImage) {
    bgStyle.backgroundImage = `url(${theme.backgroundImage})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  } else {
    bgStyle.background = theme.solidColor || DEFAULT_THEME.solidColor;
  }

  return (
    <div className="app" style={bgStyle}>
      {glassActive && (
        <div
          className="app-glass-layer active"
          style={{
            background: `${theme.glassColor}${Math.round(theme.glassOpacity * 255).toString(16).padStart(2, '0')}`,
            backdropFilter: `blur(${theme.glassBlur}px)`,
            WebkitBackdropFilter: `blur(${theme.glassBlur}px)`,
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitch={handleSwitchTab}
          onClose={handleCloseTab}
          onNewConversation={handleNewConversation}
          noteMode={noteMode}
          onToggleNoteMode={() => setNoteMode(v => !v)}
          notesPanelOpen={notesPanelOpen}
          onToggleNotesPanel={() => setNotesPanelOpen(v => !v)}
        />
        <div className="main-content">
          <CommandPanel
            onWriteCommand={handleWriteCommand}
            writing={writing}
            currentProjectPath={activeTab?.projectPath || null}
            onProjectOpen={handleProjectOpen}
            onOpenOCR={handleOpenOCR}
            onResumeSession={handleResumeSession}
          />
          <div className="terminal-wrapper">
            {loading ? (
              <div className="loading-hint">正在连接终端...</div>
            ) : activeTabId ? (
              activeTab.type === 'canvas' ? (
                <CanvasPanel
                  key={activeTabId}
                  tabId={activeTabId}
                />
              ) : (
                <TerminalPanel
                  key={activeTabId}
                  ref={termRef}
                  tabId={activeTabId}
                  themeVersion={themeVersion}
                  onCommandCapture={handleCommandCapture}
                />
              )
            ) : (
              <div className="loading-hint">点击 + 新建标签</div>
            )}
          </div>
          {notesPanelOpen && (
            <NotesPanel
              open={notesPanelOpen}
              notes={notes}
              onClose={() => setNotesPanelOpen(false)}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onExport={handleExportNotes}
            />
          )}
        </div>
      </div>
      <NewConversationDialog
        open={dialogOpen}
        currentProjectPath={activeTab?.projectPath || null}
        currentProjectName={activeTab?.projectPath ? activeTab.name : ''}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDialogConfirm}
      />
      <ThemeDialog
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        theme={theme}
        onApply={handleThemeApply}
      />
      <ImageOCRDialog
        open={ocrOpen}
        imageDataUrl={ocrImageDataUrl}
        onClose={() => { setOcrOpen(false); setOcrImageDataUrl(null); }}
        onInsert={handleOCRInsert}
      />
      <APISettingsDialog
        open={apiSettingsOpen}
        config={apiConfig}
        onClose={() => setApiSettingsOpen(false)}
        onSave={handleSaveAPIConfig}
      />
      {noteStatus && <div className="note-status-toast">{noteStatus}</div>}
    </div>
  );
}

export default App;
