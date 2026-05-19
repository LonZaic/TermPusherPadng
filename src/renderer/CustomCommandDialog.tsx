import React, { useState } from 'react';

interface CommandOption {
  command: string;
  description: string;
  toolName: string;
}

interface CustomCommandDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, command: string, overrideTarget: string | null) => void;
  editData?: { name: string; command: string } | null;
  builtinCommands?: CommandOption[];
}

function CustomCommandDialog({ open, onClose, onSave, editData, builtinCommands }: CustomCommandDialogProps) {
  const [name, setName] = useState(editData?.name ?? '');
  const [command, setCommand] = useState(editData?.command ?? '');
  const [nameError, setNameError] = useState('');
  const [commandError, setCommandError] = useState('');
  const [overrideTarget, setOverrideTarget] = useState<string>('');

  if (!open) return null;

  const handleSave = () => {
    let valid = true;
    if (!name.trim()) {
      setNameError('请输入按钮名称');
      valid = false;
    } else {
      setNameError('');
    }
    if (!command.trim()) {
      setCommandError('请输入命令内容');
      valid = false;
    } else {
      setCommandError('');
    }
    if (!valid) return;
    onSave(name.trim(), command.trim(), overrideTarget || null);
    setName('');
    setCommand('');
    setOverrideTarget('');
    setNameError('');
    setCommandError('');
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const cmds = builtinCommands || [];

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog">
        <div className="dialog-header">
          <h3>{editData ? '编辑自定义命令' : '添加自定义命令'}</h3>
          <button className="dialog-close" onClick={onClose}>✕</button>
        </div>
        <div className="dialog-body">
          <div className="dialog-field">
            <label>按钮名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder="例如：启动 dev server"
              autoFocus
            />
            {nameError && <span className="dialog-error">{nameError}</span>}
          </div>
          <div className="dialog-field">
            <label>命令内容 <span className="dialog-label-hint">支持多行/长文本，可直接粘贴完整脚本</span></label>
            <textarea
              value={command}
              onChange={(e) => { setCommand(e.target.value); setCommandError(''); }}
              placeholder="例如：npm run dev"
              rows={4}
            />
            {commandError && <span className="dialog-error">{commandError}</span>}
          </div>
          <div className="dialog-field">
            <label>覆盖已有命令 <span className="dialog-label-hint">选一个原命令替换，或仅添加</span></label>
            <div className="dialog-override-row">
              <button
                type="button"
                className={`dialog-override-skip ${!overrideTarget ? 'active' : ''}`}
                onClick={() => setOverrideTarget('')}
              >
                不覆盖，仅添加
              </button>
              <select
                className="dialog-select"
                value={overrideTarget}
                onChange={(e) => setOverrideTarget(e.target.value)}
              >
                <option value="">选择要覆盖的命令...</option>
                {cmds.map((c) => (
                  <option key={c.command} value={c.command}>
                    [{c.toolName}] {c.command} — {c.description}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-cancel" onClick={onClose}>取消</button>
          <button className="btn btn-save" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

export default CustomCommandDialog;
