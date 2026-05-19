const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 10;

// Per-window state: each BrowserWindow owns its tabs independently
const windows = new Map();

function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function spawnPty(cwd) {
  const shell = process.env.COMSPEC || 'cmd.exe';
  return pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: cwd || process.env.USERPROFILE,
    env: process.env,
    useConpty: true,
    conptyInheritCursor: false,
  });
}

function getWindowState(win) {
  if (!win) return null;
  return windows.get(win.id);
}

function activePty(winState) {
  if (!winState || !winState.activeTabId) return null;
  const tab = winState.tabs.get(winState.activeTabId);
  return tab ? tab.ptyProcess : null;
}

function createTab(winState, projectPath, tabName) {
  const tabId = generateTabId();
  const cwd = projectPath || process.env.USERPROFILE;
  const ptyProcess = spawnPty(cwd);

  const folderName = projectPath ? path.basename(projectPath) : 'Terminal';
  const name = tabName || folderName;

  winState.tabs.set(tabId, { ptyProcess, projectPath, name, cwd });
  winState.tabOrder.push(tabId);

  ptyProcess.onData((data) => {
    const bw = winState.win;
    if (bw && !bw.isDestroyed()) {
      bw.webContents.send('pty-output', { tabId, data });
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`PTY ${tabId} exited with code ${exitCode}, signal ${signal}`);
  });

  // Notify the owning window
  const bw = winState.win;
  if (bw && !bw.isDestroyed()) {
    bw.webContents.send('tab-created', {
      tabId, name, projectPath, cwd,
    });
  }

  return tabId;
}

function closeTab(winState, tabId) {
  const tab = winState.tabs.get(tabId);
  if (!tab) return;
  try { tab.ptyProcess.kill(); } catch (_) { /* ignore */ }
  winState.tabs.delete(tabId);
  const idx = winState.tabOrder.indexOf(tabId);
  if (idx !== -1) winState.tabOrder.splice(idx, 1);

  if (winState.activeTabId === tabId) {
    winState.activeTabId = winState.tabOrder.length > 0
      ? winState.tabOrder[winState.tabOrder.length - 1]
      : null;
  }

  const bw = winState.win;
  if (bw && !bw.isDestroyed()) {
    bw.webContents.send('tab-closed', { tabId, activeTabId: winState.activeTabId });
  }
}

function killAllPtysForWindow(winState) {
  for (const [, tab] of winState.tabs) {
    try { tab.ptyProcess.kill(); } catch (_) { /* ignore */ }
  }
  winState.tabs.clear();
  winState.tabOrder.length = 0;
  winState.activeTabId = null;
}

// ---- Utilities ----
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- Menu ----
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            const ws = getWindowState(win);
            if (!ws) return;
            const tabId = createTab(ws, null, 'Terminal');
            ws.activeTabId = tabId;
            ws.win.webContents.send('activate-tab', tabId);
          },
        },
        { type: 'separator' },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow();
            const ws = getWindowState(win);
            if (!ws) return;
            const result = await dialog.showOpenDialog(ws.win, {
              title: 'Open File',
              properties: ['openFile'],
              filters: [{ name: 'All Files', extensions: ['*'] }],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              const quoted = filePath.includes(' ') ? `"${filePath}"` : filePath;
              const p = activePty(ws);
              if (p) p.write(quoted + ' ');
            }
          },
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow();
            const ws = getWindowState(win);
            if (!ws) return;
            const result = await dialog.showOpenDialog(ws.win, {
              title: 'Open Folder',
              properties: ['openDirectory'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const folderPath = result.filePaths[0];
              const tabId = createTab(ws, folderPath, null);
              ws.activeTabId = tabId;
              ws.win.webContents.send('activate-tab', tabId);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---- Window creation ----
function createWindowData(initialProject) {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    title: 'TermPusherPad',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const ws = {
    win,
    tabs: new Map(),
    tabOrder: [],
    activeTabId: null,
  };
  windows.set(win.id, ws);

  win.on('closed', () => {
    killAllPtysForWindow(ws);
    windows.delete(win.id);
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = initialProject
      ? `${devServerUrl}#initialProject=${encodeURIComponent(initialProject)}`
      : devServerUrl;
    win.loadURL(url);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  return ws;
}

// ---- IPC Handlers ----

function getWindowForEvent(event) {
  const bw = BrowserWindow.fromWebContents(event.sender);
  return bw ? getWindowState(bw) : null;
}

// Write keystrokes to a specific tab's PTY
ipcMain.on('write-to-terminal', (event, { tabId, content }) => {
  const ws = getWindowForEvent(event);
  if (!ws) {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: false, error: 'Window not found' });
    }
    return;
  }
  const tab = ws.tabs.get(tabId);
  if (!tab) {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: false, error: 'Tab not found' });
    }
    return;
  }
  const p = tab.ptyProcess;
  (async () => {
    let offset = 0;
    while (offset < content.length) {
      const end = Math.min(offset + CHUNK_SIZE, content.length);
      p.write(content.slice(offset, end));
      offset = end;
      if (offset < content.length) await sleep(CHUNK_DELAY_MS);
    }
  })().then(() => {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: true, length: content.length, tabId });
    }
  }).catch((err) => {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: false, error: err.message, tabId });
    }
  });
});

