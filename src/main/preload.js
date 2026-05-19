const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Terminal
  writeToTerminal: (tabId, content) => {
    ipcRenderer.send('write-to-terminal', { tabId, content });
  },

  onPtyOutput: (callback) => {
    const handler = (_event, { tabId, data }) => callback(tabId, data);
    ipcRenderer.on('pty-output', handler);
    return () => ipcRenderer.removeListener('pty-output', handler);
  },

  onWriteComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('write-complete', handler);
    return () => ipcRenderer.removeListener('write-complete', handler);
  },

  ptyResize: (tabId, cols, rows) => {
    ipcRenderer.send('pty-resize', { tabId, cols, rows });
  },

  // Tabs
  createTab: (projectPath, tabName) => {
    return ipcRenderer.invoke('create-tab', { projectPath, tabName });
  },

  closeTab: (tabId) => {
    return ipcRenderer.invoke('close-tab', { tabId });
  },

  switchTab: (tabId) => {
    return ipcRenderer.invoke('switch-tab', { tabId });
  },

  getTabs: () => {
    return ipcRenderer.invoke('get-tabs');
  },

  onTabCreated: (callback) => {
    const handler = (_event, tab) => callback(tab);
    ipcRenderer.on('tab-created', handler);
    return () => ipcRenderer.removeListener('tab-created', handler);
  },

  onTabClosed: (callback) => {
    const handler = (_event, tab) => callback(tab);
    ipcRenderer.on('tab-closed', handler);
    return () => ipcRenderer.removeListener('tab-closed', handler);
  },

  onActivateTab: (callback) => {
    const handler = (_event, tabId) => callback(tabId);
    ipcRenderer.on('activate-tab', handler);
    return () => ipcRenderer.removeListener('activate-tab', handler);
  },

  // New window
  openNewWindow: (projectPath) => {
    return ipcRenderer.invoke('open-new-window', { projectPath });
  },

  // Connection info
  getConnectionInfo: () => {
    return ipcRenderer.invoke('get-connection-info');
  },

  // Session history
  scanSessions: () => {
    return ipcRenderer.invoke('scan-sessions');
  },

  // External links
  openExternal: (url) => {
    ipcRenderer.send('open-external', url);
  },
});
