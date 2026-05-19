interface ElectronAPI {
  writeToTerminal: (content: string) => void;
  onTerminalOutput: (callback: (data: string) => void) => () => void;
  onWriteComplete: (callback: (result: { success: boolean; length?: number; error?: string }) => void) => () => void;
  ptyResize: (cols: number, rows: number) => void;
  getConnectionInfo: () => Promise<{ ip: string; port: number }>;
}

interface Window {
  electronAPI: ElectronAPI;
}
