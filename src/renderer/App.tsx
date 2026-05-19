import React, { useCallback, useRef, useState, useEffect } from 'react';
import TerminalPanel from './TerminalPanel';
import CommandPanel from './CommandPanel';
import TabBar from './TabBar';
import NewConversationDialog from './NewConversationDialog';
import { assignTabColor } from './tabColors';
import type { TabColor } from './tabColors';
import './App.css';

interface TabState {
  tabId: string;
  name: string;
  projectPath: string | null;
  cwd: string;
  color: TabColor;
}

function App() {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [writing, setWriting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const termRef = useRef<{ focus: () => void }>(null);

  const activeTab = tabs.find((t) => t.tabId === activeTabId);

  // Initialize tabs from main process
  useEffect(() => {
    window.electronAPI.getTabs().then(({ tabs: rawTabs, activeTabId: aid }) => {
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
    });

    const unsubCreated = window.electronAPI.onTabCreated((tab) => {
      setTabs((prev) => {
        const color = assignTabColor(tab.projectPath, prev);
        return [...prev, { ...tab, color }];
      });
    });

    const unsubClosed = window.electronAPI.onTabClosed(({ tabId, activeTabId: newActive }) => {
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId));
      setActiveTabId(newActive || '');
    });

    const unsubActivate = window.electronAPI.onActivateTab((tabId) => {
      setActiveTabId(tabId);
    });

    return () => {
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
  ) => {
    setDialogOpen(false);
    if (openInNewWindow) {
      await window.electronAPI.openNewWindow(projectPath);
    } else {
      const tab = await window.electronAPI.createTab(projectPath, null);
      setActiveTabId(tab.tabId);
      setTimeout(() => termRef.current?.focus(), 100);
    }
  }, []);

  const handleWriteCommand = useCallback((command: string) => {
    if (writing || !activeTabId) return;
    setWriting(true);
    window.electronAPI.writeToTerminal(activeTabId, command);
    termRef.current?.focus();
  }, [writing, activeTabId]);

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
        <CommandPanel onWriteCommand={handleWriteCommand} writing={writing} />
        <div className="terminal-wrapper">
          {activeTabId && <TerminalPanel key={activeTabId} ref={termRef} tabId={activeTabId} />}
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
