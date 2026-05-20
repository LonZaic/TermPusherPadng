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

  createCanvasTab: () => {
    return ipcRenderer.invoke('create-canvas-tab');
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

  // AI PTY for canvas tabs
  spawnAiPty: (tabId) => {
    return ipcRenderer.invoke('spawn-ai-pty', { tabId });
  },

  killAiPty: (tabId) => {
    return ipcRenderer.invoke('kill-ai-pty', { tabId });
  },

  aiPtyWrite: (tabId, content) => {
    ipcRenderer.send('ai-pty-write', { tabId, content });
  },

  aiPtyResize: (tabId, cols, rows) => {
    ipcRenderer.send('ai-pty-resize', { tabId, cols, rows });
  },

  onAiPtyOutput: (callback) => {
    const handler = (_event, { tabId, data }) => callback(tabId, data);
    ipcRenderer.on('ai-pty-output', handler);
    return () => ipcRenderer.removeListener('ai-pty-output', handler);
  },

  onAiPtyExited: (callback) => {
    const handler = (_event, { tabId, exitCode }) => callback(tabId, exitCode);
    ipcRenderer.on('ai-pty-exited', handler);
    return () => ipcRenderer.removeListener('ai-pty-exited', handler);
  },

  // Theme
  onOpenTheme: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-theme', handler);
    return () => ipcRenderer.removeListener('open-theme', handler);
  },

  // OCR
  ocrRecognize: (dataUrl) => {
    return ipcRenderer.invoke('ocr-recognize', dataUrl);
  },

  // External links
  openExternal: (url) => {
    ipcRenderer.send('open-external', url);
  },

  // Learning Notes
  summarizeQA: (params) => {
    return ipcRenderer.invoke('summarize-qa', params);
  },

  loadNotes: () => {
    return ipcRenderer.invoke('load-notes');
  },

  updateNote: (noteId, updates) => {
    return ipcRenderer.invoke('update-note', { noteId, updates });
  },

  deleteNote: (noteId) => {
    return ipcRenderer.invoke('delete-note', { noteId });
  },

  exportNotes: (noteIds) => {
    return ipcRenderer.invoke('export-notes', { noteIds });
  },

  getNotesPath: () => {
    return ipcRenderer.invoke('get-notes-path');
  },

  onToggleNoteMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-note-mode', handler);
    return () => ipcRenderer.removeListener('toggle-note-mode', handler);
  },

  onOpenNotesPanel: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-notes-panel', handler);
    return () => ipcRenderer.removeListener('open-notes-panel', handler);
  },

  onOpenAPISettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-api-settings', handler);
    return () => ipcRenderer.removeListener('open-api-settings', handler);
  },

  onNoteGenerated: (callback) => {
    const handler = (_event, note) => callback(note);
    ipcRenderer.on('note-generated', handler);
    return () => ipcRenderer.removeListener('note-generated', handler);
  },

  // File Diff
  getChangedFiles: (cwd) => {
    return ipcRenderer.invoke('get-changed-files', cwd);
  },

  getFileTree: (cwd) => {
    return ipcRenderer.invoke('get-file-tree', cwd);
  },

  getFileDiff: (cwd, filePath) => {
    return ipcRenderer.invoke('get-file-diff', cwd, filePath);
  },

  readFile: (filePath) => {
    return ipcRenderer.invoke('read-file', filePath);
  },

  writeFile: (filePath, content) => {
    return ipcRenderer.invoke('write-file', filePath, content);
  },

  revertFile: (cwd, filePath) => {
    return ipcRenderer.invoke('revert-file', cwd, filePath);
  },

  resolvePath: (cwd, target) => {
    return ipcRenderer.invoke('resolve-path', cwd, target);
  },
});
