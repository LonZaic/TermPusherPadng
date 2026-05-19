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
}

interface Window {
  electronAPI: ElectronAPI;
}
