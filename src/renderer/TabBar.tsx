import React from 'react';
import type { TabColor } from './tabColors';
import { tabColorCSS, tabColorLightCSS } from './tabColors';

interface Tab {
  tabId: string;
  name: string;
  projectPath: string | null;
  color: TabColor;
  type: 'terminal' | 'canvas';
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewConversation: () => void;
}

function TabBar({ tabs, activeTabId, onSwitch, onClose, onNewConversation }: TabBarProps) {
  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab) => {
          const isActive = tab.tabId === activeTabId;
          const bgColor = isActive
            ? tabColorLightCSS(tab.color)
            : tabColorCSS(tab.color);
          const textColor = isActive
            ? `hsl(${tab.color.h}, ${tab.color.s}%, ${Math.max(15, tab.color.l - 35)}%)`
            : '#cdd6f4';

          return (
            <div
              key={tab.tabId}
              className={`tab-item${isActive ? ' active' : ''}`}
              style={{
                backgroundColor: bgColor,
                color: textColor,
                borderTop: isActive
                  ? `2px solid ${tabColorCSS(tab.color)}`
                  : '2px solid transparent',
              }}
              onClick={() => onSwitch(tab.tabId)}
              title={tab.projectPath || tab.name}
            >
              <span className="tab-label">
                {tab.type === 'canvas' ? '\u{1F3A8} ' : ''}{tab.name}
              </span>
              {tabs.length > 1 && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.tabId);
                  }}
                  title="关闭标签"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="tab-new-btn"
        onClick={onNewConversation}
        title="新建对话"
      >
        +
      </button>
    </div>
  );
}

export default TabBar;
