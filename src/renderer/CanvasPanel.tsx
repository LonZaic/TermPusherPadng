import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { exportToDrawio } from './drawioExport';
import '@excalidraw/excalidraw/index.css';

// Dynamic import — Excalidraw is large, only load when canvas tab is active
let ExcalidrawModule: any = null;

interface CanvasPanelProps {
  tabId: string;
}

interface MermaidDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (svgText: string, code: string) => void;
}

function MermaidDialog({ open, onClose, onInsert }: MermaidDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  if (!open) return null;

  const handlePreview = async () => {
    setError('');
    try {
      const mermaid = (window as any).__mermaid;
      if (!mermaid) { setError('Mermaid 未加载'); return; }
      const { svg } = await mermaid.render('mermaid-preview', code);
      setPreview(svg);
    } catch (e: any) {
      setError(e.message || '渲染失败');
      setPreview('');
    }
  };

  const handleInsert = () => {
    if (!preview) return;
    onInsert(preview, code);
    setCode('');
    setPreview('');
    setError('');
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog" style={{ width: 520 }}>
        <div className="dialog-header">
          <h3>Mermaid 代码生成图</h3>
          <button className="dialog-close" onClick={onClose}>✕</button>
        </div>
        <div className="dialog-body">
          <div className="dialog-field">
            <label>Mermaid 代码</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`graph TD\n  A[开始] --> B[处理]\n  B --> C[结束]`}
              rows={6}
              style={{ fontFamily: "'Cascadia Code', monospace", fontSize: 12 }}
            />
          </div>
          {error && <div className="dialog-error" style={{ marginBottom: 12 }}>{error}</div>}
          {preview && (
            <div
              className="mermaid-preview"
              style={{ background: '#fff', borderRadius: 6, padding: 12, marginBottom: 12, maxHeight: 200, overflow: 'auto' }}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-cancel" onClick={handlePreview}>预览</button>
            <button className="btn btn-save" onClick={handleInsert} disabled={!preview}>
              插入画布
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasPanel({ tabId }: CanvasPanelProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const aiTermRef = useRef<HTMLDivElement>(null);
  const aiTerm = useRef<Terminal | null>(null);
  const aiFitAddon = useRef<FitAddon | null>(null);
  const streamBuffer = useRef('');
  const [excalidrawLoaded, setExcalidrawLoaded] = useState(false);
  const [api, setApi] = useState<any>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [excalidrawKey, setExcalidrawKey] = useState(0);
  const [roughness, setRoughness] = useState(0); // 0=整齐 1=轻微手绘 2=手绘

  const handleRoughnessChange = useCallback((value: number) => {
    setRoughness(value);
    if (api) {
      api.updateScene({ appState: { currentItemRoughness: value } });
    }
  }, [api]);

  // Load Excalidraw dynamically
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (ExcalidrawModule) {
        if (!cancelled) setExcalidrawLoaded(true);
        return;
      }
      try {
        const m = await import('@excalidraw/excalidraw');
        ExcalidrawModule = m;
        if (!cancelled) setExcalidrawLoaded(true);
      } catch (e) {
        console.error('Failed to load Excalidraw:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load Mermaid globally
  useEffect(() => {
    if ((window as any).__mermaid) return;
    import('mermaid').then((mermaid) => {
      mermaid.default.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
      });
      (window as any).__mermaid = mermaid.default;
    });
  }, []);

  // Initialize AI terminal
  useEffect(() => {
    if (!aiOpen || !aiTermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: '#11111b',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
      },
      allowTransparency: false,
      cols: 60,
      rows: 20,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(aiTermRef.current);
    fit.fit();
    term.focus();

    aiTerm.current = term;
    aiFitAddon.current = fit;

    // Spawn AI PTY
    window.electronAPI.spawnAiPty(tabId).catch(console.error);

    // PTY output → terminal
    const unsubOut = window.electronAPI.onAiPtyOutput((eventTabId, data) => {
      if (eventTabId === tabId && aiTerm.current) {
        aiTerm.current.write(data);
      }
    });

    // PTY exited
    const unsubExit = window.electronAPI.onAiPtyExited((eventTabId) => {
      if (eventTabId === tabId) {
        term.writeln('\r\n[AI 终端已退出]');
      }
    });

    // Terminal input → PTY
    term.onData((data) => {
      window.electronAPI.aiPtyWrite(tabId, data);
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const dims = fit.proposeDimensions();
        if (dims) window.electronAPI.aiPtyResize(tabId, dims.cols, dims.rows);
      } catch { /* ignore */ }
    });
    if (aiTermRef.current) ro.observe(aiTermRef.current);

    return () => {
      ro.disconnect();
      unsubOut();
      unsubExit();
      term.dispose();
      aiTerm.current = null;
      window.electronAPI.killAiPty(tabId).catch(() => {});
    };
  }, [aiOpen, tabId]);

  // Store/restore scene data
  const SCENE_KEY = `canvas-scene-${tabId}`;

  const handleChange = useCallback((elements: any[], appState: any) => {
    try {
      localStorage.setItem(SCENE_KEY, JSON.stringify({ elements, appState }));
    } catch { /* ignore */ }
  }, [SCENE_KEY]);

  // Export to .drawio
  const handleExport = useCallback(() => {
    if (!api) return;
    const elements = api.getSceneElements();
    if (!elements || elements.length === 0) return;
    const xml = exportToDrawio(elements);

    // Trigger download
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.drawio';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [api]);

  // Insert Mermaid SVG as text element + rects on canvas
  const handleMermaidInsert = useCallback((svgText: string, _code: string) => {
    if (!api) return;

    // Parse SVG to get dimensions
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    const viewBox = svgEl?.getAttribute('viewBox');
    let svgW = 400;
    let svgH = 300;
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      if (parts.length >= 4) {
        svgW = parseFloat(parts[2]) || 400;
        svgH = parseFloat(parts[3]) || 300;
      }
    }

    // Create a frame-like rectangle with the SVG as a labeled box
    // For simplicity, we add each rect/text from the SVG as separate elements
    const newElements: any[] = [];
    let elId = 0;

    // Add shapes from SVG children
    const rects = doc.querySelectorAll('rect');
    for (const rect of rects) {
      const rx = parseFloat(rect.getAttribute('x') || '0');
      const ry = parseFloat(rect.getAttribute('y') || '0');
      const rw = parseFloat(rect.getAttribute('width') || '100');
      const rh = parseFloat(rect.getAttribute('height') || '40');
      const fill = rect.getAttribute('fill') || '#ffffff';
      const stroke = rect.getAttribute('stroke') || '#000000';

      // Filter out full-svg background rects
      if (rw > svgW * 0.9 && rh > svgH * 0.9) continue;

      newElements.push({
        id: `m-${tabId}-${elId++}`,
        type: 'rectangle',
        x: rx + 100,
        y: ry + 50,
        width: rw,
        height: rh,
        strokeColor: stroke,
        backgroundColor: fill === 'none' || fill === '#ffffff' ? 'transparent' : fill,
        fillStyle: 'solid',
        strokeWidth: 1,
        roughness: 0,
        opacity: 100,
        groupIds: [],
        boundElements: null,
        version: 1,
        versionNonce: 0,
        seed: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
        isDeleted: false,
        roundness: { type: 3 },
      });
    }

    // Add text elements
    const texts = doc.querySelectorAll('text');
    for (const text of texts) {
      const tx = parseFloat(text.getAttribute('x') || '0');
      const ty = parseFloat(text.getAttribute('y') || '0');
      const content = text.textContent || '';
      if (!content.trim()) continue;

      newElements.push({
        id: `m-${tabId}-${elId++}`,
        type: 'text',
        x: tx + 90,
        y: ty + 35,
        width: content.length * 8,
        height: 25,
        text: content.trim(),
        fontSize: 14,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 0,
        roughness: 0,
        opacity: 100,
        groupIds: [],
        boundElements: null,
        containerId: null,
        version: 1,
        versionNonce: 0,
        seed: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
        isDeleted: false,
      });
    }

    if (newElements.length > 0) {
      const existing = api.getSceneElements();
      api.updateScene({
        elements: [...existing, ...newElements],
        captureUpdate: 'IMMEDIATELY',
      });
    } else {
      // Fallback: insert entire SVG as a screenshot (rect + label)
      const fallback = {
        id: `m-${tabId}-fallback`,
        type: 'rectangle',
        x: 100,
        y: 50,
        width: svgW,
        height: svgH,
        strokeColor: '#000000',
        backgroundColor: '#f5f5f5',
        fillStyle: 'solid',
        strokeWidth: 2,
        roughness: 0,
        opacity: 100,
        groupIds: [],
        boundElements: [{ id: `m-${tabId}-flabel`, type: 'text' }],
        version: 1,
        versionNonce: 0,
        seed: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
        isDeleted: false,
      };
      const flabel = {
        id: `m-${tabId}-flabel`,
        type: 'text',
        x: 110,
        y: 60,
        width: svgW - 20,
        height: svgH - 20,
        text: 'Mermaid Diagram',
        fontSize: 16,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: fallback.id,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 0,
        roughness: 0,
        opacity: 100,
        groupIds: [],
        boundElements: null,
        version: 1,
        versionNonce: 0,
        seed: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
        isDeleted: false,
      };
      const existing = api.getSceneElements();
      api.updateScene({
        elements: [...existing, fallback, flabel],
        captureUpdate: 'IMMEDIATELY',
      });
    }
  }, [api, tabId]);

  // Load saved scene
  const loadSavedScene = useCallback(() => {
    try {
      const raw = localStorage.getItem(SCENE_KEY);
      if (raw) {
        const { elements, appState } = JSON.parse(raw);
        if (api && elements && elements.length > 0) {
          api.updateScene({ elements, appState, captureUpdate: 'NEVER' });
        }
      }
    } catch { /* ignore */ }
  }, [api, SCENE_KEY]);

  // Register onChange after api is available and load saved scene
  useEffect(() => {
    if (!api) return;
    loadSavedScene();
    const unsub = api.onChange(handleChange);
    return () => { if (unsub) unsub(); };
  }, [api, handleChange, loadSavedScene]);

  if (!excalidrawLoaded) {
    return <div className="canvas-loading">加载画板...</div>;
  }

  const { Excalidraw } = ExcalidrawModule;

  return (
    <div className="canvas-wrapper">
      {/* Toolbar */}
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-left">
          <span className="canvas-toolbar-title">画板</span>
        </div>
        <div className="canvas-toolbar-right">
          <select
            className="canvas-roughness-select"
            value={roughness}
            onChange={(e) => handleRoughnessChange(Number(e.target.value))}
            title="线条风格"
          >
            <option value={0}>整齐线条</option>
            <option value={1}>轻微手绘</option>
            <option value={2}>手绘风格</option>
          </select>
          <button className="canvas-tool-btn" onClick={() => setMermaidOpen(true)} title="Mermaid 代码生成图">
            &#x25C7; Mermaid
          </button>
          <button className="canvas-tool-btn" onClick={handleExport} title="导出 .drawio 文件">
            &#x1F4E5; 导出 .drawio
          </button>
          <button
            className={`canvas-tool-btn canvas-ai-toggle ${aiOpen ? 'active' : ''}`}
            onClick={() => setAiOpen(!aiOpen)}
            title={aiOpen ? '关闭 AI 助手' : '打开 AI 助手'}
          >
            &#x1F916; AI
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="canvas-main">
        <div className="canvas-excalidraw" style={{ flex: 1 }}>
          <Excalidraw
            key={excalidrawKey}
            excalidrawAPI={(a: any) => {
              if (a && a !== api) setApi(a);
            }}
          />
        </div>

        {aiOpen && (
          <div className="canvas-ai-panel">
            <div className="canvas-ai-header">
              <span>AI 助手</span>
              <button className="canvas-ai-close" onClick={() => setAiOpen(false)}>✕</button>
            </div>
            <div ref={aiTermRef} className="canvas-ai-terminal" />
          </div>
        )}
      </div>

      <MermaidDialog
        open={mermaidOpen}
        onClose={() => setMermaidOpen(false)}
        onInsert={handleMermaidInsert}
      />
    </div>
  );
}

export default CanvasPanel;
