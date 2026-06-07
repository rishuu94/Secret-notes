/**
// Encryption and hashing functions
// Uses CryptoJS
*/

const Encryption = (() => {

  // PBKDF2 settings - higher iterations = slower brute force attacks
  // 10000 is a reasonable middle ground for a browser context
  const PBKDF2_ITERATIONS = 10000;
  const KEY_SIZE = 256 / 32; // 256-bit key

  // We use a fixed salt for PBKDF2 key derivation.
  // Ideally this would be random and stored per-user, but since we're
  // deriving it from a password that's also our auth, this works for our use case.
  // The real protection comes from the password strength.
  const FIXED_SALT = 'SecureNotesApp_v1_salt_2024';

  /**
   * Derives a CryptoJS WordArray key from a password using PBKDF2.
   * This is what makes dictionary attacks slow.
   * @param {string} password
   * @returns {CryptoJS.lib.WordArray}
   */
  function deriveKey(password) {
    return CryptoJS.PBKDF2(password, FIXED_SALT, {
      keySize: KEY_SIZE,
      iterations: PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256
    });
  }

  /**
   * Encrypts a plaintext string with AES using the derived key.
   * CryptoJS uses CBC mode by default with a random IV each time,
   * which means the same text encrypts to different ciphertext each call. Good.
   *
   * @param {string} plaintext - The content to encrypt
   * @param {string} password - The master password
   * @returns {string} - Base64-encoded ciphertext (includes IV)
   */
  function encrypt(plaintext, password) {
    try {
      const key = deriveKey(password);
      const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return encrypted.toString(); // This includes the IV in the output
    } catch (err) {
      console.error('Encryption failed:', err);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts an AES-encrypted ciphertext back to plaintext.
   * Returns null if decryption fails (wrong password, corrupted data).
   *
   * @param {string} ciphertext - Base64-encoded encrypted string
   * @param {string} password - The master password
   * @returns {string|null} - Decrypted plaintext, or null on failure
   */
  function decrypt(ciphertext, password) {
    try {
      const key = deriveKey(password);
      const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      const result = decrypted.toString(CryptoJS.enc.Utf8);
      // If result is empty, decryption probably failed (wrong key)
      if (!result) return null;
      return result;
    } catch (err) {
      // CryptoJS sometimes throws on malformed ciphertext, catch it
      return null;
    }
  }

  /**
   * Hashes a string with SHA-256 and returns the hex digest.
   * Used for: storing master password, verifying note integrity.
   *
   * @param {string} input
   * @returns {string} - 64-character hex string
   */
  function sha256(input) {
    return CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex);
  }

  /**
   * Checks password strength.
   * Simple heuristic - not perfect but good enough for feedback.
   *
   * @param {string} password
   * @returns {{ level: 'weak'|'medium'|'strong', score: number, label: string }}
   */
  function checkPasswordStrength(password) {
    if (!password) return { level: '', score: 0, label: '—' };

    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++; // special chars
    if (password.length >= 20) score++; // bonus for long passwords

    // Map score to levels
    if (score <= 3) return { level: 'weak', score, label: 'Weak' };
    if (score <= 5) return { level: 'medium', score, label: 'Medium' };
    return { level: 'strong', score, label: 'Strong' };
  }

  // Public API
  return {
    encrypt,
    decrypt,
    sha256,
    checkPasswordStrength
  };

})();
