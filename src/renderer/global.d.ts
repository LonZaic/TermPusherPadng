interface APIConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface LearningNote {
  id: string;
  sessionId: string;
  tabId: string;
  tabName: string;
  question: string;
  answer: string;
  title: string;
  summary: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface TabInfo {
  tabId: string;
  name: string;
  projectPath: string | null;
  cwd: string;
  type: 'terminal' | 'canvas';
}

interface SessionEntry {
  id: string;
  tool: 'cc' | 'codex' | 'reasonix';
  toolName: string;
  title: string;
  subtitle: string;
  cwd: string;
  projectPath: string;
  startedAt: number;
  updatedAt: number;
  kind: string;
  status: string;
}

interface SessionScanResult {
  cc: SessionEntry[];
  codex: SessionEntry[];
  reasonix: SessionEntry[];
  total: number;
}

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[];
  changed: boolean;
}

interface DiffLine {
  type: 'add' | 'delete' | 'context';
  oldLine?: number;
  newLine?: number;
  content: string;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface FileDiffResult {
  file: string;
  diff: DiffHunk[];
  staged: DiffHunk[];
}

interface ElectronAPI {
  writeToTerminal: (tabId: string, content: string) => void;
  onPtyOutput: (callback: (tabId: string, data: string) => void) => () => void;
  onWriteComplete: (callback: (result: { success: boolean; length?: number; error?: string; tabId?: string }) => void) => () => void;
  ptyResize: (tabId: string, cols: number, rows: number) => void;
  createTab: (projectPath: string | null, tabName: string | null) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<{ activeTabId: string }>;
  switchTab: (tabId: string) => Promise<{ tabId: string }>;
  getTabs: () => Promise<{ tabs: TabInfo[]; activeTabId: string }>;
  onTabCreated: (callback: (tab: TabInfo) => void) => () => void;
  onTabClosed: (callback: (data: { tabId: string; activeTabId: string }) => void) => () => void;
  onActivateTab: (callback: (tabId: string) => void) => () => void;
  openNewWindow: (projectPath: string | null) => Promise<void>;
  getConnectionInfo: () => Promise<{ ip: string; port: number }>;
  scanSessions: () => Promise<SessionScanResult>;
  createCanvasTab: () => Promise<TabInfo>;
  spawnAiPty: (tabId: string) => Promise<{ success: boolean }>;
  killAiPty: (tabId: string) => Promise<{ success: boolean }>;
  aiPtyWrite: (tabId: string, content: string) => void;
  aiPtyResize: (tabId: string, cols: number, rows: number) => void;
  onAiPtyOutput: (callback: (tabId: string, data: string) => void) => () => void;
  onAiPtyExited: (callback: (tabId: string, exitCode: number) => void) => () => void;
  ocrRecognize: (dataUrl: string) => Promise<string>;
  openExternal: (url: string) => void;
  onOpenTheme: (callback: () => void) => () => void;
  // Learning Notes
  summarizeQA: (params: {
    question: string;
    answer: string;
    tabId: string;
    tabName: string;
    config: APIConfig;
  }) => Promise<{ note: LearningNote | null; error?: string }>;
  loadNotes: () => Promise<LearningNote[]>;
  updateNote: (noteId: string, updates: Partial<LearningNote>) => Promise<boolean>;
  deleteNote: (noteId: string) => Promise<boolean>;
  exportNotes: (noteIds: string[]) => Promise<string>;
  getNotesPath: () => Promise<string>;
  onToggleNoteMode: (callback: () => void) => () => void;
  onOpenNotesPanel: (callback: () => void) => () => void;
  onOpenAPISettings: (callback: () => void) => () => void;
  onNoteGenerated: (callback: (note: LearningNote) => void) => () => void;
  // File Diff
  getChangedFiles: (cwd: string) => Promise<string[]>;
  getFileTree: (cwd: string) => Promise<FileNode[]>;
  getFileDiff: (cwd: string, filePath: string) => Promise<FileDiffResult>;
  readFile: (filePath: string) => Promise<{ content: string; error: string | null }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  revertFile: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
  resolvePath: (cwd: string, target: string) => Promise<string | null>;
}

interface Window {
  electronAPI: ElectronAPI;
}
