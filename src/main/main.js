const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 10;

let mainWindow = null;

// ---- Tab / PTY management ----
const tabs = new Map();
const tabOrder = [];
let activeTabId = null;

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

function activePty() {
  if (!activeTabId) return null;
  const tab = tabs.get(activeTabId);
  return tab ? tab.ptyProcess : null;
}

function createTab(projectPath, tabName) {
  const tabId = generateTabId();
  const cwd = projectPath || process.env.USERPROFILE;
  const ptyProcess = spawnPty(cwd);

  const folderName = projectPath ? path.basename(projectPath) : 'Terminal';
  const name = tabName || folderName;

  tabs.set(tabId, { ptyProcess, projectPath, name, cwd });
  tabOrder.push(tabId);

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty-output', { tabId, data });
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`PTY ${tabId} exited with code ${exitCode}, signal ${signal}`);
  });

  // Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tab-created', {
      tabId, name, projectPath, cwd,
    });
  }

  return tabId;
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  try { tab.ptyProcess.kill(); } catch (_) { /* ignore */ }
  tabs.delete(tabId);
  const idx = tabOrder.indexOf(tabId);
  if (idx !== -1) tabOrder.splice(idx, 1);

  if (activeTabId === tabId) {
    activeTabId = tabOrder.length > 0 ? tabOrder[tabOrder.length - 1] : null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tab-closed', { tabId, activeTabId });
  }
}

function killAllPtys() {
  for (const [, tab] of tabs) {
    try { tab.ptyProcess.kill(); } catch (_) { /* ignore */ }
  }
  tabs.clear();
  tabOrder.length = 0;
  activeTabId = null;
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
            const tabId = createTab(null, 'Terminal');
            activeTabId = tabId;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('activate-tab', tabId);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Open File',
              properties: ['openFile'],
              filters: [{ name: 'All Files', extensions: ['*'] }],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              const quoted = filePath.includes(' ') ? `"${filePath}"` : filePath;
              const p = activePty();
              if (p) p.write(quoted + ' ');
            }
          },
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Open Folder',
              properties: ['openDirectory'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const folderPath = result.filePaths[0];
              const tabId = createTab(folderPath, null);
              activeTabId = tabId;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('activate-tab', tabId);
              }
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

// ---- Window ----
function createWindow(initialProject) {
  mainWindow = new BrowserWindow({
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = initialProject
      ? `${devServerUrl}#initialProject=${encodeURIComponent(initialProject)}`
      : devServerUrl;
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

function createNewWindow(projectPath) {
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = projectPath
      ? `${devServerUrl}#initialProject=${encodeURIComponent(projectPath)}`
      : devServerUrl;
    win.loadURL(url);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

// ---- IPC handlers ----

// Write keystrokes to a specific tab's PTY
ipcMain.on('write-to-terminal', (event, { tabId, content }) => {
  const tab = tabs.get(tabId);
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

ipcMain.on('pty-resize', (_event, { tabId, cols, rows }) => {
  const tab = tabs.get(tabId);
  if (tab) tab.ptyProcess.resize(cols, rows);
});

// Create a new tab
ipcMain.handle('create-tab', (_event, { projectPath, tabName }) => {
  const tabId = createTab(projectPath || null, tabName || null);
  activeTabId = tabId;
  const tab = tabs.get(tabId);
  return { tabId, name: tab.name, projectPath: tab.projectPath, cwd: tab.cwd };
});

// Open in new window
ipcMain.handle('open-new-window', (_event, { projectPath }) => {
  createNewWindow(projectPath || null);
});

// Close a tab
ipcMain.handle('close-tab', (_event, { tabId }) => {
  closeTab(tabId);
  return { activeTabId };
});

// Switch to a tab
ipcMain.handle('switch-tab', (_event, { tabId }) => {
  if (tabs.has(tabId)) {
    activeTabId = tabId;
    return { tabId };
  }
  return { tabId: activeTabId };
});

// Get all tabs (for renderer init)
ipcMain.handle('get-tabs', () => {
  const list = [];
  for (const tabId of tabOrder) {
    const tab = tabs.get(tabId);
    if (tab) {
      list.push({
        tabId,
        name: tab.name,
        projectPath: tab.projectPath,
        cwd: tab.cwd,
      });
    }
  }
  return { tabs: list, activeTabId };
});

// Get the initial project from the URL hash (for new windows)
ipcMain.handle('get-initial-project', () => {
  // This is handled by the renderer reading window.location.hash
  return null;
});

// Connection info
ipcMain.handle('get-connection-info', () => {
  return { ip: getLocalIP(), port: 5173 };
});

// ---- App lifecycle ----
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  // Default tab
  const tabId = createTab(null, 'Terminal');
  activeTabId = tabId;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      const newTabId = createTab(null, 'Terminal');
      activeTabId = newTabId;
    }
  });
});

app.on('window-all-closed', () => {
  killAllPtys();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killAllPtys();
});
