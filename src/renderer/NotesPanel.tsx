import React, { useState, useMemo } from 'react';

interface NotesPanelProps {
  open: boolean;
  notes: LearningNote[];
  onClose: () => void;
  onUpdateNote: (noteId: string, updates: Partial<LearningNote>) => void;
  onDeleteNote: (noteId: string) => void;
  onExport: (noteIds: string[]) => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function NotesPanel({ open, notes, onClose, onUpdateNote, onDeleteNote, onExport }: NotesPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<'title' | 'summary' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const groups = useMemo(() => {
    const map = new Map<string, LearningNote[]>();
    for (const n of notes) {
      const key = n.tabName || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    const sorted = Array.from(map.entries()).sort(([, a], [, b]) => {
      const ta = new Date(b[0]?.createdAt || 0).getTime();
      const tb = new Date(a[0]?.createdAt || 0).getTime();
      return ta - tb;
    });
    return sorted;
  }, [notes]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const startEdit = (id: string, field: 'title' | 'summary', value: string) => {
    setEditingId(id);
    setEditField(field);
    setEditValue(value);
  };

  const saveEdit = () => {
    if (editingId && editField) {
      onUpdateNote(editingId, { [editField]: editValue });
    }
    setEditingId(null);
    setEditField(null);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast('Copied'));
  };

  const handleDelete = (id: string) => {
    onDeleteNote(id);
    setDeleteConfirm(null);
    showToast('Note deleted');
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleMeta = (id: string) => {
    setExpandedMeta(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="notes-panel">
      <div className="notes-panel-header">
        <h3>Learning Notes</h3>
        {notes.length > 0 && (
          <button className="notes-panel-export-btn" onClick={() => onExport([])} title="Export all">Export</button>
        )}
        <button className="notes-panel-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="notes-panel-body">
        {notes.length === 0 ? (
          <div className="notes-empty">
            <div className="notes-empty-icon">📖</div>
            <div>No notes yet</div>
            <div className="notes-empty-hint">
              Enable note mode and run AI commands to auto-generate notes.
            </div>
          </div>
        ) : (
          groups.map(([sessionName, sessionNotes]) => (
            <div className="notes-group" key={sessionName}>
              <div className="notes-group-header" onClick={() => toggleGroup(sessionName)}>
                <span className="notes-group-name">{sessionName}</span>
                <span className="notes-group-count">{sessionNotes.length}</span>
                <span className={'notes-group-chevron' + (collapsedGroups.has(sessionName) ? ' collapsed' : '')}>
                  ▼
                </span>
              </div>
              {!collapsedGroups.has(sessionName) && sessionNotes.map(note => (
                <div className="note-card" key={note.id}>
                  <div className="note-card-header">
                    {editingId === note.id && editField === 'title' ? (
                      <input
                        className="note-card-title-input"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                    ) : (
                      <span className="note-card-title" onClick={() => startEdit(note.id, 'title', note.title)}>
                        {note.title || 'Untitled'}
                      </span>
                    )}
                    <span className="note-card-time">{formatTime(note.createdAt)}</span>
                  </div>

                  {editingId === note.id && editField === 'summary' ? (
                    <textarea
                      className="note-card-summary-edit"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={e => { if (e.key === 'Escape') { setEditingId(null); } }}
                      autoFocus
                    />
                  ) : (
                    <div className="note-card-summary" onClick={() => startEdit(note.id, 'summary', note.summary)}>
                      {note.summary || 'No summary'}
                    </div>
                  )}

                  {note.tags && note.tags.length > 0 && (
                    <div className="note-card-tags">
                      {note.tags.map(tag => (
                        <span className="note-tag" key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}

                  <button className="note-card-meta-toggle" onClick={() => toggleMeta(note.id)}>
                    {expandedMeta.has(note.id) ? 'Hide Q&A' : 'Show Q&A'}
                  </button>

                  {expandedMeta.has(note.id) && (
                    <>
                      <div className="note-card-question">
                        <div className="note-card-question-label">Question</div>
                        <div className="note-card-question-text">{note.question}</div>
                      </div>
                      <div className="note-card-answer">
                        <div className="note-card-answer-label">Answer</div>
                        <div className="note-card-answer-text">{note.answer.slice(0, 500)}</div>
                      </div>
                    </>
                  )}

                  <div className="note-card-actions">
                    <button className="note-action" onClick={() => startEdit(note.id, 'summary', note.summary)}>Edit</button>
                    <button className="note-action" onClick={() => handleCopy(note.summary)}>Copy</button>
                    <button className="note-action" onClick={() => onExport([note.id])}>Export</button>
                    {deleteConfirm === note.id ? (
                      <>
                        <button className="note-action delete" onClick={() => handleDelete(note.id)}>Confirm</button>
                        <button className="note-action" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="note-action delete" onClick={() => setDeleteConfirm(note.id)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      {toast && <div className="note-panel-toast">{toast}</div>}
    </div>
  );
}

export default NotesPanel;
