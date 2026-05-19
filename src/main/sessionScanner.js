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
 * Extract the first meaningful user message from a Claude Code jsonl conversation file.
 */
function extractCCSessionTitle(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n');
    for (const line of lines) {
      const entry = JSON.parse(line);
      // Look for the first user message
      if (entry.role === 'user' && entry.content && typeof entry.content === 'string') {
        const text = entry.content.trim();
        if (text.length > 0 && text.length < 120) return text;
        if (text.length >= 120) return text.slice(0, 117) + '...';
      }
      // Also check for array content (multimodal)
      if (entry.role === 'user' && Array.isArray(entry.content)) {
        for (const block of entry.content) {
          if (block.type === 'text' && block.text) {
            const t = block.text.trim();
            if (t.length > 0 && t.length < 120) return t;
            if (t.length >= 120) return t.slice(0, 117) + '...';
          }
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Get project name from a workspace path hash by looking at the sessions metadata
 */
function getProjectNameFromCwd(cwd) {
  if (!cwd) return null;
  const parts = cwd.split(/[\\/]/);
  return parts[parts.length - 1] || cwd;
}

// ============================================================
// Claude Code sessions
// ============================================================
function scanClaudeCodeSessions() {
  const sessionsDir = path.join(HOME, '.claude', 'sessions');
  const projectsDir = path.join(HOME, '.claude', 'projects');
  const results = [];

  const sessionFiles = listDirSafe(sessionsDir).filter((f) => f.endsWith('.json'));
  if (sessionFiles.length === 0) return results;

  // Build a map of project hash -> session title from jsonl files
  const titleCache = new Map();

  for (const file of sessionFiles) {
    const sessionData = readJsonSafe(path.join(sessionsDir, file));
    if (!sessionData || !sessionData.sessionId) continue;

    const { sessionId, cwd, startedAt, updatedAt, kind, status } = sessionData;

    // Try to find a title from conversation files
    let title = null;
    if (!titleCache.has(sessionId)) {
      // Search projects directory for matching jsonl
      const projectDirs = listDirSafe(projectsDir);
      for (const dir of projectDirs) {
        const projectSessionPath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
        const titleFromFile = extractCCSessionTitle(projectSessionPath);
        if (titleFromFile) {
          title = titleFromFile;
          titleCache.set(sessionId, title);
          break;
        }
        // Also check with partial match
        const dirFiles = listDirSafe(path.join(projectsDir, dir));
        const match = dirFiles.find((f) => f.startsWith(sessionId) || f.includes(sessionId));
        if (match) {
          const t = extractCCSessionTitle(path.join(projectsDir, dir, match));
          if (t) {
            title = t;
            titleCache.set(sessionId, t);
            break;
          }
        }
      }
    } else {
      title = titleCache.get(sessionId);
    }

    const projectName = getProjectNameFromCwd(cwd);

    results.push({
      id: sessionId,
      tool: 'cc',
      toolName: 'Claude Code',
      title: title || projectName || `会话 ${file.replace('.json', '')}`,
      subtitle: projectName || cwd || '',
      cwd: cwd || '',
      startedAt: startedAt || 0,
      updatedAt: updatedAt || startedAt || 0,
      kind: kind || 'interactive',
      status: status || 'unknown',
    });
  }

  // Sort by most recent first
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
      // Codex stores sessions as directories with metadata.json
      const meta = readJsonSafe(path.join(entryPath, 'metadata.json'));
      if (meta) {
        results.push({
          id: meta.id || entry,
          tool: 'codex',
          toolName: 'Codex',
          title: meta.title || entry,
          subtitle: meta.cwd ? getProjectNameFromCwd(meta.cwd) : entry,
          cwd: meta.cwd || '',
          startedAt: meta.startedAt ? new Date(meta.startedAt).getTime() : stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
          kind: 'interactive',
          status: 'idle',
        });
      }
    } else if (entry.endsWith('.json')) {
      const data = readJsonSafe(entryPath);
      if (data && data.id) {
        results.push({
          id: data.id || entry.replace('.json', ''),
          tool: 'codex',
          toolName: 'Codex',
          title: data.title || data.name || entry.replace('.json', ''),
          subtitle: data.cwd ? getProjectNameFromCwd(data.cwd) : '',
          cwd: data.cwd || '',
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
        results.push({
          id: data.id || data.sessionId || entry,
          tool: 'reasonix',
          toolName: 'Reasonix',
          title: data.title || data.name || entry,
          subtitle: data.cwd ? getProjectNameFromCwd(data.cwd) : entry,
          cwd: data.cwd || '',
          startedAt: data.startedAt ? new Date(data.startedAt).getTime() : stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
          kind: 'interactive',
          status: 'idle',
        });
      }
    } else if (entry.endsWith('.json')) {
      const data = readJsonSafe(entryPath);
      if (data) {
        results.push({
          id: data.id || data.sessionId || entry.replace('.json', ''),
          tool: 'reasonix',
          toolName: 'Reasonix',
          title: data.title || data.name || entry.replace('.json', ''),
          subtitle: data.cwd ? getProjectNameFromCwd(data.cwd) : '',
          cwd: data.cwd || '',
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
