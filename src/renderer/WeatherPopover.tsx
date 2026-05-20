import React from 'react';
import type { WeatherType, WeatherIntensity } from './WeatherEffect';

interface WeatherConfig {
  type: WeatherType;
  intensity: WeatherIntensity;
}

interface Props {
  config: WeatherConfig;
  onChange: (config: WeatherConfig) => void;
  onClose: () => void;
}

const INTENSITY_LABELS: Record<WeatherIntensity, string> = {
  light: '小',
  medium: '中',
  heavy: '大',
};

const WeatherPopover: React.FC<Props> = ({ config, onChange, onClose }) => {
  return (
    <>
      <div className="weather-popover-backdrop" onClick={onClose} />
      <div className="weather-popover">
        <div className="weather-popover-title">天气效果</div>

        <div className="weather-section">
          <div className="weather-section-label">🌧 雨</div>
          <div className="weather-options">
            {(['light', 'medium', 'heavy'] as WeatherIntensity[]).map((int) => (
              <button
                key={`rain-${int}`}
                className={`weather-option${config.type === 'rain' && config.intensity === int ? ' active' : ''}`}
                onClick={() => onChange({ type: 'rain', intensity: int })}
              >
                {int === 'light' ? '🌂' : int === 'medium' ? '🌧' : '⛈'}
                <span>{INTENSITY_LABELS[int]}雨</span>
              </button>
            ))}
          </div>
        </div>

        <div className="weather-section">
          <div className="weather-section-label">❄ 雪</div>
          <div className="weather-options">
            {(['light', 'medium', 'heavy'] as WeatherIntensity[]).map((int) => (
              <button
                key={`snow-${int}`}
                className={`weather-option${config.type === 'snow' && config.intensity === int ? ' active' : ''}`}
                onClick={() => onChange({ type: 'snow', intensity: int })}
              >
                {int === 'light' ? '❄' : int === 'medium' ? '🌨' : '❄️'}
                <span>{INTENSITY_LABELS[int]}雪</span>
              </button>
            ))}
          </div>
        </div>

        <button
          className={`weather-off-btn${config.type === 'off' ? ' active' : ''}`}
          onClick={() => onChange({ type: 'off', intensity: 'light' })}
        >
          关闭天气
        </button>
      </div>
    </>
  );
};

export default WeatherPopover;
