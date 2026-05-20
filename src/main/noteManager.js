const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getNotesDir() {
  return path.join(app.getPath('userData'), 'notes');
}

function getNotesFilePath() {
  return path.join(getNotesDir(), 'notes.json');
}

function ensureNotesDir() {
  const dir = getNotesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadAllNotes() {
  try {
    const filePath = getNotesFilePath();
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[noteManager] loadAllNotes error:', err.message);
    return [];
  }
}

function saveAllNotes(notes) {
  try {
    ensureNotesDir();
    fs.writeFileSync(getNotesFilePath(), JSON.stringify(notes, null, 2), 'utf-8');
  } catch (err) {
    console.error('[noteManager] saveAllNotes error:', err.message);
    throw err;
  }
}

function addNote(note) {
  const notes = loadAllNotes();
  notes.push(note);
  saveAllNotes(notes);
  return note;
}

function updateNote(noteId, updates) {
  const notes = loadAllNotes();
  const idx = notes.findIndex(n => n.id === noteId);
  if (idx === -1) return false;
  notes[idx] = { ...notes[idx], ...updates, updatedAt: new Date().toISOString() };
  saveAllNotes(notes);
  return true;
}

function deleteNote(noteId) {
  const notes = loadAllNotes();
  const filtered = notes.filter(n => n.id !== noteId);
  if (filtered.length === notes.length) return false;
  saveAllNotes(filtered);
  return true;
}

function generateMarkdown(notes) {
  const header = '# Learning Notes Export\n' +
    'Exported: ' + new Date().toISOString().slice(0, 10) + '\n\n';

  const groups = new Map();
  for (const n of notes) {
    const key = n.tabName || 'Unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  let body = '';
  for (const [session, sessionNotes] of groups) {
    body += '## Session: ' + session + '\n\n';
    for (const n of sessionNotes) {
      body += '### ' + (n.title || 'Untitled') + '\n\n';
      body += '**Question:** `' + (n.question || '') + '`  \n';
      body += '**Tags:** ' + (n.tags || []).join(', ') + '  \n';
      body += '**Date:** ' + (n.createdAt || '') + '\n\n';
      body += (n.summary || '') + '\n\n';
      body += '---\n\n';
    }
  }

  return header + body;
}

module.exports = {
  getNotesFilePath,
  loadAllNotes,
  saveAllNotes,
  addNote,
  updateNote,
  deleteNote,
  generateMarkdown,
};
