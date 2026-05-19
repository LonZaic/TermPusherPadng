import React, { useCallback, useRef, useState, useEffect } from 'react';
import TerminalPanel from './TerminalPanel';
import CommandPanel from './CommandPanel';
import './App.css';

function App() {
  const [status, setStatus] = useState('就绪');
  const [writing, setWriting] = useState(false);
  const [writtenBytes, setWrittenBytes] = useState(0);
  const termRef = useRef<{ focus: () => void }>(null);

  useEffect(() => {
    const cleanup = window.electronAPI.onWriteComplete((result) => {
      setWriting(false);
      if (result.success) {
        setStatus(`已写入 ${result.length} 字符`);
        setWrittenBytes((prev) => prev + (result.length || 0));
      } else {
        setStatus(`写入失败: ${result.error}`);
      }
    });
    return cleanup;
  }, []);

  const handleWriteCommand = useCallback((command: string) => {
    if (writing) return;
    setWriting(true);
    setStatus(`正在写入: ${command.length > 40 ? command.slice(0, 40) + '...' : command}`);
    window.electronAPI.writeToTerminal(command);
    termRef.current?.focus();
  }, [writing]);

  const handleClearStatus = useCallback(() => {
    setWrittenBytes(0);
    setStatus('就绪');
  }, []);

  return (
    <div className="app">
      <div className="toolbar">
        <div className="toolbar-title">Term Pusher</div>
        <div className="toolbar-status">
          <span className={`status-dot ${writing ? 'writing' : 'idle'}`} />
          <span className="status-text">{status}</span>
          {writtenBytes > 0 && (
            <span className="status-bytes" onClick={handleClearStatus}>
              累计: {writtenBytes} 字符
            </span>
          )}
        </div>
      </div>
      <div className="main-content">
        <CommandPanel onWriteCommand={handleWriteCommand} writing={writing} />
        <div className="terminal-wrapper">
          <TerminalPanel ref={termRef} />
        </div>
      </div>
    </div>
  );
}

export default App;
