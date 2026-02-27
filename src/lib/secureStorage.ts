import CryptoJS from 'crypto-js';
import { getActiveProfileKey } from './auth';

const ENCRYPTION_KEY_PREFIX = 'mythic-pets-secure-v1';

// Get encryption key based on user
function getUserKey(): string {
  const username = getActiveProfileKey();
  if (!username || username === 'guest') {
    return ENCRYPTION_KEY_PREFIX;
  }
  return CryptoJS.SHA256(ENCRYPTION_KEY_PREFIX + username).toString();
}

// Check if data is encrypted
function isEncryptedData(str: string): boolean {
  try {
    const key = getUserKey();
    const decrypted = CryptoJS.AES.decrypt(str, key);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    return result.length > 0;
  } catch {
    return false;
  }
}

// Encrypt data
function encryptData(data: unknown): string {
  const key = getUserKey();
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key);
  return encrypted.toString();
}

// Decrypt data
function decryptData<T>(encrypted: string): T | null {
  try {
    const key = getUserKey();
    const decrypted = CryptoJS.AES.decrypt(encrypted, key);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) return null;
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}

// Keys that should NOT be encrypted
const PLAIN_KEYS = ['mythicpets-auth-users', 'mythicpets-auth-session'];

function shouldEncrypt(key: string): boolean {
  return !PLAIN_KEYS.some((plain) => key.includes(plain));
}

// Patch localStorage to auto-encrypt/decrypt game data
export function patchLocalStorage(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__localStoragePatched) return;

  const originalGetItem = localStorage.getItem.bind(localStorage);
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  // Override getItem
  localStorage.getItem = function (key: string): string | null {
    const value = originalGetItem(key);
    if (!value) return null;

    // Don't touch auth keys
    if (!shouldEncrypt(key)) return value;

    // Try to decrypt
    const decrypted = decryptData(value);
    if (decrypted !== null) {
      return JSON.stringify(decrypted);
    }

    // Return original if not encrypted
    return value;
  };

  // Override setItem
  localStorage.setItem = function (key: string, value: string): void {
    // Don't touch auth keys
    if (!shouldEncrypt(key)) {
      originalSetItem(key, value);
      return;
    }

    // Try to parse and encrypt
    try {
      const parsed = JSON.parse(value);
      const encrypted = encryptData(parsed);
      originalSetItem(key, encrypted);
    } catch {
      // If not valid JSON, store as-is
      originalSetItem(key, value);
    }
  };

  // Override removeItem
  localStorage.removeItem = function (key: string): void {
    originalRemoveItem(key);
  };

  (window as any).__localStoragePatched = true;
  console.log('localStorage patched for encryption');
}

// Migrate existing plain data to encrypted
export function migrateToEncrypted(): void {
  if (typeof window === 'undefined') return;

  const username = getActiveProfileKey();
  if (!username || username === 'guest') return;

  const keysToMigrate = [
    `myPets:${username}`,
    `mythicpets-economy:${username}`,
    `mythicpets-gather-task:${username}`,
    `mythicpets-magic-potions:${username}`,
    `mythicpets-health-potions:${username}`,
    `mythicpets-battle-cooldown:${username}`,
  ];

  keysToMigrate.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value && !isEncryptedData(value)) {
      try {
        const parsed = JSON.parse(value);
        const encrypted = encryptData(parsed);
        localStorage.setItem(key, encrypted);
        console.log(`Migrated ${key} to encrypted`);
      } catch (e) {
        console.error(`Failed to migrate ${key}:`, e);
      }
    }
  });
}
