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

interface CommandPanelProps {
  onWriteCommand: (command: string) => void;
  writing: boolean;
  currentProjectPath: string | null;
  onProjectOpen?: (projectPath: string) => void;
}

const QUICK_WORKFLOWS = [
  { id: 'wf-cc', label: 'CC', command: 'claude', toolId: 'cc' },
  { id: 'wf-codex', label: 'Codex', command: 'codex', toolId: 'codex' },
  { id: 'wf-rx', label: 'Reasonix', command: 'reasonix code', toolId: 'reasonix' },
];

function CommandPanel({ onWriteCommand, writing, currentProjectPath, onProjectOpen }: CommandPanelProps) {
  const [activeTool, setActiveTool] = useState(TOOL_GROUPS[0]?.id ?? 'cc');
  const [activeTab, setActiveTab] = useState('');
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>(loadCustomCommands);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<{ id: string; name: string; command: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentCommands, setRecentCommands] = useState<RecentCommand[]>(getRecentCommands);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(getRecentProjects);
  const [showRecentProjects, setShowRecentProjects] = useState(false);

  const isSearching = searchQuery.trim().length > 0;

  const currentTool = TOOL_GROUPS.find((t) => t.id === activeTool);
  const showCustom = activeTool === 'custom';
  const isCustomTool = showCustom;

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
      : [...(currentTool?.categories ?? [])];
    // Insert recent commands as first category (not for custom tool)
    const withRecent = isCustomTool
      ? [customCategory]
      : recentCategory.commands.length > 0
        ? [recentCategory, ...base, customCategory]
        : [...base, customCategory];
    return withRecent;
  }, [isCustomTool, currentTool, customCategory, recentCategory]);

  useEffect(() => {
    saveCustomCommands(customCommands);
  }, [customCommands]);

  // Reset active tab when tool changes
  useEffect(() => {
    if (categories.length > 0 && !categories.find((c) => c.id === activeTab)) {
      setActiveTab(categories[0].id);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddCustom = useCallback((name: string, command: string) => {
    const newCmd: CustomCommand = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      command,
    };
    setCustomCommands((prev) => [...prev, newCmd]);
    setDialogOpen(false);
  }, []);

  const handleEditCustom = useCallback((name: string, command: string) => {
    if (!editingCommand) return;
    setCustomCommands((prev) =>
      prev.map((c) =>
        c.id === editingCommand.id ? { ...c, name, command } : c
      )
    );
    setEditingCommand(null);
    setDialogOpen(false);
  }, [editingCommand]);

  const handleDeleteCustom = useCallback((id: string) => {
    setCustomCommands((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const openEditDialog = useCallback((cmd: CustomCommand) => {
    setEditingCommand(cmd);
    setDialogOpen(true);
  }, []);

  const openAddDialog = useCallback(() => {
    setEditingCommand(null);
    setDialogOpen(true);
  }, []);

  // Command click handler
  const handleCommandClick = useCallback((cmd: string) => {
    addCommandClick(cmd);
    addRecentCommand(cmd, 'panel');
    setRecentCommands(getRecentCommands());
    onWriteCommand(cmd);
  }, [onWriteCommand]);

  // Search across all tools
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.trim().toLowerCase();
    const results: Array<{ command: string; description: string; toolName: string; toolId: string }> = [];
    // Search built-in commands
    for (const tool of TOOL_GROUPS) {
      for (const cat of tool.categories) {
        for (const cmd of cat.commands) {
          if (
            cmd.command.toLowerCase().includes(q) ||
            cmd.description.toLowerCase().includes(q)
          ) {
            results.push({
              command: cmd.command,
              description: cmd.description,
              toolName: tool.name,
              toolId: tool.id,
            });
          }
        }
      }
    }
    // Search custom commands
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
  }, [isSearching, searchQuery, customCommands]);

  // Sort commands by frequency
  const sortByFrequency = useCallback((commands: CommandEntry[]): CommandEntry[] => {
    const freqs = getCommandFrequencies();
    return [...commands].sort((a, b) => {
      const fa = freqs[a.command] || 0;
      const fb = freqs[b.command] || 0;
      if (fa !== fb) return fb - fa; // higher freq first
      return 0; // preserve original order for equal freq
    });
  }, []);

  const currentCategory = categories.find((c) => c.id === activeTab) || categories[0];

  const handleWorkflowClick = useCallback((command: string) => {
    handleCommandClick(command);
  }, [handleCommandClick]);

  const handleProjectClick = useCallback((projectPath: string) => {
    onProjectOpen?.(projectPath);
    // cd into project first, then we'd need shell integration
    // For now, write the cd command
    onWriteCommand(`cd /d "${projectPath}"`);
  }, [onProjectOpen, onWriteCommand]);

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

      {/* Quick workflow buttons */}
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

      {/* Header: tool selector + title */}
      <div className="command-panel-header">
        <span className="command-panel-title">命令面板</span>
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
                    className="command-item"
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
      />
    </div>
  );
}

export default CommandPanel;
