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
  noteMode: boolean;
  onToggleNoteMode: () => void;
  notesPanelOpen: boolean;
  onToggleNotesPanel: () => void;
  getIndicatorStatus: (tabId: string) => 'idle' | 'running' | 'waiting' | 'error' | 'completed';
  indicatorTick: number;
}

function TabBar({ tabs, activeTabId, onSwitch, onClose, onNewConversation, noteMode, onToggleNoteMode, notesPanelOpen, onToggleNotesPanel, getIndicatorStatus, indicatorTick }: TabBarProps) {
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

          const indicator = tab.type === 'terminal' ? getIndicatorStatus(tab.tabId) : 'idle';
          void indicatorTick; // re-render when indicators change

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
              <span className={`tab-indicator ${indicator}`} />
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
        className={`note-mode-btn${noteMode ? ' active' : ''}`}
        onClick={onToggleNoteMode}
        title={noteMode ? '关闭学习笔记模式' : '开启学习笔记模式'}
      >
        {noteMode ? '\u{1F4D6}' : '\u{1F4D5}'}
      </button>
      <button
        className={`notes-panel-btn${notesPanelOpen ? ' active' : ''}`}
        onClick={onToggleNotesPanel}
        title="查看学习笔记"
      >
        {'\u{1F4C4}'}
      </button>
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
