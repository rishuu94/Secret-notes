// Authentication and auto-lock logic

const Auth = (() => {

  // Session state - this lives in memory only, never touches localStorage
  let sessionPassword = null;
  let lockTimer = null;
  let isLocked = true;

  // Callback to run when vault gets locked (set by app.js)
  let onLockCallback = null;

  /**
   * Call this to register what happens when the vault auto-locks.
   * @param {Function} callback
   */
  function setOnLockCallback(callback) {
    onLockCallback = callback;
  }

  /**
   * Checks if there's already a master password set up.
   */
  function hasVault() {
    return Storage.hasMasterPassword();
  }

  /**
   * Sets up the master password for the first time.
   * Hashes and stores it, then starts a session.
   *
   * @param {string} password
   * @param {string} confirmPassword
   * @returns {{ success: boolean, error?: string }}
   */
  function setupVault(password, confirmPassword) {
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    const strength = Encryption.checkPasswordStrength(password);
    if (strength.level === 'weak') {
      return { success: false, error: 'Please choose a stronger password.' };
    }

    const hash = Encryption.sha256(password);
    Storage.setMasterHash(hash);

    // Start session with this password
    _startSession(password);

    return { success: true };
  }

  /**
   * Attempts to unlock the vault with the provided password.
   *
   * @param {string} password
   * @returns {boolean} - true if successful
   */
  function unlock(password) {
    if (!password) return false;

    const storedHash = Storage.getMasterHash();
    const inputHash = Encryption.sha256(password);

    if (inputHash !== storedHash) {
      return false;
    }

    _startSession(password);
    return true;
  }

  /**
   * Locks the vault. Clears session password from memory.
   */
  function lock() {
    sessionPassword = null;
    isLocked = true;
    _clearLockTimer();

    if (onLockCallback) {
      onLockCallback();
    }
  }

  /**
   * Returns the current session password (for encryption/decryption).
   * Returns null if locked.
   */
  function getSessionPassword() {
    return sessionPassword;
  }

  function getIsLocked() {
    return isLocked;
  }

  /**
   * Changes the master password.
   * Re-encrypts all notes with the new password.
   *
   * @param {string} currentPassword
   * @param {string} newPassword
   * @param {string} confirmNewPassword
   * @returns {{ success: boolean, error?: string }}
   */
  function changePassword(currentPassword, newPassword, confirmNewPassword) {
    // Verify current password
    const storedHash = Storage.getMasterHash();
    if (Encryption.sha256(currentPassword) !== storedHash) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }

    if (newPassword !== confirmNewPassword) {
      return { success: false, error: 'New passwords do not match.' };
    }

    const strength = Encryption.checkPasswordStrength(newPassword);
    if (strength.level === 'weak') {
      return { success: false, error: 'Please choose a stronger password.' };
    }

    // Re-encrypt all notes with new password
    try {
      const notes = Storage.getAllNotes();
      const reencryptedNotes = notes.map(note => {
        if (!note.encryptedContent) return note;

        // Decrypt with old password
        const plaintext = Encryption.decrypt(note.encryptedContent, currentPassword);
        if (plaintext === null) {
          // Skip notes we can't decrypt (shouldn't happen, but be safe)
          console.warn('Could not decrypt note during password change:', note.id);
          return note;
        }

        // Re-encrypt with new password
        const newEncrypted = Encryption.encrypt(plaintext, newPassword);
        return { ...note, encryptedContent: newEncrypted };
      });

      Storage.saveAllNotes(reencryptedNotes);

      // Update stored hash and session
      Storage.setMasterHash(Encryption.sha256(newPassword));
      sessionPassword = newPassword;

      return { success: true };
    } catch (err) {
      console.error('Password change failed:', err);
      return { success: false, error: 'An error occurred while updating the password.' };
    }
  }

  /**
   * Resets the vault - deletes everything.
   * Should only be called after user confirms.
   */
  function resetVault() {
    _clearLockTimer();
    _removeActivityListeners();
    sessionPassword = null;
    isLocked = true;
    Storage.clearAll();
  }

  // ====== Auto-lock ======

  /**
   * Call this whenever the user does something (resets the inactivity timer).
   */
  function resetActivityTimer() {
    if (isLocked) return;
    _startLockTimer();
  }

  function _startSession(password) {
    sessionPassword = password;
    isLocked = false;
    _startLockTimer();
    _setupActivityListeners();
  }

  function _startLockTimer() {
    _clearLockTimer();

    const minutes = Storage.getAutoLockMinutes();
    if (minutes === 0) return; // auto-lock disabled

    lockTimer = setTimeout(() => {
      lock();
    }, minutes * 60 * 1000);
  }

  function _clearLockTimer() {
    if (lockTimer) {
      clearTimeout(lockTimer);
      lockTimer = null;
    }
  }

  // Track user activity to reset the lock timer
  function _onUserActivity() {
    if (!isLocked) {
      _startLockTimer();
    }
  }

  function _setupActivityListeners() {
    // Use throttling to avoid resetting the timer on every single mousemove
    document.addEventListener('mousemove', _throttledActivity);
    document.addEventListener('keydown', _onUserActivity);
    document.addEventListener('click', _onUserActivity);
  }

  function _removeActivityListeners() {
    document.removeEventListener('mousemove', _throttledActivity);
    document.removeEventListener('keydown', _onUserActivity);
    document.removeEventListener('click', _onUserActivity);
  }

  // Simple throttle - only reset the timer once every 30 seconds on mousemove
  let activityThrottle = null;
  function _throttledActivity() {
    if (activityThrottle) return;
    _onUserActivity();
    activityThrottle = setTimeout(() => { activityThrottle = null; }, 30000);
  }

  return {
    hasVault,
    setupVault,
    unlock,
    lock,
    getSessionPassword,
    getIsLocked,
    changePassword,
    resetVault,
    setOnLockCallback,
    resetActivityTimer
  };

})();
