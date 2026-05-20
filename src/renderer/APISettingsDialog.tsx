import React, { useState, useEffect } from 'react';

interface APISettingsDialogProps {
  open: boolean;
  config: APIConfig;
  onClose: () => void;
  onSave: (config: APIConfig) => void;
}

interface ProviderPreset {
  name: string;
  model: string;
  baseUrl: string;
}

const PRESETS: Record<string, ProviderPreset> = {
  anthropic:    { name: 'Anthropic (Claude)',       model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com/v1/messages' },
  openai:       { name: 'OpenAI (GPT)',             model: 'gpt-4o',                   baseUrl: 'https://api.openai.com/v1/chat/completions' },
  deepseek:     { name: 'DeepSeek',                 model: 'deepseek-chat',            baseUrl: 'https://api.deepseek.com/v1/chat/completions' },
  zhipu:        { name: '智谱 GLM',                 model: 'glm-4-flash',              baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  qwen:         { name: '通义千问 (Qwen)',          model: 'qwen-turbo',               baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
  kimi:         { name: '月之暗面 (Kimi)',          model: 'moonshot-v1-8k',           baseUrl: 'https://api.moonshot.cn/v1/chat/completions' },
  doubao:       { name: '豆包 (Doubao)',            model: 'doubao-lite-128k',         baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
  custom:       { name: 'Custom (自定义)',           model: '',                        baseUrl: '' },
};

const DEFAULT_CONFIG: APIConfig = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  baseUrl: 'https://api.anthropic.com/v1/messages',
};

function APISettingsDialog({ open, config, onClose, onSave }: APISettingsDialogProps) {
  const [local, setLocal] = useState<APIConfig>(config || DEFAULT_CONFIG);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) setLocal(config || DEFAULT_CONFIG);
  }, [open, config]);

  const handleProviderChange = (provider: string) => {
    const preset = PRESETS[provider];
    if (preset) {
      setLocal(prev => ({
        ...prev,
        provider,
        model: preset.model || '',
        baseUrl: preset.baseUrl || '',
      }));
    } else {
      setLocal(prev => ({ ...prev, provider }));
    }
  };

  if (!open) return null;

  const isCustom = local.provider === 'custom' || !PRESETS[local.provider];

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog api-settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>API Settings</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          <div className="api-warning">
            Token consumption: Each note generation sends the Q&A conversation to the API. Estimated ~500-2000 input tokens + ~100-300 output tokens per note.
          </div>

          <div className="dialog-field">
            <label>Provider</label>
            <select
              value={isCustom ? 'custom' : local.provider}
              onChange={e => handleProviderChange(e.target.value)}
            >
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="dialog-field">
            <label>Base URL</label>
            <input
              type="text"
              value={local.baseUrl}
              onChange={e => setLocal(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder={PRESETS[local.provider]?.baseUrl || 'https://api.example.com/v1/chat/completions'}
            />
          </div>

          <div className="dialog-field">
            <label>API Key</label>
            <div className="api-key-input-wrapper">
              <input
                type={showKey ? 'text' : 'password'}
                value={local.apiKey}
                onChange={e => setLocal(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
              />
              <button
                className="api-key-toggle"
                onClick={() => setShowKey(v => !v)}
                title={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="dialog-field">
            <label>Model</label>
            <input
              type="text"
              value={local.model}
              onChange={e => setLocal(prev => ({ ...prev, model: e.target.value }))}
              placeholder={PRESETS[local.provider]?.model || 'model-name'}
            />
          </div>

          <p className="api-note">
            Your API key is sent only to the configured Base URL. It is stored locally on your machine.
          </p>

          <div className="dialog-footer" style={{ marginTop: 8 }}>
            <button className="btn btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn btn-save" onClick={() => onSave(local)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default APISettingsDialog;
