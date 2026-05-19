import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TOOL_GROUPS, type CommandEntry } from './commandsData';
import { getRecentCommands, getCommandFrequencies, getRecentProjects, addRecentCommand, addCommandClick } from './commandTracker';
import type { RecentCommand, RecentProject } from './commandTracker';
import CustomCommandDialog from './CustomCommandDialog';

interface CustomCommand {
  id: string;
  name: string;
  command: string;
}

const STORAGE_KEY = 'term-pusher-custom-commands';
const OVERRIDES_KEY = 'term-pusher-overrides';
const AUTO_ENTER_KEY = 'term-pusher-auto-enter';

function loadCustomCommands(): CustomCommand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomCommands(commands: CustomCommand[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

function loadOverrides(): Record<string, CustomCommand> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Record<string, CustomCommand>) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

function loadAutoEnter(): boolean {
  try {
    return localStorage.getItem(AUTO_ENTER_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveAutoEnter(v: boolean) {
  localStorage.setItem(AUTO_ENTER_KEY, String(v));
}

interface CommandPanelProps {
  onWriteCommand: (command: string) => void;
  writing: boolean;
  currentProjectPath: string | null;
  onProjectOpen?: (projectPath: string) => void;
  onOpenOCR?: () => void;
}

const QUICK_WORKFLOWS = [
  { id: 'wf-cc', label: 'CC', command: 'claude', toolId: 'cc' },
  { id: 'wf-codex', label: 'Codex', command: 'codex', toolId: 'codex' },
  { id: 'wf-rx', label: 'Reasonix', command: 'reasonix code', toolId: 'reasonix' },
];

const SESSION_RESUME_COMMAND: Record<string, (id: string) => string> = {
  cc: (id) => `claude -r "${id}"`,
  codex: (id) => `codex resume ${id}`,
  reasonix: (id) => `reasonix -c "${id}"`,
};

const TOOL_META: Record<string, { name: string; tagClass: string }> = {
  cc: { name: 'Claude Code', tagClass: 'search-tag-cc' },
  codex: { name: 'Codex', tagClass: 'search-tag-codex' },
  reasonix: { name: 'Reasonix', tagClass: 'search-tag-reasonix' },
};

const DOC_URLS: Record<string, string> = {
  cc: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  codex: 'https://github.com/openai/codex',
  reasonix: 'https://github.com/anthropics/reasonix',
};

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

function CommandPanel({ onWriteCommand, writing, currentProjectPath, onProjectOpen, onOpenOCR }: CommandPanelProps) {
  const [activeTool, setActiveTool] = useState(TOOL_GROUPS[0]?.id ?? 'cc');
  const [activeTab, setActiveTab] = useState('');
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>(loadCustomCommands);
  const [overrides, setOverrides] = useState<Record<string, CustomCommand>>(loadOverrides);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<{ id: string; name: string; command: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentCommands, setRecentCommands] = useState<RecentCommand[]>(getRecentCommands);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(getRecentProjects);
  const [showRecentProjects, setShowRecentProjects] = useState(false);

  // Auto-enter toggle
  const [autoEnter, setAutoEnter] = useState(loadAutoEnter);

  // Session history state
  const [sessions, setSessions] = useState<SessionScanResult | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [prevTool, setPrevTool] = useState(TOOL_GROUPS[0]?.id ?? 'cc');

  const isSearching = searchQuery.trim().length > 0;
  const isHistory = activeTool === 'history';

  const currentTool = TOOL_GROUPS.find((t) => t.id === activeTool);
  const showCustom = activeTool === 'custom';
  const isCustomTool = showCustom;

  // Build list of all built-in commands for the override dropdown
  const builtinCommands = useMemo(() => {
    const list: Array<{ command: string; description: string; toolName: string }> = [];
    for (const tool of TOOL_GROUPS) {
      for (const cat of tool.categories) {
        for (const cmd of cat.commands) {
          list.push({ command: cmd.command, description: cmd.description, toolName: tool.name });
        }
      }
    }
    return list;
  }, []);

  // Apply overrides to built-in command list
  const applyOverrides = useCallback((commands: CommandEntry[]): CommandEntry[] => {
    return commands.map((cmd) => {
      const override = overrides[cmd.command];
      if (override) {
        return {
          ...cmd,
          command: override.command,
          description: override.name + ' (已覆盖)',
        };
      }
      return cmd;
    });
  }, [overrides]);

  const customCategory = useMemo(() => ({
    id: 'custom-cmds',
    name: '自定义',
    icon: '+',
    commands: customCommands.map((c) => ({
      id: c.id,
      command: c.command,
      description: c.name,
    })),
  }), [customCommands]);

  const recentCategory = useMemo(() => ({
    id: 'recent',
    name: '最近使用',
    icon: '⏱',
    commands: recentCommands.map((c) => ({
      id: `recent-${c.command}`,
      command: c.command,
      description: c.source === 'terminal' ? '终端输入' : '面板点击',
    })),
  }), [recentCommands]);

  const categories = useMemo(() => {
    const base = isCustomTool
      ? []
      : (currentTool?.categories ?? []).map((cat) => ({
          ...cat,
          commands: applyOverrides(cat.commands),
        }));
    const withRecent = isCustomTool
      ? [customCategory]
      : recentCategory.commands.length > 0
        ? [recentCategory, ...base, customCategory]
        : [...base, customCategory];
    return withRecent;
  }, [isCustomTool, currentTool, customCategory, recentCategory, applyOverrides]);

  useEffect(() => {
    saveCustomCommands(customCommands);
  }, [customCommands]);

  useEffect(() => {
    saveOverrides(overrides);
  }, [overrides]);

  useEffect(() => {
    saveAutoEnter(autoEnter);
  }, [autoEnter]);

  // Reset active tab when tool changes
  useEffect(() => {
    if (categories.length > 0 && !categories.find((c) => c.id === activeTab)) {
      setActiveTab(categories[0].id);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load sessions when switching to history tab
  useEffect(() => {
    if (isHistory && !sessions) {
      setSessionsLoading(true);
      window.electronAPI.scanSessions().then((data) => {
        setSessions(data);
        setSessionsLoading(false);
      }).catch(() => {
        setSessionsLoading(false);
      });
    }
  }, [isHistory, sessions]);

  const handleAddCustom = useCallback((name: string, command: string, overrideTarget: string | null) => {
    const newCmd: CustomCommand = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      command,
    };
    setCustomCommands((prev) => [...prev, newCmd]);
    if (overrideTarget) {
      setOverrides((prev) => ({ ...prev, [overrideTarget]: newCmd }));
    }
    setDialogOpen(false);
  }, []);

  const handleEditCustom = useCallback((name: string, command: string, overrideTarget: string | null) => {
    if (!editingCommand) return;
    setCustomCommands((prev) =>
      prev.map((c) =>
        c.id === editingCommand.id ? { ...c, name, command } : c
      )
    );
    // Remove old overrides pointing to this command
    setOverrides((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].id === editingCommand.id) delete next[key];
      }
      if (overrideTarget) {
        next[overrideTarget] = { id: editingCommand.id, name, command };
      }
      return next;
    });
    setEditingCommand(null);
    setDialogOpen(false);
  }, [editingCommand]);

  const handleDeleteCustom = useCallback((id: string) => {
    setCustomCommands((prev) => prev.filter((c) => c.id !== id));
    // Also remove any override for this command
    setOverrides((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].id === id) delete next[key];
      }
      return next;
    });
  }, []);

  const openEditDialog = useCallback((cmd: CustomCommand) => {
    setEditingCommand(cmd);
    setDialogOpen(true);
  }, []);

  const openAddDialog = useCallback(() => {
    setEditingCommand(null);
    setDialogOpen(true);
  }, []);

  // Unified command writer
  const writeCmd = useCallback((cmd: string) => {
    const final = autoEnter ? cmd + '\r' : cmd;
    onWriteCommand(final);
  }, [autoEnter, onWriteCommand]);

  // Command click handler
  const handleCommandClick = useCallback((cmd: string) => {
    addCommandClick(cmd);
    addRecentCommand(cmd, 'panel');
    setRecentCommands(getRecentCommands());
    writeCmd(cmd);
  }, [writeCmd]);

  // Session resume handler
  const handleSessionResume = useCallback((tool: string, id: string) => {
    const cmdFn = SESSION_RESUME_COMMAND[tool];
    if (cmdFn) {
      handleCommandClick(cmdFn(id));
    }
  }, [handleCommandClick]);

  // Refresh sessions
  const handleRefreshSessions = useCallback(() => {
    setSessions(null);
    setSessionsLoading(true);
    window.electronAPI.scanSessions().then((data) => {
      setSessions(data);
      setSessionsLoading(false);
    }).catch(() => {
      setSessionsLoading(false);
    });
  }, []);

  // Search across all tools
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.trim().toLowerCase();
    const results: Array<{ command: string; description: string; toolName: string; toolId: string }> = [];
    for (const tool of TOOL_GROUPS) {
      for (const cat of tool.categories) {
        for (const cmd of cat.commands) {
          const override = overrides[cmd.command];
          const cmdText = override ? override.command : cmd.command;
          const descText = override ? `${override.name} (已覆盖)` : cmd.description;
          if (
            cmdText.toLowerCase().includes(q) ||
            descText.toLowerCase().includes(q)
          ) {
            results.push({
              command: cmdText,
              description: descText,
              toolName: tool.name,
              toolId: tool.id,
            });
          }
        }
      }
    }
    for (const cmd of customCommands) {
      if (
        cmd.command.toLowerCase().includes(q) ||
        cmd.name.toLowerCase().includes(q)
      ) {
        results.push({
          command: cmd.command,
          description: cmd.name,
          toolName: '自定义',
          toolId: 'custom',
        });
      }
    }
    return results;
  }, [isSearching, searchQuery, customCommands, overrides]);

  // Sort commands by frequency
  const sortByFrequency = useCallback((commands: CommandEntry[]): CommandEntry[] => {
    const freqs = getCommandFrequencies();
    return [...commands].sort((a, b) => {
      const fa = freqs[a.command] || 0;
      const fb = freqs[b.command] || 0;
      if (fa !== fb) return fb - fa;
      return 0;
    });
  }, []);

  const currentCategory = categories.find((c) => c.id === activeTab) || categories[0];

  const handleWorkflowClick = useCallback((command: string) => {
    handleCommandClick(command);
  }, [handleCommandClick]);

  const handleProjectClick = useCallback((projectPath: string) => {
    onProjectOpen?.(projectPath);
    writeCmd(`cd /d "${projectPath}"`);
  }, [onProjectOpen, writeCmd]);

  // Build grouped or flat session list for history view
  const sessionGroups = useMemo(() => {
    if (!sessions) return [];
    const keys: Array<'cc' | 'codex' | 'reasonix'> = ['cc', 'codex', 'reasonix'];

    if (historyFilter === 'all') {
      return keys.map((key) => ({
        key,
        name: TOOL_META[key]?.name || key,
        tagClass: TOOL_META[key]?.tagClass || '',
        sessions: [...(sessions[key] || [])].sort((a, b) => b.updatedAt - a.updatedAt),
      })).filter((g) => g.sessions.length > 0);
    }

    const list = sessions[historyFilter as keyof SessionScanResult];
    if (!Array.isArray(list) || list.length === 0) return [];
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    return [{
      key: historyFilter,
      name: TOOL_META[historyFilter]?.name || historyFilter,
      tagClass: TOOL_META[historyFilter]?.tagClass || '',
      sessions: sorted,
    }];
  }, [sessions, historyFilter]);

  const docUrl = !isHistory && !isCustomTool && currentTool
    ? DOC_URLS[currentTool.id] : null;

  return (
    <div className="command-panel">
      {/* Search bar */}
      <div className="command-search">
        <span className="search-icon">&#x1F50D;</span>
        <input
          className="search-input"
          type="text"
          placeholder="搜索命令..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearchQuery('');
          }}
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => setSearchQuery('')}>
            &times;
          </button>
        )}
      </div>

      {/* Quick workflow buttons + auto-enter toggle */}
      <div className="workflow-bar">
        {QUICK_WORKFLOWS.map((wf) => (
          <button
            key={wf.id}
            className="workflow-btn"
            onClick={() => handleWorkflowClick(wf.command)}
            disabled={writing}
            title={`在终端执行: ${wf.command}`}
          >
            {wf.label}
          </button>
        ))}
        <button
          className={`workflow-btn workflow-project-btn ${showRecentProjects ? 'active' : ''}`}
          onClick={() => setShowRecentProjects(!showRecentProjects)}
          title="最近项目"
        >
          &#x1F4C1;
        </button>
        {/* Auto-enter toggle */}
        <button
          className={`workflow-btn workflow-auto-btn ${autoEnter ? 'active' : ''}`}
          onClick={() => setAutoEnter(!autoEnter)}
          title={autoEnter ? '自动回车：开（点击关闭）' : '自动回车：关（点击开启）'}
        >
          &#x23CE;
        </button>
        {/* OCR button */}
        {onOpenOCR && (
          <button
            className="workflow-btn workflow-ocr-btn"
            onClick={onOpenOCR}
            title="识图：从图片中提取文字（Ctrl+Shift+V）"
          >
            识图
          </button>
        )}
      </div>

      {/* Recent projects dropdown */}
      {showRecentProjects && (
        <div className="recent-projects-dropdown">
          {recentProjects.length === 0 ? (
            <div className="recent-projects-empty">暂无最近项目</div>
          ) : (
            recentProjects.map((p) => (
              <button
                key={p.path}
                className="recent-project-item"
                onClick={() => {
                  handleProjectClick(p.path);
                  setShowRecentProjects(false);
                }}
                title={p.path}
              >
                <span className="recent-project-name">{p.name}</span>
                <span className="recent-project-path">{p.path}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Header */}
      <div className="command-panel-header">
        {isHistory && (
          <button className="history-back-btn" onClick={() => setActiveTool(prevTool)} title="返回">
            &#x2190;
          </button>
        )}
        <span className="command-panel-title">{isHistory ? '历史对话' : '命令面板'}</span>
        {docUrl && (
          <a className="doc-link" href={docUrl} title="查看官方命令文档" onClick={(e) => {
            e.preventDefault();
            window.electronAPI.openExternal(docUrl);
          }}>
            &#x1F4D6; 文档
          </a>
        )}
        {isHistory && (
          <button className="session-refresh-btn" onClick={handleRefreshSessions} title="刷新">
            &#x21BB;
          </button>
        )}
      </div>

      {/* Search results mode */}
      {isSearching ? (
        <div className="command-list">
          {searchResults.length === 0 ? (
            <div className="command-empty">未找到匹配的命令</div>
          ) : (
            searchResults.map((r, i) => (
              <div key={`${r.toolId}-${r.command}-${i}`} className="command-item-group">
                <button
                  className="command-item"
                  onClick={() => handleCommandClick(r.command)}
                  disabled={writing}
                  title={r.command}
                >
                  <span className="command-text">
                    <span className={`search-tag search-tag-${r.toolId}`}>{r.toolName}</span>
                    {' '}{r.command}
                  </span>
                  <span className="command-desc">{r.description}</span>
                </button>
              </div>
            ))
          )}
        </div>
      ) : isHistory ? (
        <>
          {/* History tool filter */}
          <div className="history-filter">
            <button
              className={`history-filter-btn ${historyFilter === 'all' ? 'active' : ''}`}
              onClick={() => setHistoryFilter('all')}
            >
              全部
            </button>
            <button
              className={`history-filter-btn ${historyFilter === 'cc' ? 'active' : ''}`}
              onClick={() => setHistoryFilter('cc')}
            >
              CC
            </button>
            <button
              className={`history-filter-btn ${historyFilter === 'codex' ? 'active' : ''}`}
              onClick={() => setHistoryFilter('codex')}
            >
              Codex
            </button>
            <button
              className={`history-filter-btn ${historyFilter === 'reasonix' ? 'active' : ''}`}
              onClick={() => setHistoryFilter('reasonix')}
            >
              Reasonix
            </button>
          </div>

          {/* Session list */}
          <div className="command-list">
            {sessionsLoading ? (
              <div className="command-empty">正在扫描会话...</div>
            ) : sessions === null ? (
              <div className="command-empty">加载会话失败</div>
            ) : sessionGroups.length === 0 ? (
              <div className="command-empty">
                {sessions.total === 0
                  ? '未找到历史会话，在终端中使用 CLI 工具后会自动出现'
                  : '当前筛选下无会话'}
              </div>
            ) : (
              sessionGroups.map((group) => (
                <div key={group.key} className="session-group">
                  <div className="session-group-header">
                    <span className={`search-tag ${group.tagClass}`}>{group.name}</span>
                    <span className="session-group-count">{group.sessions.length}</span>
                  </div>
                  {group.sessions.map((s) => (
                    <div key={`${s.tool}-${s.id}`} className="session-item">
                      <div className="session-info">
                        <div className="session-title" title={s.title}>{s.title}</div>
                        <div className="session-meta">
                          {s.subtitle && (
                            <span className="session-subtitle" title={s.subtitle}>{s.subtitle}</span>
                          )}
                          <span className="session-time">{formatTimeAgo(s.updatedAt)}</span>
                        </div>
                      </div>
                      <button
                        className="session-resume-btn"
                        onClick={() => handleSessionResume(s.tool, s.id)}
                        disabled={writing}
                        title="恢复此会话"
                      >
                        恢复
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* Tool selector */}
          <div className="tool-selector">
            {TOOL_GROUPS.map((tool) => (
              <button
                key={tool.id}
                className={`tool-selector-btn ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => setActiveTool(tool.id)}
              >
                {tool.name}
              </button>
            ))}
            <button
              key="custom-tool"
              className={`tool-selector-btn ${activeTool === 'custom' ? 'active' : ''}`}
              onClick={() => setActiveTool('custom')}
            >
              自定义
            </button>
            <button
              key="history-tool"
              className={`tool-selector-btn history-tool-btn ${activeTool === 'history' ? 'active' : ''}`}
              onClick={() => {
                setPrevTool(activeTool !== 'history' ? activeTool : prevTool);
                setActiveTool('history');
              }}
            >
              历史
            </button>
          </div>

          {/* Category tabs */}
          <div className="command-tabs">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`command-tab ${activeTab === cat.id ? 'active' : ''}`}
                onClick={() => setActiveTab(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Command list */}
          <div className="command-list">
            {currentCategory && currentCategory.commands.length === 0 ? (
              <div className="command-empty">
                {activeTab === 'recent' ? '暂未捕获到命令' : activeTab === 'custom-cmds' ? '还没有自定义命令' : '暂无命令'}
              </div>
            ) : (
              sortByFrequency(currentCategory?.commands || []).map((cmd) => (
                <div key={cmd.id} className="command-item-group">
                  <button
                    className={`command-item${overrides[cmd.command] ? ' overridden' : ''}`}
                    onClick={() => handleCommandClick(cmd.command)}
                    disabled={writing}
                    title={cmd.command}
                  >
                    <span className="command-text">{cmd.command}</span>
                    <span className="command-desc">{cmd.description}</span>
                  </button>
                  {activeTab === 'custom-cmds' && (
                    <div className="command-actions">
                      <button
                        className="command-action-btn edit"
                        onClick={() => {
                          const found = customCommands.find((c) => c.id === cmd.id);
                          if (found) openEditDialog(found);
                        }}
                        title="编辑"
                      >
                        &#x270E;
                      </button>
                      <button
                        className="command-action-btn delete"
                        onClick={() => handleDeleteCustom(cmd.id)}
                        title="删除"
                      >
                        &#x2715;
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {activeTab === 'custom-cmds' && (
              <button className="command-add-btn" onClick={openAddDialog}>
                + 添加自定义命令
              </button>
            )}
          </div>
        </>
      )}

      <CustomCommandDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingCommand(null); }}
        onSave={editingCommand ? handleEditCustom : handleAddCustom}
        editData={editingCommand ? { name: editingCommand.name, command: editingCommand.command } : null}
        builtinCommands={builtinCommands}
      />
    </div>
  );
}

export default CommandPanel;
