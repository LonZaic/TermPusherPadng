import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface TerminalPanelProps {
  tabId: string;
  themeVersion: number;
  onCommandCapture?: (command: string) => void;
}

const TerminalPanel = forwardRef<{ focus: () => void }, TerminalPanelProps>(({ tabId, themeVersion, onCommandCapture }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => termInstance.current?.focus(),
  }));

  // Initialize terminal once
  useEffect(() => {
    if (!terminalRef.current) return;

    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const isDark = cs.getPropertyValue('--app-is-dark').trim() === '1';
    const termBg = cs.getPropertyValue('--app-bg').trim() || '#1e1e2e';
    const termFg = cs.getPropertyValue('--app-text').trim() || '#cdd6f4';

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: isDark ? {
        background: termBg,
        foreground: termFg,
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
      } : {
        background: termBg,
        foreground: termFg,
        cursor: '#1e66f5',
        selectionBackground: '#00000020',
        black: '#1e1e2e',
        red: '#c0392b',
        green: '#1e8449',
        yellow: '#b7950b',
        blue: '#2471a3',
        magenta: '#6c3483',
        cyan: '#148f77',
        white: '#555555',
        brightBlack: '#888888',
        brightRed: '#e74c3c',
        brightGreen: '#27ae60',
        brightYellow: '#d4ac0d',
        brightBlue: '#3498db',
        brightMagenta: '#8e44ad',
        brightCyan: '#1abc9c',
        brightWhite: '#1e1e2e',
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

  // Update terminal theme when themeVersion changes (skip first: init handles it)
  const themeInitRef = useRef(true);
  useEffect(() => {
    if (themeInitRef.current) {
      themeInitRef.current = false;
      return;
    }
    const term = termInstance.current;
    if (!term) return;

    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const isDark = cs.getPropertyValue('--app-is-dark').trim() === '1';
    const termBg = cs.getPropertyValue('--app-bg').trim() || '#1e1e2e';
    const termFg = cs.getPropertyValue('--app-text').trim() || '#cdd6f4';

    term.options.theme = isDark ? {
      background: termBg,
      foreground: termFg,
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
    } : {
      background: termBg,
      foreground: termFg,
      cursor: '#1e66f5',
      selectionBackground: '#00000020',
      black: '#1e1e2e',
      red: '#c0392b',
      green: '#1e8449',
      yellow: '#b7950b',
      blue: '#2471a3',
      magenta: '#6c3483',
      cyan: '#148f77',
      white: '#555555',
      brightBlack: '#888888',
      brightRed: '#e74c3c',
      brightGreen: '#27ae60',
      brightYellow: '#d4ac0d',
      brightBlue: '#3498db',
      brightMagenta: '#8e44ad',
      brightCyan: '#1abc9c',
      brightWhite: '#1e1e2e',
    };
  }, [themeVersion]);

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

  // Forward keystrokes to PTY + capture commands
  useEffect(() => {
    const term = termInstance.current;
    if (!term) return;

    let lineBuf = '';

    const onDataDispose = term.onData((data) => {
      window.electronAPI.writeToTerminal(tabId, data);

      // Capture terminal input to detect commands
      for (const ch of data) {
        if (ch === '\r') {
          const cmd = lineBuf.trim();
          if (cmd.length >= 3 && onCommandCapture) {
            onCommandCapture(cmd);
          }
          lineBuf = '';
        } else if (ch === '\x7f' || ch === '\b') {
          lineBuf = lineBuf.slice(0, -1);
        } else if (ch === '\x03') {
          lineBuf = ''; // Ctrl+C
        } else if (ch.length === 1 && ch.charCodeAt(0) >= 32) {
          lineBuf += ch;
        }
      }
    });

    return () => {
      onDataDispose.dispose();
    };
  }, [tabId, onCommandCapture]);

  return <div ref={terminalRef} className="terminal-container" />;
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;
