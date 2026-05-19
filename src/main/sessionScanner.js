const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function listDirSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function statSafe(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Decode Claude Code's project directory name back to a readable path.
 * Claude Code encodes paths like "E:\\CCBar" → "E--CCBar"
 * by replacing ':' and '\\' with '-'.
 */
function decodeProjectDirName(dirName) {
  // Each directory segment was joined with '--' and drive colon replaced
  // Examples: "E--CCBar" → "E:/CCBar", "C--Users----" → "C:/Users/..."
  // We try to reconstruct a reasonable short name
  const parts = dirName.split('--');
  if (parts.length === 2 && parts[0].length === 1) {
    // Drive letter: E--CCBar → E:\CCBar
    return parts[1] || dirName;
  }
  if (parts.length >= 2) {
    // Multi-folder path: take the last meaningful segment
    return parts[parts.length - 1] || dirName;
  }
  return dirName;
}

/**
 * Extract the first user message from a Claude Code jsonl file.
 * Returns null if no user message found.
 */
function extractTitleFromJsonl(filePath) {
  // Only read the first ~200 lines to keep it fast for large files
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32768); // 32KB header read
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const raw = buf.slice(0, bytesRead).toString('utf-8');
    const lines = raw.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.role === 'user') {
          if (typeof entry.content === 'string' && entry.content.trim()) {
            const text = entry.content.trim();
            return text.length <= 100 ? text : text.slice(0, 97) + '...';
          }
          if (Array.isArray(entry.content)) {
            for (const block of entry.content) {
              if (block.type === 'text' && block.text && block.text.trim()) {
                const t = block.text.trim();
                return t.length <= 100 ? t : t.slice(0, 97) + '...';
              }
            }
          }
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* skip unreadable files */ }
  return null;
}

// ============================================================
// Claude Code sessions — scan ALL jsonl files in ALL projects
// ============================================================
function scanClaudeCodeSessions() {
  const projectsDir = path.join(HOME, '.claude', 'projects');
  const sessionsDir = path.join(HOME, '.claude', 'sessions');
  const results = [];

  // Build a lookup from session JSON files: sessionId → {cwd, startedAt, kind}
  const sessionMeta = new Map();
  const sessionFiles = listDirSafe(sessionsDir).filter((f) => f.endsWith('.json'));
  for (const file of sessionFiles) {
    const data = readJsonSafe(path.join(sessionsDir, file));
    if (data && data.sessionId) {
      sessionMeta.set(data.sessionId, {
        cwd: data.cwd || '',
        startedAt: data.startedAt || 0,
        kind: data.kind || 'interactive',
      });
    }
  }

  // Scan each project directory for jsonl files
  const projectDirs = listDirSafe(projectsDir);
  for (const dirName of projectDirs) {
    const projectDir = path.join(projectsDir, dirName);
    const stat = statSafe(projectDir);
    if (!stat || !stat.isDirectory()) continue;

    const projectName = decodeProjectDirName(dirName);

    const files = listDirSafe(projectDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(projectDir, file);
      const fileStat = statSafe(filePath);
      if (!fileStat || fileStat.size < 100) continue; // skip tiny/empty files

      const meta = sessionMeta.get(sessionId);
      const title = extractTitleFromJsonl(filePath);

      results.push({
        id: sessionId,
        tool: 'cc',
        toolName: 'Claude Code',
        title: title || `会话 ${sessionId.slice(0, 8)}`,
        subtitle: projectName || (meta ? meta.cwd : ''),
        cwd: meta ? meta.cwd : '',
        startedAt: meta ? meta.startedAt : fileStat.birthtimeMs,
        updatedAt: fileStat.mtimeMs,
        kind: meta ? meta.kind : 'interactive',
        status: 'idle',
      });
    }
  }

  // Sort newest first
  results.sort((a, b) => b.updatedAt - a.updatedAt);
  return results;
}

