import React, { useState, useRef, useEffect } from 'react';
import { ThemeState, RAINBOW_PRESETS, applyTheme, DEFAULT_THEME, isLightColor } from './themeEngine';

interface ThemeDialogProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeState;
  onApply: (t: ThemeState) => void;
}

function ThemeDialog({ open, onClose, theme, onApply }: ThemeDialogProps) {
  const [local, setLocal] = useState<ThemeState>(theme);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(theme); }, [theme]);

  if (!open) return null;

  const update = (patch: Partial<ThemeState>) => setLocal({ ...local, ...patch });

  const handleImagePick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => update({ backgroundImage: reader.result as string });
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const gradientColors = local.gradientColors;
  const addGradientStop = (color: string) => {
    if (gradientColors.length < 5) {
      update({ gradientColors: [...gradientColors, color] });
    }
  };
  const removeGradientStop = (i: number) => {
    if (gradientColors.length > 2) {
      update({ gradientColors: gradientColors.filter((_, idx) => idx !== i) });
    }
  };
  const setGradientColor = (i: number, color: string) => {
    const next = [...gradientColors];
    next[i] = color;
    update({ gradientColors: next });
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog theme-dialog" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="dialog-header">
          <h3>主题设置</h3>
          <button className="dialog-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="dialog-body">
          {/* Mode selector */}
          <div className="theme-mode-tabs">
            {(['solid', 'gradient', 'image'] as const).map(m => (
              <button
                key={m}
                className={`theme-mode-tab ${local.mode === m ? 'active' : ''}`}
                onClick={() => update({ mode: m })}
              >
                {{ solid: '纯色', gradient: '渐变', image: '图片背景' }[m]}
              </button>
            ))}
          </div>

          {/* Solid mode */}
          {local.mode === 'solid' && (
            <div className="theme-section">
              <label>选择颜色</label>
              <div className="theme-preset-grid">
                {RAINBOW_PRESETS.map(p => (
                  <button
                    key={p.name}
                    className={`theme-preset-btn ${local.solidColor === p.color ? 'active' : ''}`}
                    style={{ background: p.color }}
                    onClick={() => update({ solidColor: p.color })}
                    title={p.name}
                  >
                    <span style={{ color: isLightColor(p.color) ? '#1e1e2e' : '#fff' }}>
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
              <div className="theme-field-row">
                <label>自定义颜色</label>
                <input
                  type="color"
                  value={local.solidColor}
                  onChange={(e) => update({ solidColor: e.target.value })}
                  className="theme-color-input"
                />
                <span className="theme-color-value">{local.solidColor}</span>
              </div>
            </div>
          )}

          {/* Gradient mode */}
          {local.mode === 'gradient' && (
            <div className="theme-section">
              <label>渐变色标 ({gradientColors.length}/5)</label>
              <div className="theme-gradient-stops">
                {gradientColors.map((c, i) => (
                  <div key={i} className="theme-gradient-stop">
                    <input
                      type="color"
                      value={c}
                      onChange={(e) => setGradientColor(i, e.target.value)}
                      className="theme-color-input"
                    />
                    <span className="theme-stop-hex">{c}</span>
                    {gradientColors.length > 2 && (
                      <button className="theme-stop-remove" onClick={() => removeGradientStop(i)}>&#x2715;</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="theme-field-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {RAINBOW_PRESETS.map(p => (
                  <button
                    key={p.name}
                    className="theme-add-stop-btn"
                    style={{ background: p.color, width: 24, height: 24, borderRadius: 12, border: '2px solid transparent', cursor: 'pointer' }}
                    onClick={() => addGradientStop(p.color)}
                    title={`添加 ${p.name}`}
                  />
                ))}
              </div>
              <div className="theme-field-row" style={{ marginTop: 12 }}>
                <label>角度: {local.gradientAngle}&#x00B0;</label>
                <input
                  type="range"
                  min={0} max={360}
                  value={local.gradientAngle}
                  onChange={(e) => update({ gradientAngle: Number(e.target.value) })}
                  className="theme-slider"
                />
              </div>
              <div
                className="theme-gradient-preview"
                style={{ background: `linear-gradient(${local.gradientAngle}deg, ${gradientColors.join(', ')})` }}
              />
            </div>
          )}

          {/* Image mode */}
          {local.mode === 'image' && (
            <div className="theme-section">
              <div className="theme-field-row">
                <label>背景图片</label>
                <button className="btn btn-cancel" onClick={handleImagePick}>
                  {local.backgroundImage ? '更换图片' : '选择图片...'}
                </button>
                {local.backgroundImage && (
                  <button className="btn btn-cancel" onClick={() => update({ backgroundImage: null })}>
                    移除
                  </button>
                )}
              </div>
              {local.backgroundImage && (
                <div className="theme-image-preview" style={{ backgroundImage: `url(${local.backgroundImage})` }} />
              )}

              <div className="theme-field-row" style={{ marginTop: 12 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={local.glassEnabled}
                    onChange={(e) => update({ glassEnabled: e.target.checked })}
                  />
                  {' '}玻璃层
                </label>
              </div>

              {local.glassEnabled && (
                <>
                  <div className="theme-field-row" style={{ marginTop: 8 }}>
                    <label>玻璃颜色</label>
                    <input
                      type="color"
                      value={local.glassColor}
                      onChange={(e) => update({ glassColor: e.target.value })}
                      className="theme-color-input"
                    />
                  </div>
                  <div className="theme-field-row">
                    <label>不透明度: {Math.round(local.glassOpacity * 100)}%</label>
                    <input
                      type="range"
                      min={0} max={1} step={0.05}
                      value={local.glassOpacity}
                      onChange={(e) => update({ glassOpacity: Number(e.target.value) })}
                      className="theme-slider"
                    />
                  </div>
                  <div className="theme-field-row">
                    <label>模糊度: {local.glassBlur}px</label>
                    <input
                      type="range"
                      min={0} max={40} step={1}
                      value={local.glassBlur}
                      onChange={(e) => update({ glassBlur: Number(e.target.value) })}
                      className="theme-slider"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Apply button */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-cancel" onClick={onClose}>取消</button>
            <button
              className="btn btn-save"
              onClick={() => { applyTheme(local); onApply(local); onClose(); }}
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThemeDialog;
