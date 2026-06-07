/**
 * ui.js
 *
 * UI helper functions - rendering, DOM manipulation, toast notifications.
 * Keeps all the "paint stuff on screen" logic separate from the app logic in app.js.
 *
 * I separated this out because app.js was getting massive during development.
 * The split isn't perfect but it's good enough for this project size.
 */

const UI = (() => {

  // ====== Screen transitions ======

  function showLockScreen() {
    document.getElementById('lockScreen').classList.add('active');
    document.getElementById('lockScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('active');
  }

  function showAppScreen() {
    document.getElementById('lockScreen').classList.remove('active');
    document.getElementById('lockScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('active');
  }

  function showSetupForm() {
    document.getElementById('setupForm').classList.remove('hidden');
    document.getElementById('unlockForm').classList.add('hidden');
    setTimeout(() => document.getElementById('setupPassword').focus(), 100);
  }

  function showUnlockForm() {
    document.getElementById('unlockForm').classList.remove('hidden');
    document.getElementById('setupForm').classList.add('hidden');
    setTimeout(() => document.getElementById('unlockPassword').focus(), 100);
  }

  // ====== Notes List ======

  /**
   * Renders the notes list in the sidebar.
   *
   * @param {Array} notes - Filtered/sorted array of note objects
   * @param {string|null} activeNoteId - Currently selected note id
   */
  function renderNotesList(notes, activeNoteId) {
    const list = document.getElementById('notesList');

    if (!notes || notes.length === 0) {
      list.innerHTML = '<div class="no-notes-msg">No notes found.</div>';
      return;
    }

    list.innerHTML = notes.map(note => {
      const isActive = note.id === activeNoteId;
      const date = _formatDate(note.modifiedAt);

      return `
        <div class="note-item ${isActive ? 'active' : ''}" data-id="${note.id}">
          <div class="note-item-title">${_escapeHtml(note.title || 'Untitled')}</div>
          <div class="note-item-preview">${_escapeHtml(note.preview || 'No preview available')}</div>
          <div class="note-item-meta">
            <span class="note-item-date">${date}</span>
            <span class="note-item-category">${note.category || 'other'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Updates the category count badges in the sidebar.
   * @param {object} counts - e.g. { all: 5, personal: 2, work: 1, study: 1, ideas: 0, other: 1 }
   */
  function updateCategoryCounts(counts) {
    const categories = ['all', 'personal', 'work', 'study', 'ideas', 'other'];
    categories.forEach(cat => {
      const el = document.getElementById(`${cat}Count`);
      if (el) el.textContent = counts[cat] || 0;
    });
  }

  // ====== Note Editor ======

  function showEmptyState() {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('noteEditor').classList.add('hidden');
  }

  function showNoteEditor() {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('noteEditor').classList.remove('hidden');
  }

  /**
   * Populates the editor with a note's data.
   * @param {object} note - The note object
   * @param {string} decryptedContent - Already-decrypted note body
   * @param {boolean} integrityOk - Whether the hash check passed
   */
  function loadNoteIntoEditor(note, decryptedContent, integrityOk) {
    document.getElementById('noteTitleInput').value = note.title || '';
    document.getElementById('noteContent').value = decryptedContent || '';
    document.getElementById('noteCategorySelect').value = note.category || 'personal';

    // Dates
    document.getElementById('createdDate').textContent = `Created ${_formatDate(note.createdAt)}`;
    document.getElementById('modifiedDate').textContent = `Modified ${_formatDate(note.modifiedAt)}`;

    // Word count
    updateWordCount(decryptedContent || '');

    // Hash display
    const shortHash = note.contentHash ? `SHA-256: ${note.contentHash.substring(0, 16)}...` : '';
    document.getElementById('hashDisplay').textContent = shortHash;
    document.getElementById('hashDisplay').title = `Full hash: ${note.contentHash || 'none'}`;

    // Integrity badge
    updateIntegrityBadge(integrityOk, false);

    // Auto-save indicator
    setAutoSaveStatus('saved');
  }

  function loadNewNoteIntoEditor() {
    document.getElementById('noteTitleInput').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteCategorySelect').value = 'personal';
    document.getElementById('createdDate').textContent = 'New note';
    document.getElementById('modifiedDate').textContent = '';
    document.getElementById('hashDisplay').textContent = '';
    document.getElementById('wordCount').textContent = '0 words';

    updateIntegrityBadge(true, true); // "new note" state
    setAutoSaveStatus('');

    // Focus the title
    setTimeout(() => document.getElementById('noteTitleInput').focus(), 50);
  }

  function updateWordCount(text) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const wordEl = document.getElementById('wordCount');
    if (wordEl) wordEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  }

  function updateIntegrityBadge(isOk, isNew) {
    const badge = document.getElementById('integrityBadge');
    if (!badge) return;

    badge.className = 'integrity-badge';

    if (isNew) {
      badge.classList.add('new-note');
      badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>New</span>
      `;
    } else if (isOk) {
      badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Verified</span>
      `;
    } else {
      badge.classList.add('warning');
      badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        <span>Modified externally</span>
      `;
    }
  }

  function setAutoSaveStatus(status) {
    const el = document.getElementById('autoSaveIndicator');
    if (!el) return;

    el.className = 'autosave-indicator';
    if (status === 'saving') {
      el.textContent = 'saving...';
      el.classList.add('saving');
    } else if (status === 'saved') {
      el.textContent = 'saved';
      el.classList.add('saved');
    } else {
      el.textContent = '';
    }
  }

  // ====== Password Strength UI ======

  function updateStrengthMeter(password, fillId, labelId) {
    const result = Encryption.checkPasswordStrength(password);
    const fill = document.getElementById(fillId);
    const label = document.getElementById(labelId);
    if (!fill || !label) return;

    fill.className = 'strength-fill';
    label.className = 'strength-label';

    if (result.level) {
      fill.classList.add(result.level);
      label.classList.add(result.level);
    }

    label.textContent = result.label;
    return result;
  }

  // ====== Modals ======

  function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  /**
   * Shows a confirmation dialog.
   * Returns a promise that resolves to true (confirm) or false (cancel).
   *
   * @param {string} title
   * @param {string} message
   * @param {string} confirmLabel - Text for confirm button
   * @returns {Promise<boolean>}
   */
  function confirm(title, message, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      document.getElementById('confirmOkBtn').textContent = confirmLabel;

      showModal('confirmModal');

      const ok = document.getElementById('confirmOkBtn');
      const cancel = document.getElementById('confirmCancelBtn');

      function cleanup() {
        hideModal('confirmModal');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
      }

      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  // ====== Toast Notifications ======

  /**
   * Shows a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} type
   * @param {number} duration - ms before auto-dismiss
   */
  function toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');

    const icons = {
      success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
    };

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-content">${_escapeHtml(message)}</span>
    `;

    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('fade-out');
      el.addEventListener('animationend', () => el.remove());
    }, duration);
  }

  // ====== Theme ======

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const lightIcon = document.getElementById('themeIconLight');
    const darkIcon = document.getElementById('themeIconDark');
    if (lightIcon && darkIcon) {
      lightIcon.style.display = theme === 'dark' ? 'none' : '';
      darkIcon.style.display = theme === 'dark' ? '' : 'none';
    }
  }

  // ====== Category filter highlight ======

  function setActiveCategory(category) {
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
  }

  // ====== Helpers ======

  function _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than a minute ago
    if (diff < 60000) return 'just now';
    // Less than an hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than a day
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than a week
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    // Show full date for older notes
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return {
    showLockScreen,
    showAppScreen,
    showSetupForm,
    showUnlockForm,
    renderNotesList,
    updateCategoryCounts,
    showEmptyState,
    showNoteEditor,
    loadNoteIntoEditor,
    loadNewNoteIntoEditor,
    updateWordCount,
    updateIntegrityBadge,
    setAutoSaveStatus,
    updateStrengthMeter,
    showModal,
    hideModal,
    confirm,
    toast,
    applyTheme,
    setActiveCategory
  };

})();
