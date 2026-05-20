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
 * Reconstruct the full project path from Claude Code's encoded directory name.
 * Claude Code encodes "E:\\CCBar" → "E--CCBar" (':' → '-', '\\' → '-')
 * This function reverses it: "E--CCBar" → "E:\\CCBar"
 */
function decodeProjectPath(dirName) {
  // Filter empty segments caused by consecutive dashes in the encoded name.
  // "C--Users--xxx" → ['C','Users','xxx']; "C--Users----" (truncated) → ['C','Users']
  const parts = dirName.split('--').filter(p => p.length > 0);
  if (parts.length >= 3 && parts[0].length === 1) {
    // Multi-segment path: drive + at least two folders — trustworthy
    return parts[0] + ':\\' + parts.slice(1).join('\\');
  }
  if (parts.length === 2 && parts[0].length === 1) {
    // Two segments: drive + one folder
    const reconstructed = parts[0] + ':\\' + parts.slice(1).join('\\');
    // Reject "X:\\Users" — almost certainly a truncated home directory
    if (reconstructed.toLowerCase().endsWith(':\\users')) {
      return null;
    }
    return reconstructed;
  }
  return null;
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

/**
 * Scan a Claude Code jsonl file for absolute Windows file paths
 * referenced in tool_use entries, and return the most likely
 * project root directory.
 *
 * Used as a fallback when the encoded project directory name
 * can't be decoded (e.g. C--Users---- where the tail is truncated).
 */
function extractProjectPathFromJsonl(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat || stat.size < 100) return null;

    const fd = fs.openSync(filePath, 'r');
    // Read first 512KB + last 256KB to catch both early and late file refs
    const headSize = Math.min(524288, stat.size);
    const tailSize = stat.size > headSize ? Math.min(262144, stat.size - headSize) : 0;
    const bufSize = headSize + tailSize;
    const buf = Buffer.alloc(bufSize);
    const headRead = fs.readSync(fd, buf, 0, headSize, 0);
    let totalRead = headRead;
    if (tailSize > 0) {
      totalRead += fs.readSync(fd, buf, headRead, tailSize, stat.size - tailSize);
    }
    fs.closeSync(fd);

    const raw = buf.slice(0, totalRead).toString('utf-8');

    // Track candidate directories: key → { count, depth }
    const candidates = new Map();
    // JSON-escaped paths in the raw text use \\ as path separator.
    // Capture the entire value string, then JSON.parse it to unescape.
    const RE_FILE_PATH = /"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let match;
    while ((match = RE_FILE_PATH.exec(raw)) !== null) {
      let fp;
      try {
        fp = JSON.parse('"' + match[1] + '"');
      } catch {
        continue;
      }
      // Only process absolute Windows paths (X:\...)
      if (!/^[A-Za-z]:\\/.test(fp)) continue;
      const parts = fp.split('\\').filter(p => p.length > 0);
      if (parts.length < 2) continue;
      // Generate candidates at depths 2 through min(len-1, 5)
      // depth=2 → X:\folder, depth=3 → X:\folder\sub, etc.
      for (let depth = 2; depth <= Math.min(parts.length - 1, 5); depth++) {
        const candidate = parts.slice(0, depth).join('\\');
        const prev = candidates.get(candidate) || { count: 0, depth };
        prev.count++;
        candidates.set(candidate, prev);
      }
    }

    if (candidates.size === 0) return null;

    // Score = count × depth — prefer deeper paths backed by many files
    let best = null;
    let bestScore = 0;
    for (const [candidate, { count, depth }] of candidates) {
      // Skip C:\Users — that's the home directory, not a project
      if (candidate.toLowerCase().startsWith('c:\\users')) continue;
      const score = count * depth;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  } catch {
    return null;
  }
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

      const decodedPath = decodeProjectPath(dirName);
      const sessionCwd = meta ? meta.cwd : '';

      // If the directory name couldn't be decoded, try extracting
      // the real project path from file references in the jsonl
      let projectPath = decodedPath;
      if (!projectPath) {
        projectPath = extractProjectPathFromJsonl(filePath);
      }
      if (!projectPath) {
        projectPath = sessionCwd;
      }

      results.push({
        id: sessionId,
        tool: 'cc',
        toolName: 'Claude Code',
        title: title || `会话 ${sessionId.slice(0, 8)}`,
        subtitle: projectName || sessionCwd,
        cwd: sessionCwd,
        projectPath,
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
