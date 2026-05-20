const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const pty = require('node-pty');
const { createWorker } = require('tesseract.js');
const { scanAllSessions } = require('./sessionScanner');
const { loadAllNotes, addNote, updateNote, deleteNote, generateMarkdown } = require('./noteManager');
const { summarizeQA } = require('./aiSummarizer');
const { stripAnsi } = require('./ansiStripper');

// Prevent "A JavaScript error occurred in the main process" dialog
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

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

  winState.tabs.set(tabId, { type: 'terminal', ptyProcess, projectPath, name, cwd });
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
      tabId, name, projectPath, cwd, type: 'terminal',
    });
  }

  return tabId;
}

function createCanvasTab(winState) {
  const tabId = generateTabId();
  const name = '画板';

  winState.tabs.set(tabId, { type: 'canvas', name, projectPath: null, cwd: '', aiPtyProcess: null });
  winState.tabOrder.push(tabId);

  const bw = winState.win;
  if (bw && !bw.isDestroyed()) {
    bw.webContents.send('tab-created', {
      tabId, name, projectPath: null, cwd: '', type: 'canvas',
    });
  }

  return tabId;
}

function closeTab(winState, tabId) {
  const tab = winState.tabs.get(tabId);
  if (!tab) return;
  if (tab.type === 'terminal') {
    try { tab.ptyProcess.kill(); } catch (_) { /* ignore */ }
  }
  if (tab.aiPtyProcess) {
    try { tab.aiPtyProcess.kill(); } catch (_) { /* ignore */ }
  }
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
    if (tab.type === 'terminal' || tab.ptyProcess) {
      try { tab.ptyProcess.kill(); } catch (_) { /* ignore */ }
    }
    if (tab.aiPtyProcess) {
      try { tab.aiPtyProcess.kill(); } catch (_) { /* ignore */ }
    }
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

// ---- Helpers ----
function safeWebContents(bw) {
  try { return bw && !bw.isDestroyed() ? bw.webContents : null; } catch { return null; }
}

function sendToFocused(channel, data) {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const wc = safeWebContents(win);
    if (wc) wc.send(channel, data);
  } catch (err) { console.error(`[menu] ${channel} error:`, err.message); }
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
            try {
              const win = BrowserWindow.getFocusedWindow();
              const ws = getWindowState(win);
              if (!ws) return;
              const tabId = createTab(ws, null, 'Terminal');
              ws.activeTabId = tabId;
              const wc = safeWebContents(ws.win);
              if (wc) wc.send('activate-tab', tabId);
            } catch (err) { console.error('[menu] New Tab error:', err.message); }
          },
        },
        { type: 'separator' },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            try {
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
            } catch (err) { console.error('[menu] Open File error:', err.message); }
          },
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            try {
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
                const wc = safeWebContents(ws.win);
                if (wc) wc.send('activate-tab', tabId);
              }
            } catch (err) { console.error('[menu] Open Folder error:', err.message); }
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
    {
      label: 'Draw',
      submenu: [
        {
          label: 'New Canvas',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            try {
              const win = BrowserWindow.getFocusedWindow();
              const ws = getWindowState(win);
              if (!ws) return;
              const tabId = createCanvasTab(ws);
              ws.activeTabId = tabId;
              const wc = safeWebContents(ws.win);
              if (wc) wc.send('activate-tab', tabId);
            } catch (err) { console.error('[menu] New Canvas error:', err.message); }
          },
        },
      ],
    },
    {
      label: 'Theme',
      submenu: [
        {
          label: 'Theme Settings...',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            try {
              const win = BrowserWindow.getFocusedWindow();
              const wc = safeWebContents(win);
              if (wc) wc.send('open-theme');
            } catch (err) { console.error('[menu] Theme error:', err.message); }
          },
        },
      ],
    },
    {
      label: 'Notes',
      submenu: [
        {
          label: 'Toggle Note Mode',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            try {
              const win = BrowserWindow.getFocusedWindow();
              const wc = safeWebContents(win);
              if (wc) wc.send('toggle-note-mode');
            } catch (err) { console.error('[menu] Toggle Note Mode error:', err.message); }
          },
        },
        {
          label: 'Open Notes Panel',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => {
            try {
              const win = BrowserWindow.getFocusedWindow();
              const wc = safeWebContents(win);
              if (wc) wc.send('open-notes-panel');
            } catch (err) { console.error('[menu] Open Notes Panel error:', err.message); }
          },
        },
        {
          label: 'API Settings...',
          click: () => {
            try {
              const win = BrowserWindow.getFocusedWindow();
              const wc = safeWebContents(win);
              if (wc) wc.send('open-api-settings');
            } catch (err) { console.error('[menu] API Settings error:', err.message); }
          },
        },
      ],
    },
    {
      label: 'Weather',
      submenu: [
        {
          label: 'Rain',
          submenu: [
            {
              label: 'Light Rain  🌂',
              click: () => sendToFocused('weather-change', { type: 'rain', intensity: 'light' }),
            },
            {
              label: 'Medium Rain  🌧',
              click: () => sendToFocused('weather-change', { type: 'rain', intensity: 'medium' }),
            },
            {
              label: 'Heavy Rain  ⛈',
              click: () => sendToFocused('weather-change', { type: 'rain', intensity: 'heavy' }),
            },
          ],
        },
        {
          label: 'Snow',
          submenu: [
            {
              label: 'Light Snow  ❄',
              click: () => sendToFocused('weather-change', { type: 'snow', intensity: 'light' }),
            },
            {
              label: 'Medium Snow  🌨',
              click: () => sendToFocused('weather-change', { type: 'snow', intensity: 'medium' }),
            },
            {
              label: 'Heavy Snow  ❄️',
              click: () => sendToFocused('weather-change', { type: 'snow', intensity: 'heavy' }),
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Turn Off Weather',
          click: () => sendToFocused('weather-change', { type: 'off', intensity: 'light' }),
        },
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
  if (!tab || tab.type !== 'terminal') {
    if (!event.sender.isDestroyed()) {
      event.reply('write-complete', { success: false, error: 'Tab not found or not a terminal' });
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
  if (!cols || !rows || cols < 1 || rows < 1) return;
  const ws = getWindowForEvent(event);
  if (!ws) return;
  const tab = ws.tabs.get(tabId);
  if (tab && tab.type === 'terminal') tab.ptyProcess.resize(cols, rows);
});

ipcMain.handle('create-tab', (event, { projectPath, tabName }) => {
  const ws = getWindowForEvent(event);
  if (!ws) throw new Error('Window not found');
  const tabId = createTab(ws, projectPath || null, tabName || null);
  ws.activeTabId = tabId;
  const tab = ws.tabs.get(tabId);
  return { tabId, name: tab.name, projectPath: tab.projectPath, cwd: tab.cwd, type: tab.type };
});

ipcMain.handle('create-canvas-tab', (event) => {
  const ws = getWindowForEvent(event);
  if (!ws) throw new Error('Window not found');
  const tabId = createCanvasTab(ws);
  ws.activeTabId = tabId;
  const tab = ws.tabs.get(tabId);
  return { tabId, name: tab.name, projectPath: tab.projectPath, cwd: tab.cwd, type: tab.type };
});

ipcMain.handle('spawn-ai-pty', (event, { tabId }) => {
  const ws = getWindowForEvent(event);
  if (!ws) throw new Error('Window not found');
  const tab = ws.tabs.get(tabId);
  if (!tab || tab.type !== 'canvas') throw new Error('Tab not found or not a canvas');
  if (tab.aiPtyProcess) {
    try { tab.aiPtyProcess.kill(); } catch (_) { /* ignore */ }
  }
  const aiPty = spawnPty(tab.cwd || process.env.USERPROFILE);
  tab.aiPtyProcess = aiPty;
  aiPty.onData((data) => {
    const bw = ws.win;
    if (bw && !bw.isDestroyed()) {
      bw.webContents.send('ai-pty-output', { tabId, data });
    }
  });
  aiPty.onExit(({ exitCode }) => {
    console.log(`AI PTY ${tabId} exited with code ${exitCode}`);
    tab.aiPtyProcess = null;
    const bw = ws.win;
    if (bw && !bw.isDestroyed()) {
      bw.webContents.send('ai-pty-exited', { tabId, exitCode });
    }
  });
  return { success: true };
});

ipcMain.handle('kill-ai-pty', (event, { tabId }) => {
  const ws = getWindowForEvent(event);
  if (!ws) throw new Error('Window not found');
  const tab = ws.tabs.get(tabId);
  if (tab && tab.aiPtyProcess) {
    try { tab.aiPtyProcess.kill(); } catch (_) { /* ignore */ }
    tab.aiPtyProcess = null;
  }
  return { success: true };
});

ipcMain.on('ai-pty-write', (event, { tabId, content }) => {
  const ws = getWindowForEvent(event);
  if (!ws) return;
  const tab = ws.tabs.get(tabId);
  if (!tab || !tab.aiPtyProcess) return;
  const p = tab.aiPtyProcess;
  (async () => {
    let offset = 0;
    while (offset < content.length) {
      const end = Math.min(offset + CHUNK_SIZE, content.length);
      p.write(content.slice(offset, end));
      offset = end;
      if (offset < content.length) await sleep(CHUNK_DELAY_MS);
    }
  })().catch((err) => {
    console.error('AI PTY write error:', err.message);
  });
});

ipcMain.on('ai-pty-resize', (event, { tabId, cols, rows }) => {
  const ws = getWindowForEvent(event);
  if (!ws) return;
  const tab = ws.tabs.get(tabId);
  if (tab && tab.aiPtyProcess) tab.aiPtyProcess.resize(cols, rows);
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
        cwd: tab.cwd || '',
        type: tab.type || 'terminal',
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

ipcMain.handle('scan-sessions', () => {
  return scanAllSessions();
});

ipcMain.handle('ocr-recognize', async (_event, dataUrl) => {
  const worker = await createWorker('chi_sim+eng', 1, {
    langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0/',
  });
  try {
    const { data: { text } } = await worker.recognize(dataUrl);
    return text.trim();
  } finally {
    await worker.terminate();
  }
});

ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// ---- Learning Notes IPC ----
ipcMain.handle('summarize-qa', async (_event, { question, answer, tabId, tabName, config }) => {
  try {
    const cleanedAnswer = stripAnsi(answer);
    const result = await summarizeQA({ question, answer: cleanedAnswer, config });
    if (result.error) {
      return { note: null, error: result.error };
    }
    const note = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      sessionId: tabId,
      tabId,
      tabName,
      question,
      answer: cleanedAnswer.slice(0, 5000),
      title: result.title,
      summary: result.summary,
      tags: result.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addNote(note);
    return { note, error: null };
  } catch (err) {
    return { note: null, error: err.message || 'Unknown error during summarization' };
  }
});

ipcMain.handle('load-notes', async () => {
  try { return loadAllNotes(); } catch (err) { return []; }
});

ipcMain.handle('update-note', async (_event, { noteId, updates }) => {
  try { return updateNote(noteId, updates); } catch (err) { return false; }
});

ipcMain.handle('delete-note', async (_event, { noteId }) => {
  try { return deleteNote(noteId); } catch (err) { return false; }
});

ipcMain.handle('export-notes', async (_event, { noteIds }) => {
  try {
    const allNotes = loadAllNotes();
    const selected = noteIds && noteIds.length > 0
      ? allNotes.filter(n => noteIds.includes(n.id))
      : allNotes;
    return generateMarkdown(selected);
  } catch (err) {
    return '# Export Error\n\nFailed to generate markdown.';
  }
});

ipcMain.handle('get-notes-path', async () => {
  const { getNotesFilePath } = require('./noteManager');
  return getNotesFilePath();
});

// ---- File Diff IPC ----
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.cache', '.idea', '.vscode']);
const BINARY_EXTS = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.obj', '.pyc', '.class', '.jar', '.zip', '.tar', '.gz', '.7z', '.rar', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.wasm', '.map']);

function execGit(args, cwd) {
  try {
    return execSync('git ' + args.join(' '), { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function isGitRepo(cwd) {
  try {
    execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getAllFiles(dirPath, basePath, depth = 0) {
  const files = [];
  if (depth > 12) return files;
  try {
    const names = fs.readdirSync(dirPath);
    for (const name of names) {
      if (files.length >= 2000) break;
      if (name.startsWith('.') && name !== '.env' && name !== '.env.example') continue;
      if (IGNORE_DIRS.has(name)) continue;
      const full = path.join(dirPath, name);
      const rel = path.relative(basePath, full).replace(/\\/g, '/');
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        files.push(...getAllFiles(full, basePath, depth + 1));
      } else if (stat.isFile()) {
        if (BINARY_EXTS.has(path.extname(name).toLowerCase())) continue;
        if (stat.size > 2 * 1024 * 1024) continue;
        files.push(rel);
      }
    }
  } catch { /* permission error */ }
  return files;
}

let gTreeFileCount = 0;
function buildFileTree(dirPath, basePath, changedSet, depth = 0) {
  const entries = [];
  if (depth > 12 || gTreeFileCount >= 3000) return entries;
  try {
    const names = fs.readdirSync(dirPath);
    for (const name of names) {
      if (gTreeFileCount >= 3000) break;
      if (name.startsWith('.') && name !== '.env' && name !== '.env.example') continue;
      if (IGNORE_DIRS.has(name)) continue;
      const full = path.join(dirPath, name);
      const rel = path.relative(basePath, full).replace(/\\/g, '/');
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        const children = buildFileTree(full, basePath, changedSet, depth + 1);
        if (children.length > 0 || changedSet.has(rel)) {
          entries.push({ name, path: rel, isDir: true, children, changed: false });
        }
      } else if (stat.isFile()) {
        // Skip binary-looking files
        const ext = path.extname(name).toLowerCase();
        if (BINARY_EXTS.has(ext)) continue;
        if (stat.size > 2 * 1024 * 1024) continue; // skip >2MB
        gTreeFileCount++;
        entries.push({ name, path: rel, isDir: false, children: [], changed: changedSet.has(rel) });
      }
    }
  } catch { /* permission error etc */ }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

ipcMain.handle('get-changed-files', (_event, cwd) => {
  if (!isGitRepo(cwd)) {
    // For non-git repos, only return files that would appear in a shallow scan
    return getAllFiles(cwd, cwd).slice(0, 500);
  }
  const unstaged = execGit(['diff', '--name-only'], cwd);
  const staged = execGit(['diff', '--name-only', '--cached'], cwd);
  const changed = new Set([
    ...(unstaged ? unstaged.split('\n').map(s => s.trim().replace(/\\/g, '/')) : []),
    ...(staged ? staged.split('\n').map(s => s.trim().replace(/\\/g, '/')) : []),
  ]);
  return [...changed].filter(Boolean);
});

ipcMain.handle('get-file-tree', (_event, cwd) => {
  gTreeFileCount = 0;
  let changedSet;
  if (!isGitRepo(cwd)) {
    // Don't pre-scan all files for non-git repos — too slow for large dirs.
    // Individual file diffs will still show all-green on demand.
    changedSet = new Set();
  } else {
    const changed = execGit(['diff', '--name-only'], cwd);
    const staged = execGit(['diff', '--name-only', '--cached'], cwd);
    changedSet = new Set([
      ...(changed ? changed.split('\n').map(s => s.trim().replace(/\\/g, '/')) : []),
      ...(staged ? staged.split('\n').map(s => s.trim().replace(/\\/g, '/')) : []),
    ].filter(Boolean));
  }
  return buildFileTree(cwd, cwd, changedSet);
});

ipcMain.handle('get-file-diff', (_event, cwd, filePath) => {
  if (!isGitRepo(cwd)) {
    // Non-git: entire file is treated as new (all green)
    try {
      const fullPath = path.join(cwd, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      return {
        file: filePath,
        diff: [{
          oldStart: 0, oldLines: 0,
          newStart: 1, newLines: lines.length,
          lines: lines.map((content, i) => ({ type: 'add', newLine: i + 1, content })),
        }],
        staged: [],
      };
    } catch {
      return { file: filePath, diff: [], staged: [] };
    }
  }

  const diff = execGit(['diff', '--', filePath], cwd);
  const staged = execGit(['diff', '--cached', '--', filePath], cwd);

  const parseHunks = (text) => {
    const lines = text.split('\n');
    const hunks = [];
    let cur = null;
    for (const line of lines) {
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (m) {
          cur = {
            oldStart: parseInt(m[1], 10),
            oldLines: parseInt(m[2] || '1', 10),
            newStart: parseInt(m[3], 10),
            newLines: parseInt(m[4] || '1', 10),
            lines: [],
          };
          hunks.push(cur);
        }
      } else if (cur) {
        if (line.startsWith('+')) {
          cur.lines.push({ type: 'add', newLine: cur.newStart + cur.lines.filter(l => l.type !== 'delete').length, content: line.slice(1) });
        } else if (line.startsWith('-')) {
          cur.lines.push({ type: 'delete', oldLine: cur.oldStart + cur.lines.filter(l => l.type === 'delete' || l.type === 'context').length, content: line.slice(1) });
        } else if (line.startsWith(' ') || line === '') {
          cur.lines.push({ type: 'context', oldLine: cur.oldStart + cur.lines.filter(l => l.type === 'delete' || l.type === 'context').length, newLine: cur.newStart + cur.lines.filter(l => l.type !== 'delete').length, content: line.slice(1) });
        }
      }
    }
    return hunks;
  };

  return {
    file: filePath,
    diff: parseHunks(diff),
    staged: parseHunks(staged),
  };
});

ipcMain.handle('read-file', (_event, filePath) => {
  try {
    return { content: fs.readFileSync(filePath, 'utf-8'), error: null };
  } catch (err) {
    return { content: '', error: err.message };
  }
});

ipcMain.handle('write-file', (_event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('revert-file', (_event, cwd, filePath) => {
  if (!isGitRepo(cwd)) {
    return { success: false, error: 'Not a git repository — cannot revert' };
  }
  try {
    execGit(['checkout', '--', filePath], cwd);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('resolve-path', (_event, cwd, target) => {
  try {
    if (path.isAbsolute(target)) {
      const resolved = path.resolve(target);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
      return resolved; // return anyway, might be a new dir
    }
    const resolved = path.resolve(cwd, target);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
    return resolved;
  } catch {
    return null;
  }
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
