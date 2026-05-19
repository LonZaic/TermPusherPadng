import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface TerminalPanelProps {
  tabId: string;
}

const TerminalPanel = forwardRef<{ focus: () => void }, TerminalPanelProps>(({ tabId }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => termInstance.current?.focus(),
  }));

  // Initialize terminal once
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b7055',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      allowTransparency: false,
      cols: 80,
      rows: 24,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();
    term.focus();

    fitAddon.current = fit;
    termInstance.current = term;

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
        const dims = fit.proposeDimensions();
        if (dims) {
          window.electronAPI.ptyResize(tabId, dims.cols, dims.rows);
        }
      } catch { /* ignore */ }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle PTY output (filtered by tabId) — clear on switch
  useEffect(() => {
    if (termInstance.current) {
      termInstance.current.clear();
    }
    const cleanup = window.electronAPI.onPtyOutput((eventTabId, data) => {
      if (eventTabId === tabId && termInstance.current) {
        termInstance.current.write(data);
      }
    });
    return cleanup;
  }, [tabId]);

  // Forward keystrokes to PTY
  useEffect(() => {
    const term = termInstance.current;
    if (!term) return;

    const onDataDispose = term.onData((data) => {
      window.electronAPI.writeToTerminal(tabId, data);
    });

    return () => {
      onDataDispose.dispose();
    };
  }, [tabId]);

  return <div ref={terminalRef} className="terminal-container" />;
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;
