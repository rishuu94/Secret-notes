/**
// localStorage helper functions
*/
const Storage = (() => {

  // Key names - using a prefix to avoid collisions with other apps
  const KEYS = {
    MASTER_HASH: 'sn_master_hash',
    NOTES: 'sn_notes',
    THEME: 'sn_theme',
    AUTO_LOCK: 'sn_auto_lock'
  };

  // ====== Master Password ======

  function getMasterHash() {
    return localStorage.getItem(KEYS.MASTER_HASH);
  }

  function setMasterHash(hash) {
    localStorage.setItem(KEYS.MASTER_HASH, hash);
  }

  function hasMasterPassword() {
    return !!localStorage.getItem(KEYS.MASTER_HASH);
  }

  // ====== Notes ======

  function getAllNotes() {
    try {
      const raw = localStorage.getItem(KEYS.NOTES);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse notes from storage:', err);
      return [];
    }
  }

  function saveAllNotes(notes) {
    try {
      localStorage.setItem(KEYS.NOTES, JSON.stringify(notes));
    } catch (err) {
      // localStorage can run out of space (usually ~5MB limit)
      if (err.name === 'QuotaExceededError') {
        throw new Error('Storage is full. Please delete some notes to free up space.');
      }
      throw err;
    }
  }

  function getNoteById(id) {
    const notes = getAllNotes();
    return notes.find(n => n.id === id) || null;
  }

  /**
   * Saves (creates or updates) a single note.
   * Generates a new ID for new notes.
   *
   * @param {object} noteData - The note to save (without id for new notes)
   * @returns {object} - The saved note with id
   */
  function saveNote(noteData) {
    const notes = getAllNotes();

    if (noteData.id) {
      // Update existing note
      const idx = notes.findIndex(n => n.id === noteData.id);
      if (idx !== -1) {
        notes[idx] = { ...notes[idx], ...noteData, modifiedAt: Date.now() };
        saveAllNotes(notes);
        return notes[idx];
      }
    }

    // Create new note
    const newNote = {
      id: `note_${Date.now()}`,
      title: noteData.title || 'Untitled',
      encryptedContent: noteData.encryptedContent || '',
      contentHash: noteData.contentHash || '',
      category: noteData.category || 'personal',
      createdAt: Date.now(),
      modifiedAt: Date.now()
    };

    notes.unshift(newNote); // Add to top of list
    saveAllNotes(notes);
    return newNote;
  }

  function deleteNote(id) {
    const notes = getAllNotes();
    const filtered = notes.filter(n => n.id !== id);
    saveAllNotes(filtered);
  }

  // ====== Settings ======

  function getTheme() {
    return localStorage.getItem(KEYS.THEME) || 'light';
  }

  function setTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
  }

  function getAutoLockMinutes() {
    const stored = localStorage.getItem(KEYS.AUTO_LOCK);
    return stored !== null ? parseInt(stored) : 5; // default 5 min
  }

  function setAutoLockMinutes(minutes) {
    localStorage.setItem(KEYS.AUTO_LOCK, String(minutes));
  }

  /**
   * Completely wipes all app data from localStorage.
   * Used for the "reset vault" feature.
   */
  function clearAll() {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
  }

  return {
    getMasterHash,
    setMasterHash,
    hasMasterPassword,
    getAllNotes,
    getNoteById,
    saveNote,
    deleteNote,
    getTheme,
    setTheme,
    getAutoLockMinutes,
    setAutoLockMinutes,
    clearAll
  };

})();
