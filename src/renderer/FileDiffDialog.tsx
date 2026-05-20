import React, { useState, useEffect, useCallback, useRef } from 'react';

interface FileDiffDialogProps {
  open: boolean;
  projectPath: string | null;
  onClose: () => void;
}

interface OpenTab {
  filePath: string;
  fileName: string;
  content: string;
  original: string;
  diff: DiffHunk[];
  staged: DiffHunk[];
}

function FileDiffDialog({ open, projectPath, onClose }: FileDiffDialogProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [changedFiles, setChangedFiles] = useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  const [statusMsg, setStatusMsg] = useState('');
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const overlayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();
  const baselineChangedRef = useRef<Set<string>>(new Set());

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusMsg(''), 2500);
  }, []);

  // Load file tree on open — baseline changed files so only
  // changes made AFTER opening the dialog are highlighted.
  useEffect(() => {
    if (!open || !projectPath) return;
    setLoading(true);
    window.electronAPI.getFileTree(projectPath).then((nodes) => {
      setTree(nodes);
      // Collect all currently-changed files from tree
      const changed = new Set<string>();
      const collectChanged = (list: FileNode[]) => {
        for (const n of list) {
          if (n.changed) changed.add(n.path);
          if (n.isDir) collectChanged(n.children);
        }
      };
      collectChanged(nodes);
      // First open: snapshot these as baseline — they were already
      // dirty before the user opened the dialog, so don't highlight them.
      if (baselineChangedRef.current.size === 0) {
        baselineChangedRef.current = changed;
      }
      setChangedFiles(changed);
      // Auto-expand dirs containing NEW changes (not baseline)
      const newChanged = new Set([...changed].filter(f => !baselineChangedRef.current.has(f)));
      const expand = new Set<string>();
      const walk = (list: FileNode[]) => {
        for (const n of list) {
          if (n.isDir) {
            if (hasChangedChild(n, newChanged)) expand.add(n.path);
            walk(n.children);
          }
        }
      };
      walk(nodes);
      setExpandedDirs(expand);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, projectPath]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setTree([]);
      setChangedFiles(new Set());
      setExpandedDirs(new Set());
      setTabs([]);
      setActiveFile(null);
      setDirty(new Set());
      setReverted(new Set());
      baselineChangedRef.current = new Set();
    }
  }, [open]);

  const hasChangedChild = (node: FileNode, changed: Set<string>): boolean => {
    if (!node.isDir) return changed.has(node.path);
    for (const c of node.children) {
      if (hasChangedChild(c, changed)) return true;
    }
    return false;
  };

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const openFile = useCallback(async (filePath: string, fileName: string) => {
    // Check if already open
    if (tabs.find(t => t.filePath === filePath)) {
      setActiveFile(filePath);
      return;
    }
    const absPath = projectPath ? pathJoin(projectPath, filePath) : filePath;
    const contentPromise = projectPath ? window.electronAPI.readFile(absPath).then(r => r.content) : Promise.resolve('');
    const diffResult = projectPath ? window.electronAPI.getFileDiff(projectPath, filePath) : Promise.resolve({ diff: [], staged: [] });

    const [content, diff] = await Promise.all([contentPromise, diffResult]);
    const combined = [...(diff.diff || []), ...(diff.staged || [])];
    const tab: OpenTab = { filePath, fileName, content, original: content, diff: combined, staged: diff.staged || [] };
    setTabs(prev => [...prev, tab]);
    setActiveFile(filePath);
  }, [projectPath, tabs]);

  const closeTab = useCallback((filePath: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.filePath === filePath);
      const next = prev.filter(t => t.filePath !== filePath);
      if (activeFile === filePath) {
        if (next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1);
          setActiveFile(next[newIdx].filePath);
        } else {
          setActiveFile(null);
        }
      }
      return next;
    });
    setDirty(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
    setReverted(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
  }, [activeFile]);

  const handleEdit = useCallback((filePath: string, content: string) => {
    setTabs(prev => prev.map(t => t.filePath === filePath ? { ...t, content } : t));
    setDirty(prev => new Set(prev).add(filePath));
  }, []);

  const handleSave = useCallback(async (filePath: string) => {
    const tab = tabs.find(t => t.filePath === filePath);
    if (!tab) return;
    const absPath = projectPath ? pathJoin(projectPath, filePath) : filePath;
    const result = await window.electronAPI.writeFile(absPath, tab.content);
    if (result.success) {
      setTabs(prev => prev.map(t => t.filePath === filePath ? { ...t, original: t.content } : t));
      setDirty(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
      setReverted(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
      showStatus('Saved: ' + tab.fileName);
    } else {
      showStatus('Save failed: ' + (result.error || 'Unknown error'));
    }
  }, [tabs, projectPath, showStatus]);

  const handleRevert = useCallback(async (filePath: string) => {
    if (!projectPath) return;
    const result = await window.electronAPI.revertFile(projectPath, filePath);
    if (result.success) {
      const absPath = pathJoin(projectPath, filePath);
      const fileResult = await window.electronAPI.readFile(absPath);
      if (!fileResult.error) {
        setTabs(prev => prev.map(t => t.filePath === filePath ? { ...t, content: fileResult.content, original: fileResult.content } : t));
        setReverted(prev => new Set(prev).add(filePath));
        setDirty(prev => {
          const next = new Set(prev);
          next.add(filePath);
          return next;
        });
        showStatus('Reverted: ' + filePath);
      }
    } else {
      showStatus('Revert failed: ' + (result.error || 'Unknown error'));
    }
  }, [projectPath, showStatus]);

  const activeTab = tabs.find(t => t.filePath === activeFile);

  // Determine save button state
  const canSave = activeFile ? (dirty.has(activeFile) || reverted.has(activeFile)) : false;

  // Build combined diff view: show full file with diff annotations
  const buildDiffView = (tab: OpenTab) => {
    if (tab.diff.length === 0) {
      // No diff - just show the file content
      return tab.content.split('\n').map((line, i) => ({
        lineNum: i + 1,
        type: 'context' as const,
        content: line,
      }));
    }
    // Merge all hunks
    const allLines: Array<{ lineNum: number; type: 'add' | 'delete' | 'context'; content: string }> = [];
    let newLineNum = 1;
    const contentLines = tab.content.split('\n');

    for (const hunk of tab.diff) {
      // Add context lines before this hunk
      while (newLineNum < hunk.newStart) {
        allLines.push({ lineNum: newLineNum, type: 'context', content: contentLines[newLineNum - 1] || '' });
        newLineNum++;
      }
      for (const line of hunk.lines) {
        if (line.type === 'add') {
          allLines.push({ lineNum: newLineNum, type: 'add', content: line.content });
          newLineNum++;
        } else if (line.type === 'delete') {
          allLines.push({ lineNum: line.oldLine || 0, type: 'delete', content: line.content });
        } else {
          allLines.push({ lineNum: newLineNum, type: 'context', content: line.content });
          newLineNum++;
        }
      }
    }
    // Add remaining lines after last hunk
    while (newLineNum <= contentLines.length) {
      allLines.push({ lineNum: newLineNum, type: 'context', content: contentLines[newLineNum - 1] || '' });
      newLineNum++;
    }
    return allLines;
  };

  if (!open) return null;

  return (
    <div className="filediff-overlay" onClick={onClose}>
      <div className="filediff-dialog" onClick={e => e.stopPropagation()}>
        <div className="filediff-header">
          <span className="filediff-title">文件变更</span>
          <span className="filediff-subtitle">{projectPath || 'No directory'}</span>
          <button className="filediff-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="filediff-body">
          {/* Left: File Tree */}
          <div className="filediff-tree">
            <div className="filediff-tree-label">项目文件</div>
            {loading ? (
              <div className="filediff-loading">Loading...</div>
            ) : (
              <div className="filediff-tree-scroll">
                {tree.map(node => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    expanded={expandedDirs}
                    onToggle={toggleDir}
                    onOpen={openFile}
                    changedFiles={changedFiles}
                    baselineChanged={baselineChangedRef.current}
                    activeFile={activeFile}
                  />
                ))}
                {tree.length === 0 && <div className="filediff-empty">No files found</div>}
              </div>
            )}
          </div>

          {/* Right: Diff View with Tabs */}
          <div className="filediff-content">
            {tabs.length > 0 ? (
              <>
                <div className="filediff-tabs">
                  {tabs.map(t => (
                    <div
                      key={t.filePath}
                      className={`filediff-tab ${activeFile === t.filePath ? 'active' : ''}`}
                      onClick={() => setActiveFile(t.filePath)}
                    >
                      <span className="filediff-tab-name">{t.fileName}</span>
                      {dirty.has(t.filePath) && <span className="filediff-tab-dirty">&#x25CF;</span>}
                      <button
                        className="filediff-tab-close"
                        onClick={e => { e.stopPropagation(); closeTab(t.filePath); }}
                      >&times;</button>
                    </div>
                  ))}
                </div>
                {activeTab ? (
                  <div className="filediff-editor-area">
                    <textarea
                      ref={el => { textareaRefs.current[activeTab.filePath] = el; }}
                      className="filediff-textarea"
                      value={activeTab.content}
                      onChange={e => handleEdit(activeTab.filePath, e.target.value)}
                      onScroll={() => {
                        const ta = textareaRefs.current[activeTab.filePath];
                        const ov = overlayRefs.current[activeTab.filePath];
                        if (ta && ov) {
                          ov.scrollTop = ta.scrollTop;
                          ov.scrollLeft = ta.scrollLeft;
                        }
                      }}
                      spellCheck={false}
                    />
                    <div
                      ref={el => { overlayRefs.current[activeTab.filePath] = el; }}
                      className="filediff-diff-overlay"
                    >
                      {buildDiffView(activeTab).map((line, i) => (
                        <div
                          key={i}
                          className={`filediff-line ${
                            line.type === 'add' ? 'diff-add' :
                            line.type === 'delete' ? 'diff-delete' : ''
                          }`}
                        >
                          <span className="filediff-line-num">{line.lineNum}</span>
                          <span className="filediff-line-sign">{line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}</span>
                          <span className="filediff-line-content">{line.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="filediff-no-tab">Select a file to view</div>
                )}
              </>
            ) : (
              <div className="filediff-placeholder">
                <div className="filediff-placeholder-icon">&#x1F4C4;</div>
                <div>Click a file in the tree to view changes</div>
              </div>
            )}
          </div>
        </div>
        <div className="filediff-footer">
          <button
            className="filediff-footer-btn"
            onClick={() => activeFile && handleRevert(activeFile)}
            disabled={!activeFile}
            title="Discard changes and revert to last git version"
          >
            撤回
          </button>
          <button
            className={`filediff-footer-btn primary ${canSave ? 'active' : ''}`}
            onClick={() => activeFile && handleSave(activeFile)}
            disabled={!canSave}
            title={canSave ? 'Save changes to disk' : 'No changes to save'}
          >
            保存
          </button>
        </div>
        {statusMsg && <div className="filediff-toast">{statusMsg}</div>}
      </div>
    </div>
  );
}

// Recursive tree node component
function TreeNode({ node, expanded, onToggle, onOpen, changedFiles, baselineChanged, activeFile, depth = 0 }: {
  node: FileNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string, name: string) => void;
  changedFiles: Set<string>;
  baselineChanged: Set<string>;
  activeFile: string | null;
  depth?: number;
}) {
  const isExpanded = expanded.has(node.path);
  // Only show as changed if the file was NOT already dirty when the dialog opened
  const hasChanged = changedFiles.has(node.path) && !baselineChanged.has(node.path);
  const isActive = activeFile === node.path;

  if (node.isDir) {
    const hasChangedChild = (n: FileNode): boolean => {
      if (!n.isDir) return changedFiles.has(n.path) && !baselineChanged.has(n.path);
      return n.children.some(c => hasChangedChild(c));
    };
    const changed = hasChangedChild(node);
    return (
      <div>
        <div
          className={`filediff-tree-item dir ${changed ? 'has-changed' : ''}`}
          style={{ paddingLeft: depth * 14 + 6 }}
          onClick={() => onToggle(node.path)}
        >
          <span className="filediff-tree-arrow">{isExpanded ? '▾' : '▸'}</span>
          <span className="filediff-tree-icon">{isExpanded ? '📂' : '📁'}</span>
          <span className="filediff-tree-name">{node.name}</span>
        </div>
        {isExpanded && node.children.map(c => (
          <TreeNode
            key={c.path}
            node={c}
            expanded={expanded}
            onToggle={onToggle}
            onOpen={onOpen}
            changedFiles={changedFiles}
            baselineChanged={baselineChanged}
            activeFile={activeFile}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`filediff-tree-item file ${hasChanged ? 'changed' : ''} ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: depth * 14 + 6 }}
      onClick={() => onOpen(node.path, node.name)}
    >
      <span className="filediff-tree-arrow" style={{ visibility: 'hidden' }}>▸</span>
      <span className="filediff-tree-icon">{hasChanged ? '📝' : '📄'}</span>
      <span className="filediff-tree-name">{node.name}</span>
      {hasChanged && <span className="filediff-tree-badge">●</span>}
    </div>
  );
}

function pathJoin(a: string, b: string): string {
  const sep = a.includes('\\') ? '\\' : '/';
  return a + sep + b;
}

export default FileDiffDialog;
