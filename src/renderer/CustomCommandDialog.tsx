import React, { useState } from 'react';

interface CustomCommandDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, command: string) => void;
  editData?: { name: string; command: string } | null;
}

function CustomCommandDialog({ open, onClose, onSave, editData }: CustomCommandDialogProps) {
  const [name, setName] = useState(editData?.name ?? '');
  const [command, setCommand] = useState(editData?.command ?? '');
  const [nameError, setNameError] = useState('');
  const [commandError, setCommandError] = useState('');

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
    onSave(name.trim(), command.trim());
    setName('');
    setCommand('');
    setNameError('');
    setCommandError('');
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

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
            <label>命令内容</label>
            <textarea
              value={command}
              onChange={(e) => { setCommand(e.target.value); setCommandError(''); }}
              placeholder="例如：npm run dev"
              rows={4}
            />
            {commandError && <span className="dialog-error">{commandError}</span>}
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
