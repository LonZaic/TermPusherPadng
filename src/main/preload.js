const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  writeToTerminal: (content) => {
    ipcRenderer.send('write-to-terminal', content);
  },

  onTerminalOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('terminal-output', handler);
    return () => {
      ipcRenderer.removeListener('terminal-output', handler);
    };
  },

  onWriteComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('write-complete', handler);
    return () => {
      ipcRenderer.removeListener('write-complete', handler);
    };
  },

  ptyResize: (cols, rows) => {
    ipcRenderer.send('pty-resize', { cols, rows });
  },

  getConnectionInfo: () => {
    return ipcRenderer.invoke('get-connection-info');
  },
});
