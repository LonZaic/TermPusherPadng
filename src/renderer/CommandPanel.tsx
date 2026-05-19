import React, { useState, useEffect, useCallback } from 'react';
import { CC_CATEGORIES, type CommandEntry } from './commandsData';
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
}

function CommandPanel({ onWriteCommand, writing }: CommandPanelProps) {
  const [activeTab, setActiveTab] = useState('startup');
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>(loadCustomCommands);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<{ id: string; name: string; command: string } | null>(null);

  useEffect(() => {
    saveCustomCommands(customCommands);
  }, [customCommands]);

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

  const categories = [
    ...CC_CATEGORIES,
    {
      id: 'custom',
      name: '自定义',
      icon: '+',
      commands: customCommands.map((c) => ({
        id: c.id,
        command: c.command,
        description: c.name,
      })),
    },
  ];

  const currentCategory = categories.find((c) => c.id === activeTab) || categories[0];

  return (
    <div className="command-panel">
      <div className="command-panel-header">
        <span className="command-panel-title">Claude Code 命令</span>
      </div>
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
      <div className="command-list">
        {currentCategory.commands.length === 0 ? (
          <div className="command-empty">
            还没有自定义命令
          </div>
        ) : (
          currentCategory.commands.map((cmd) => (
            <div key={cmd.id} className="command-item-group">
              <button
                className="command-item"
                onClick={() => onWriteCommand(cmd.command)}
                disabled={writing}
                title={cmd.command}
              >
                <span className="command-text">{cmd.command}</span>
                <span className="command-desc">{cmd.description}</span>
              </button>
              {activeTab === 'custom' && (
                <div className="command-actions">
                  <button
                    className="command-action-btn edit"
                    onClick={() => {
                      const found = customCommands.find((c) => c.id === cmd.id);
                      if (found) openEditDialog(found);
                    }}
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button
                    className="command-action-btn delete"
                    onClick={() => handleDeleteCustom(cmd.id)}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {activeTab === 'custom' && (
          <button className="command-add-btn" onClick={openAddDialog}>
            + 添加自定义命令
          </button>
        )}
      </div>
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
