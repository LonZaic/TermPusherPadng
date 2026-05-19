const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 10;

let mainWindow = null;
let ptyProcess = null;

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

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Open File',
              properties: ['openFile'],
              filters: [
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              const quoted = filePath.includes(' ') ? `"${filePath}"` : filePath;
              if (ptyProcess) ptyProcess.write(quoted + ' ');
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
              if (ptyProcess) ptyProcess.write(`cd /d "${folderPath}"\r`);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
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
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

function initPty() {
  const shell = process.env.COMSPEC || 'cmd.exe';

  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.USERPROFILE,
    env: process.env,
    useConpty: true,
    conptyInheritCursor: false,
  });

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-output', data);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`PTY exited with code ${exitCode}, signal ${signal}`);
  });
}

async function writeToTerminal(content) {
  if (!ptyProcess) {
    console.error('PTY not initialized');
    return;
  }

  const totalLength = content.length;
  let offset = 0;

  while (offset < totalLength) {
    const end = Math.min(offset + CHUNK_SIZE, totalLength);
    const chunk = content.slice(offset, end);
    ptyProcess.write(chunk);
    offset = end;

    if (offset < totalLength) {
      await sleep(CHUNK_DELAY_MS);
    }
  }
}

ipcMain.on('write-to-terminal', (event, content) => {
  writeToTerminal(content).then(() => {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: true, length: content.length });
    }
  }).catch((err) => {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: false, error: err.message });
    }
  });
});

ipcMain.on('pty-resize', (_event, { cols, rows }) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
});

ipcMain.handle('get-connection-info', () => {
  return {
    ip: getLocalIP(),
    port: 5173,
  };
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  initPty();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (ptyProcess) {
    ptyProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (ptyProcess) {
    ptyProcess.kill();
  }
});