// ============================================================
// Codex sessions
// ============================================================
function scanCodexSessions() {
  const sessionsDir = path.join(HOME, '.codex', 'sessions');
  const results = [];

  const entries = listDirSafe(sessionsDir);
  for (const entry of entries) {
    const entryPath = path.join(sessionsDir, entry);
    const stat = statSafe(entryPath);
    if (!stat) continue;

    if (stat.isDirectory()) {
      const meta = readJsonSafe(path.join(entryPath, 'metadata.json'));
      const sessionJson = readJsonSafe(path.join(entryPath, 'session.json'));
      const data = meta || sessionJson;
      if (data) {
        const cwd = data.cwd || '';
        results.push({
          id: data.id || data.sessionId || entry,
          tool: 'codex',
          toolName: 'Codex',
          title: data.title || data.name || entry,
          subtitle: cwd ? (cwd.split(/[\\/]/).pop() || cwd) : entry,
          cwd,
          startedAt: data.startedAt ? new Date(data.startedAt).getTime() : stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
          kind: 'interactive',
          status: 'idle',
        });
      }
    } else if (entry.endsWith('.json')) {
      const data = readJsonSafe(entryPath);
      if (data && (data.id || data.sessionId)) {
        const cwd = data.cwd || '';
        results.push({
          id: data.id || data.sessionId || entry.replace('.json', ''),
          tool: 'codex',
          toolName: 'Codex',
          title: data.title || data.name || entry.replace('.json', ''),
          subtitle: cwd ? (cwd.split(/[\\/]/).pop() || cwd) : '',
          cwd,
          startedAt: data.startedAt ? new Date(data.startedAt).getTime() : stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
          kind: 'interactive',
          status: 'idle',
        });
      }
    }
  }

  results.sort((a, b) => b.updatedAt - a.updatedAt);
  return results;
}

// ============================================================
// Reasonix sessions
// ============================================================
function scanReasonixSessions() {
  const sessionsDir = path.join(HOME, '.reasonix', 'sessions');
  const results = [];

  const entries = listDirSafe(sessionsDir);
  for (const entry of entries) {
    const entryPath = path.join(sessionsDir, entry);
    const stat = statSafe(entryPath);
    if (!stat) continue;

    if (stat.isDirectory()) {
      const meta = readJsonSafe(path.join(entryPath, 'metadata.json'));
      const sessionJson = readJsonSafe(path.join(entryPath, 'session.json'));
      const data = meta || sessionJson;
      if (data) {
        const cwd = data.cwd || '';
        results.push({
          id: data.id || data.sessionId || entry,
          tool: 'reasonix',
          toolName: 'Reasonix',
          title: data.title || data.name || entry,
          subtitle: cwd ? (cwd.split(/[\\/]/).pop() || cwd) : '',
          cwd,
          startedAt: data.startedAt ? new Date(data.startedAt).getTime() : stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
          kind: 'interactive',
          status: 'idle',
        });
      }
    } else if (entry.endsWith('.json')) {
      const data = readJsonSafe(entryPath);
      if (data) {
        const cwd = data.cwd || '';
        results.push({
          id: data.id || data.sessionId || entry.replace('.json', ''),
          tool: 'reasonix',
          toolName: 'Reasonix',
          title: data.title || data.name || entry.replace('.json', ''),
          subtitle: cwd ? (cwd.split(/[\\/]/).pop() || cwd) : '',
          cwd,
          startedAt: data.createdAt || data.startedAt ? new Date(data.createdAt || data.startedAt).getTime() : stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
          kind: 'interactive',
          status: 'idle',
        });
      }
    }
  }

  results.sort((a, b) => b.updatedAt - a.updatedAt);
  return results;
}

// ============================================================
// Unified scan
// ============================================================
function scanAllSessions() {
  const cc = scanClaudeCodeSessions();
  const codex = scanCodexSessions();
  const reasonix = scanReasonixSessions();

  return {
    cc,
    codex,
    reasonix,
    total: cc.length + codex.length + reasonix.length,
  };
}

module.exports = { scanAllSessions, scanClaudeCodeSessions, scanCodexSessions, scanReasonixSessions };
