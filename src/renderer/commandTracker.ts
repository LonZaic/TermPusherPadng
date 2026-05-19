const RECENT_KEY = 'term-pusher-recent-commands';
const FREQ_KEY = 'term-pusher-cmd-freq';
const PROJECTS_KEY = 'term-pusher-recent-projects';
const MAX_RECENT = 30;
const MAX_PROJECTS = 8;

export interface RecentCommand {
  command: string;
  timestamp: number;
  source: 'panel' | 'terminal';
}

export interface RecentProject {
  path: string;
  name: string;
  timestamp: number;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Recent commands ----

export function addRecentCommand(command: string, source: 'panel' | 'terminal') {
  const list = loadJson<RecentCommand[]>(RECENT_KEY, []);
  // Remove duplicate if exists
  const filtered = list.filter((c) => c.command !== command);
  filtered.unshift({ command, timestamp: Date.now(), source });
  // Keep max
  saveJson(RECENT_KEY, filtered.slice(0, MAX_RECENT));
}

export function getRecentCommands(): RecentCommand[] {
  const list = loadJson<RecentCommand[]>(RECENT_KEY, []);
  // Deduplicate by command (keep first = most recent)
  const seen = new Set<string>();
  const result: RecentCommand[] = [];
  for (const c of list) {
    if (!seen.has(c.command)) {
      seen.add(c.command);
      result.push(c);
    }
  }
  return result.slice(0, 15);
}

export function clearRecentCommands() {
  localStorage.removeItem(RECENT_KEY);
}

// ---- Click frequency ----

export function addCommandClick(command: string) {
  const map = loadJson<Record<string, number>>(FREQ_KEY, {});
  map[command] = (map[command] || 0) + 1;
  saveJson(FREQ_KEY, map);
}

export function getCommandFrequencies(): Record<string, number> {
  return loadJson<Record<string, number>>(FREQ_KEY, {});
}

export function clearFrequencies() {
  localStorage.removeItem(FREQ_KEY);
}

// ---- Recent projects ----

export function addRecentProject(projectPath: string) {
  const list = loadJson<RecentProject[]>(PROJECTS_KEY, []);
  const filtered = list.filter((p) => p.path !== projectPath);
  const name = projectPath.split(/[\\/]/).pop() || projectPath;
  filtered.unshift({ path: projectPath, name, timestamp: Date.now() });
  saveJson(PROJECTS_KEY, filtered.slice(0, MAX_PROJECTS));
}

export function getRecentProjects(): RecentProject[] {
  return loadJson<RecentProject[]>(PROJECTS_KEY, []);
}

export function clearRecentProjects() {
  localStorage.removeItem(PROJECTS_KEY);
}
