/**
 * app.js
// Main app logic
// Handles notes, search, import/export and editor actions
*/

const App = (() => {

  // Application state
  let currentNoteId = null;       // ID of the note currently open in the editor
  let currentCategory = 'all';   // Active category filter
  let currentSearch = '';        // Current search query
  let isNewNote = false;         // True if editor has an unsaved new note
  let autoSaveTimer = null;      // Debounce timer for auto-save

  // ====== Initialization ======

  function init() {
    // Apply saved theme before anything renders
    const savedTheme = Storage.getTheme();
    UI.applyTheme(savedTheme);

    // Apply saved auto-lock setting to the settings dropdown
    const savedAutoLock = Storage.getAutoLockMinutes();
    const autoLockSelect = document.getElementById('autoLockSelect');
    if (autoLockSelect) autoLockSelect.value = String(savedAutoLock);

    // Set up the lock callback so Auth can trigger UI changes
    Auth.setOnLockCallback(() => {
      currentNoteId = null;
      isNewNote = false;
      UI.showLockScreen();
      UI.showUnlockForm();
      // Clear the unlock password field for security
      const pwField = document.getElementById('unlockPassword');
      if (pwField) pwField.value = '';
    });

    // Show correct screen based on whether vault exists
    if (Auth.hasVault()) {
      UI.showLockScreen();
      UI.showUnlockForm();
    } else {
      UI.showLockScreen();
      UI.showSetupForm();
    }

    // Wire up all event listeners
    _setupEventListeners();
  }

  // ====== App Start (after unlock) ======

  function startApp() {
    UI.showAppScreen();
    UI.showEmptyState();
    currentNoteId = null;
    isNewNote = false;
    currentCategory = 'all';
    currentSearch = '';

    // Reset search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    // Clear unlock password from DOM for security
    const unlockPw = document.getElementById('unlockPassword');
    if (unlockPw) unlockPw.value = '';

    _renderNotesList();
  }

  // ====== Notes List Rendering ======

  function _renderNotesList() {
    let notes = Storage.getAllNotes();

    // Apply category filter
    if (currentCategory !== 'all') {
      notes = notes.filter(n => n.category === currentCategory);
    }

    // Apply search filter
    if (currentSearch.trim()) {
      const query = currentSearch.trim().toLowerCase();
      notes = notes.filter(n =>
        (n.title || '').toLowerCase().includes(query) ||
        (n.preview || '').toLowerCase().includes(query) ||
        (n.category || '').toLowerCase().includes(query)
      );
    }

    UI.renderNotesList(notes, currentNoteId);
    _updateCounts();

    // Re-attach click listeners to note items
    document.querySelectorAll('.note-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id) openNote(id);
      });
    });
  }

  function _updateCounts() {
    const all = Storage.getAllNotes();
    const counts = { all: all.length };
    ['personal', 'work', 'study', 'ideas', 'other'].forEach(cat => {
      counts[cat] = all.filter(n => n.category === cat).length;
    });
    UI.updateCategoryCounts(counts);
  }

  // ====== Note Operations ======

  function openNote(id) {
    // If there's an unsaved new note in progress, we just discard it
    // (auto-save handles saving changes to existing notes)
    isNewNote = false;
    currentNoteId = id;

    const note = Storage.getNoteById(id);
    if (!note) {
      UI.toast('Could not find this note.', 'error');
      return;
    }

    const password = Auth.getSessionPassword();
    if (!password) {
      Auth.lock(); // shouldn't happen but be safe
      return;
    }

    // Decrypt content
    const decrypted = Encryption.decrypt(note.encryptedContent, password);
    if (decrypted === null) {
      UI.toast('Failed to decrypt this note. The file may be corrupted.', 'error');
      return;
    }

    // Verify integrity (SHA-256 of decrypted content should match stored hash)
    const computedHash = Encryption.sha256(decrypted);
    const integrityOk = computedHash === note.contentHash;

    if (!integrityOk) {
      UI.toast('⚠️ Integrity check failed! This note may have been tampered with.', 'warning', 5000);
    }

    UI.showNoteEditor();
    UI.loadNoteIntoEditor(note, decrypted, integrityOk);
    _renderNotesList(); // refresh active state in sidebar
  }

  function createNewNote() {
    isNewNote = true;
    currentNoteId = null;
    UI.showNoteEditor();
    UI.loadNewNoteIntoEditor();
    UI.setAutoSaveStatus('');
    _renderNotesList(); // deselect any active note in sidebar
  }

  function saveCurrentNote() {
    const password = Auth.getSessionPassword();
    if (!password) return;

    const title = document.getElementById('noteTitleInput').value.trim() || 'Untitled';
    const content = document.getElementById('noteContent').value;
    const category = document.getElementById('noteCategorySelect').value;

    // Encrypt content
    let encryptedContent;
    try {
      encryptedContent = Encryption.encrypt(content, password);
    } catch (err) {
      UI.toast('Encryption failed. Note not saved.', 'error');
      return;
    }

    // Generate integrity hash from plaintext
    const contentHash = Encryption.sha256(content);

    // Generate a short preview for the sidebar (from plaintext, not encrypted)
    const preview = content.substring(0, 80).replace(/\n/g, ' ');

    const noteData = {
      id: currentNoteId || undefined, // undefined = create new
      title,
      encryptedContent,
      contentHash,
      preview,
      category
    };

    try {
      const saved = Storage.saveNote(noteData);
      currentNoteId = saved.id;
      isNewNote = false;

      // Update the hash display
      const hashDisplay = document.getElementById('hashDisplay');
      if (hashDisplay) {
        hashDisplay.textContent = `SHA-256: ${contentHash.substring(0, 16)}...`;
        hashDisplay.title = `Full hash: ${contentHash}`;
      }

      // Update meta dates
      document.getElementById('modifiedDate').textContent = `Modified just now`;

      UI.updateIntegrityBadge(true, false);
      UI.setAutoSaveStatus('saved');
      _renderNotesList();

      return true;
    } catch (err) {
      UI.toast(err.message || 'Failed to save note.', 'error');
      return false;
    }
  }

  async function deleteCurrentNote() {
    if (!currentNoteId && !isNewNote) return;

    if (isNewNote) {
      // Just discard the unsaved new note
      currentNoteId = null;
      isNewNote = false;
      UI.showEmptyState();
      _renderNotesList();
      return;
    }

    const confirmed = await UI.confirm(
      'Delete Note',
      'Are you sure you want to delete this note? This cannot be undone.',
      'Delete'
    );

    if (!confirmed) return;

    Storage.deleteNote(currentNoteId);
    currentNoteId = null;
    isNewNote = false;
    UI.showEmptyState();
    UI.toast('Note deleted.', 'success');
    _renderNotesList();
  }

  // ====== Auto-save (debounced) ======

  function _scheduleAutoSave() {
    UI.setAutoSaveStatus('saving');
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    // Only auto-save existing notes (not brand new ones with no content)
    autoSaveTimer = setTimeout(() => {
      const hasContent = document.getElementById('noteContent').value.trim();
      const hasTitle = document.getElementById('noteTitleInput').value.trim();

      if (hasContent || hasTitle) {
        saveCurrentNote();
      }
    }, 1500); // 1.5s delay after last keystroke
  }

  // ====== Export ======

  function exportAsTxt() {
    const title = document.getElementById('noteTitleInput').value || 'Untitled';
    const content = document.getElementById('noteContent').value;

    if (!content && !title) {
      UI.toast('Nothing to export.', 'warning');
      return;
    }

    const text = `${title}\n${'='.repeat(title.length)}\n\n${content}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${_sanitizeFilename(title)}.txt`;
    a.click();

    URL.revokeObjectURL(url);
    UI.toast('Exported as TXT.', 'success');
  }

  function exportAsPdf() {
    const title = document.getElementById('noteTitleInput').value || 'Untitled';
    const content = document.getElementById('noteContent').value;

    if (!content && !title) {
      UI.toast('Nothing to export.', 'warning');
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(title, margin, margin + 10);

      // Metadata line
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      const category = document.getElementById('noteCategorySelect').value;
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.text(`Category: ${category}  |  Exported: ${dateStr}`, margin, margin + 18);

      // Divider
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, margin + 22, pageWidth - margin, margin + 22);

      // Content - jsPDF handles word wrapping with splitTextToSize
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(content, contentWidth);

      let y = margin + 32;
      const lineHeight = 6;
      const pageHeight = doc.internal.pageSize.getHeight();

      lines.forEach(line => {
        if (y + lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      });

      // Footer on each page with page numbers
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${i} of ${totalPages} — Secure Notes Manager`, margin, pageHeight - 10);
      }

      doc.save(`${_sanitizeFilename(title)}.pdf`);
      UI.toast('Exported as PDF.', 'success');
    } catch (err) {
      console.error('PDF export failed:', err);
      UI.toast('PDF export failed. Try exporting as TXT instead.', 'error');
    }
  }

  // ====== Import ======

  function importTxtFile(file) {
    if (!file || !file.name.endsWith('.txt')) {
      UI.toast('Only .txt files are supported.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const title = file.name.replace('.txt', '');

      // Put content into the editor as a new note
      document.getElementById('noteTitleInput').value = title;
      document.getElementById('noteContent').value = content;
      UI.updateWordCount(content);

      isNewNote = true;
      currentNoteId = null;
      UI.showNoteEditor();
      UI.updateIntegrityBadge(true, true);

      UI.toast(`Imported "${title}". Save to encrypt and store it.`, 'info', 4000);
    };

    reader.onerror = () => {
      UI.toast('Failed to read file.', 'error');
    };

    reader.readAsText(file);
  }

  // ====== Keyboard Shortcuts ======

  function _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't fire if user is typing in an input/textarea (except for specific ones)
      const tag = document.activeElement.tagName;
      const isInput = tag === 'INPUT' || tag === 'SELECT';

      // Ctrl+S - Save (works everywhere in app)
      if (e.ctrlKey && e.key === 's' && !Auth.getIsLocked()) {
        e.preventDefault();
        if (currentNoteId || isNewNote) {
          saveCurrentNote();
          UI.toast('Note saved.', 'success', 1500);
        }
      }

      // Ctrl+N - New note
      if (e.ctrlKey && e.key === 'n' && !Auth.getIsLocked()) {
        e.preventDefault();
        createNewNote();
      }

      // Ctrl+L - Lock vault
      if (e.ctrlKey && e.key === 'l' && !Auth.getIsLocked()) {
        e.preventDefault();
        Auth.lock();
      }

      // Escape - close export menu or modals
      if (e.key === 'Escape') {
        document.getElementById('exportMenu').classList.add('hidden');
        UI.hideModal('settingsModal');
        UI.hideModal('confirmModal');
      }

      // Enter on unlock form
      if (e.key === 'Enter' && document.activeElement.id === 'unlockPassword') {
        handleUnlock();
      }
    });
  }

  // ====== Event Listeners ======

  function _setupEventListeners() {
    // ---- Lock screen ----

    document.getElementById('setupBtn').addEventListener('click', handleSetup);
    document.getElementById('unlockBtn').addEventListener('click', handleUnlock);

    // Allow pressing Enter in password fields
    document.getElementById('setupPassword').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('confirmPassword').focus();
    });
    document.getElementById('confirmPassword').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSetup();
    });

    // Password strength meter on setup
    document.getElementById('setupPassword').addEventListener('input', e => {
      UI.updateStrengthMeter(e.target.value, 'strengthFill', 'strengthLabel');
    });

    // Toggle password visibility buttons
    document.querySelectorAll('.toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    });

    // Reset vault
    document.getElementById('resetVaultBtn').addEventListener('click', async () => {
      const confirmed = await UI.confirm(
        'Reset Vault',
        'This will permanently delete ALL notes and your master password. This cannot be undone.',
        'Reset Everything'
      );
      if (confirmed) {
        Auth.resetVault();
        UI.showSetupForm();
        UI.toast('Vault has been reset.', 'info');
      }
    });

    // ---- App toolbar ----

    document.getElementById('newNoteBtn').addEventListener('click', createNewNote);
    document.getElementById('emptyNewBtn').addEventListener('click', createNewNote);
    document.getElementById('saveNoteBtn').addEventListener('click', () => {
      if (saveCurrentNote()) {
        UI.toast('Note saved.', 'success', 1500);
      }
    });
    document.getElementById('deleteNoteBtn').addEventListener('click', deleteCurrentNote);
    document.getElementById('lockBtn').addEventListener('click', () => Auth.lock());

    // ---- Editor auto-save and word count ----

    document.getElementById('noteContent').addEventListener('input', e => {
      UI.updateWordCount(e.target.value);
      _scheduleAutoSave();
    });

    document.getElementById('noteTitleInput').addEventListener('input', () => {
      _scheduleAutoSave();
    });

    // ---- Search ----

    document.getElementById('searchInput').addEventListener('input', e => {
      currentSearch = e.target.value;
      const clearBtn = document.getElementById('clearSearch');
      clearBtn.classList.toggle('hidden', !currentSearch);
      _renderNotesList();
    });

    document.getElementById('clearSearch').addEventListener('click', () => {
      currentSearch = '';
      document.getElementById('searchInput').value = '';
      document.getElementById('clearSearch').classList.add('hidden');
      _renderNotesList();
    });

    // ---- Category filter ----

    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCategory = btn.dataset.category;
        UI.setActiveCategory(currentCategory);
        _renderNotesList();
      });
    });

    // ---- Theme toggle ----

    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      UI.applyTheme(next);
      Storage.setTheme(next);
    });

    // ---- Export ----

    document.getElementById('exportBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('exportMenu').classList.toggle('hidden');
    });

    // Close export menu when clicking outside
    document.addEventListener('click', () => {
      document.getElementById('exportMenu').classList.add('hidden');
    });

    document.getElementById('exportTxtBtn').addEventListener('click', () => {
      document.getElementById('exportMenu').classList.add('hidden');
      exportAsTxt();
    });

    document.getElementById('exportPdfBtn').addEventListener('click', () => {
      document.getElementById('exportMenu').classList.add('hidden');
      exportAsPdf();
    });

    // ---- Import ----

    document.getElementById('importFileBtn').addEventListener('click', () => {
      document.getElementById('fileImportInput').click();
    });

    document.getElementById('fileImportInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importTxtFile(file);
        // Reset so same file can be imported again if needed
        e.target.value = '';
      }
    });

    // ---- Settings ----

    document.getElementById('settingsBtn').addEventListener('click', () => {
      UI.showModal('settingsModal');
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
      UI.hideModal('settingsModal');
    });

    // Close modal on backdrop click
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') UI.hideModal('settingsModal');
    });

    // Auto-lock setting
    document.getElementById('autoLockSelect').addEventListener('change', (e) => {
      Storage.setAutoLockMinutes(parseInt(e.target.value));
      UI.toast('Auto-lock setting saved.', 'success', 1500);
    });

    // Change password in settings
    document.getElementById('newPwInput').addEventListener('input', e => {
      UI.updateStrengthMeter(e.target.value, 'newStrengthFill', 'newStrengthLabel');
    });

    document.getElementById('changePasswordBtn').addEventListener('click', () => {
      const current = document.getElementById('currentPwInput').value;
      const newPw = document.getElementById('newPwInput').value;
      const confirm = document.getElementById('confirmNewPwInput').value;
      const msgEl = document.getElementById('passwordChangeMsg');

      const result = Auth.changePassword(current, newPw, confirm);
      msgEl.classList.remove('hidden');

      if (result.success) {
        msgEl.textContent = '✓ Password updated successfully.';
        msgEl.className = 'strength-label strong';
        document.getElementById('currentPwInput').value = '';
        document.getElementById('newPwInput').value = '';
        document.getElementById('confirmNewPwInput').value = '';
        UI.toast('Password changed successfully.', 'success');
      } else {
        msgEl.textContent = `✗ ${result.error}`;
        msgEl.className = 'strength-label weak';
      }
    });

    _setupKeyboardShortcuts();
  }

  // ====== Auth Handlers ======

  function handleSetup() {
    const password = document.getElementById('setupPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    const result = Auth.setupVault(password, confirm);

    if (result.success) {
      startApp();
      UI.toast('Vault created! Welcome to Secure Notes.', 'success');
    } else {
      UI.toast(result.error, 'error');
    }
  }

  function handleUnlock() {
    const password = document.getElementById('unlockPassword').value;

    const success = Auth.unlock(password);

    if (success) {
      document.getElementById('loginError').classList.add('hidden');
      startApp();
    } else {
      document.getElementById('loginError').classList.remove('hidden');
      // Shake the input for feedback
      const input = document.getElementById('unlockPassword');
      input.select();
    }
  }

  // ====== Helpers ======

  function _sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_').substring(0, 50) || 'note';
  }

  // ====== Start ======
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose minimal public API (mostly for debugging)
  return {
    createNewNote,
    saveCurrentNote,
    openNote
  };

})();
