import React, { useCallback, useRef, useState, useEffect } from 'react';
import TerminalPanel from './TerminalPanel';
import CanvasPanel from './CanvasPanel';
import CommandPanel from './CommandPanel';
import TabBar from './TabBar';
import NewConversationDialog from './NewConversationDialog';
import { assignTabColor } from './tabColors';
import type { TabColor } from './tabColors';
import { addRecentCommand, addRecentProject } from './commandTracker';
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
  const termRef = useRef<{ focus: () => void }>(null);

  const activeTab = tabs.find((t) => t.tabId === activeTabId);

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

  const handleCommandCapture = useCallback((command: string) => {
    addRecentCommand(command, 'terminal');
  }, []);

  const handleProjectOpen = useCallback((projectPath: string) => {
    addRecentProject(projectPath);
  }, []);

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={handleSwitchTab}
        onClose={handleCloseTab}
        onNewConversation={handleNewConversation}
      />
      <div className="main-content">
        <CommandPanel
          onWriteCommand={handleWriteCommand}
          writing={writing}
          currentProjectPath={activeTab?.projectPath || null}
          onProjectOpen={handleProjectOpen}
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
                onCommandCapture={handleCommandCapture}
              />
            )
          ) : (
            <div className="loading-hint">点击 + 新建标签</div>
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
    </div>
  );
}

export default App;