ipcMain.on('pty-resize', (event, { tabId, cols, rows }) => {
  const ws = getWindowForEvent(event);
  if (!ws) return;
  const tab = ws.tabs.get(tabId);
  if (tab) tab.ptyProcess.resize(cols, rows);
});

ipcMain.handle('create-tab', (event, { projectPath, tabName }) => {
  const ws = getWindowForEvent(event);
  if (!ws) throw new Error('Window not found');
  const tabId = createTab(ws, projectPath || null, tabName || null);
  ws.activeTabId = tabId;
  const tab = ws.tabs.get(tabId);
  return { tabId, name: tab.name, projectPath: tab.projectPath, cwd: tab.cwd };
});

ipcMain.handle('open-new-window', (_event, { projectPath }) => {
  createWindowData(projectPath || null);
});

ipcMain.handle('close-tab', (event, { tabId }) => {
  const ws = getWindowForEvent(event);
  if (!ws) return { activeTabId: null };
  closeTab(ws, tabId);
  return { activeTabId: ws.activeTabId };
});

ipcMain.handle('switch-tab', (event, { tabId }) => {
  const ws = getWindowForEvent(event);
  if (!ws) return { tabId: null };
  if (ws.tabs.has(tabId)) {
    ws.activeTabId = tabId;
    return { tabId };
  }
  return { tabId: ws.activeTabId };
});

ipcMain.handle('get-tabs', (event) => {
  const ws = getWindowForEvent(event);
  if (!ws) return { tabs: [], activeTabId: null };
  const list = [];
  for (const tabId of ws.tabOrder) {
    const tab = ws.tabs.get(tabId);
    if (tab) {
      list.push({
        tabId,
        name: tab.name,
        projectPath: tab.projectPath,
        cwd: tab.cwd,
      });
    }
  }
  return { tabs: list, activeTabId: ws.activeTabId };
});

ipcMain.handle('get-initial-project', () => {
  return null;
});

ipcMain.handle('get-connection-info', () => {
  return { ip: getLocalIP(), port: 5173 };
});

// ---- App lifecycle ----
app.whenReady().then(() => {
  buildMenu();
  const ws = createWindowData(null);
  const tabId = createTab(ws, null, 'Terminal');
  ws.activeTabId = tabId;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWs = createWindowData(null);
      const newTabId = createTab(newWs, null, 'Terminal');
      newWs.activeTabId = newTabId;
    }
  });
});

app.on('window-all-closed', () => {
  for (const [, ws] of windows) {
    killAllPtysForWindow(ws);
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const [, ws] of windows) {
    killAllPtysForWindow(ws);
  }
});
