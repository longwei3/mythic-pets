import CryptoJS from 'crypto-js';
import { getActiveProfileKey } from './auth';

const EXPORT_KEY = 'mythic-pets-backup-v1';
const BACKUP_VERSION = 'mythic-pets-backup-v2';
const CLOUD_BACKUP_LINK_KEY = 'mythicpets-cloud-backup-link';
const JSONBLOB_BASE_URL = 'https://jsonblob.com';

interface ExportPayloadV2 {
  username: string;
  exportedAt: number;
  version: typeof BACKUP_VERSION;
  storage: Record<string, string>;
}

interface BackupResult {
  ok: boolean;
  error?: string;
}

interface CloudBackupResult extends BackupResult {
  url?: string;
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function shouldIncludeStorageKey(key: string, username: string): boolean {
  if (!key || !key.endsWith(`:${username}`)) {
    return false;
  }

  if (key.startsWith('mythicpets-auth-') || key.startsWith('mythicpets-last-sync:')) {
    return false;
  }

  return (
    key.startsWith('myPets:') ||
    key.startsWith('myListedPets:') ||
    key.startsWith('generation1Count:') ||
    key.startsWith('adventure3d-save:') ||
    key.startsWith('mythicpets-')
  );
}

function collectUserStorage(username: string): Record<string, string> {
  const storage: Record<string, string> = {};
  if (!hasWindow()) {
    return storage;
  }

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !shouldIncludeStorageKey(key, username)) {
      continue;
    }

    const value = localStorage.getItem(key);
    if (value !== null) {
      storage[key] = value;
    }
  }

  return storage;
}

function restoreUserStorage(storage: Record<string, string>): void {
  if (!hasWindow()) {
    return;
  }

  for (const [key, value] of Object.entries(storage)) {
    localStorage.setItem(key, value);
  }
}

function getCloudLinkStorageKey(username: string): string {
  return `${CLOUD_BACKUP_LINK_KEY}:${username}`;
}

function normalizeCloudBackupUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (/^https:\/\/jsonblob\.com\/api\/jsonBlob\/[A-Za-z0-9-]+$/.test(value)) {
    return value;
  }

  if (/^\/api\/jsonBlob\/[A-Za-z0-9-]+$/.test(value)) {
    return `${JSONBLOB_BASE_URL}${value}`;
  }

  if (/^[A-Za-z0-9-]{8,}$/.test(value)) {
    return `${JSONBLOB_BASE_URL}/api/jsonBlob/${value}`;
  }

  return null;
}

function parseCloudPayloadText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as { encryptedBackup?: unknown };
    if (parsed && typeof parsed.encryptedBackup === 'string') {
      return parsed.encryptedBackup;
    }
  } catch {
    // fall through
  }

  return trimmed;
}

function parseLegacyPayload(data: Record<string, unknown>, username: string): Record<string, string> {
  const storage: Record<string, string> = {};

  const legacyKeyMap = [
    'myPets',
    'mythicpets-economy',
    'mythicpets-gather-task',
    'mythicpets-magic-potions',
    'mythicpets-health-potions',
    'mythicpets-battle-cooldown',
  ];

  legacyKeyMap.forEach((key) => {
    if (data[key] !== undefined) {
      storage[`${key}:${username}`] = JSON.stringify(data[key]);
    }
  });

  return storage;
}

export function getSavedCloudBackupUrl(profileKey?: string): string | null {
  if (!hasWindow()) {
    return null;
  }

  const username = (profileKey || getActiveProfileKey()).trim().toLowerCase();
  if (!username || username === 'guest') {
    return null;
  }

  const raw = localStorage.getItem(getCloudLinkStorageKey(username));
  if (!raw) {
    return null;
  }

  return normalizeCloudBackupUrl(raw);
}

export function clearSavedCloudBackupUrl(profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }

  const username = (profileKey || getActiveProfileKey()).trim().toLowerCase();
  if (!username || username === 'guest') {
    return;
  }

  localStorage.removeItem(getCloudLinkStorageKey(username));
}

function saveCloudBackupUrl(url: string, username: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(getCloudLinkStorageKey(username), url);
}

// Get all game data for export
export function exportPlayerData(): string | null {
  if (!hasWindow()) {
    return null;
  }

  const username = getActiveProfileKey();
  if (!username || username === 'guest') {
    return null;
  }

  const payload: ExportPayloadV2 = {
    username,
    exportedAt: Date.now(),
    version: BACKUP_VERSION,
    storage: collectUserStorage(username),
  };

  const jsonStr = JSON.stringify(payload);
  return CryptoJS.AES.encrypt(jsonStr, EXPORT_KEY).toString();
}

// Import player data from backup
export function importPlayerData(encryptedData: string): BackupResult {
  if (!hasWindow()) {
    return { ok: false, error: 'Not in browser' };
  }

  const username = getActiveProfileKey();
  if (!username || username === 'guest') {
    return { ok: false, error: 'Not logged in' };
  }

  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, EXPORT_KEY);
    const plainText = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plainText) {
      return { ok: false, error: 'Invalid backup data' };
    }

    const data = JSON.parse(plainText) as Record<string, unknown>;

    if (data.username !== username) {
      return { ok: false, error: 'Backup is for different account' };
    }

    let storageToRestore: Record<string, string> = {};
    const version = data.version;

    if (version === BACKUP_VERSION && data.storage && typeof data.storage === 'object') {
      for (const [key, value] of Object.entries(data.storage as Record<string, unknown>)) {
        if (typeof value === 'string') {
          storageToRestore[key] = value;
        }
      }
    } else {
      storageToRestore = parseLegacyPayload(data, username);
    }

    if (Object.keys(storageToRestore).length === 0) {
      return { ok: false, error: 'No player data found in backup' };
    }

    restoreUserStorage(storageToRestore);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function uploadBackupToCloud(): Promise<CloudBackupResult> {
  if (!hasWindow()) {
    return { ok: false, error: 'Not in browser' };
  }

  const username = getActiveProfileKey();
  if (!username || username === 'guest') {
    return { ok: false, error: 'Not logged in' };
  }

  const encryptedBackup = exportPlayerData();
  if (!encryptedBackup) {
    return { ok: false, error: 'No data to backup' };
  }

  const existingUrl = getSavedCloudBackupUrl(username);
  const payload = JSON.stringify({
    username,
    updatedAt: Date.now(),
    encryptedBackup,
  });

  try {
    if (existingUrl) {
      const putRes = await fetch(existingUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
        body: payload,
      });

      if (!putRes.ok) {
        return { ok: false, error: `Cloud update failed (${putRes.status})` };
      }

      saveCloudBackupUrl(existingUrl, username);
      return { ok: true, url: existingUrl };
    }

    const postRes = await fetch(`${JSONBLOB_BASE_URL}/api/jsonBlob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
      body: payload,
    });

    if (!postRes.ok) {
      return { ok: false, error: `Cloud upload failed (${postRes.status})` };
    }

    const location = postRes.headers.get('Location') || postRes.headers.get('location') || '';
    const url = normalizeCloudBackupUrl(location);
    if (!url) {
      return { ok: false, error: 'Cloud upload succeeded but link was missing' };
    }

    saveCloudBackupUrl(url, username);
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function restoreBackupFromCloud(urlInput?: string): Promise<CloudBackupResult> {
  if (!hasWindow()) {
    return { ok: false, error: 'Not in browser' };
  }

  const username = getActiveProfileKey();
  if (!username || username === 'guest') {
    return { ok: false, error: 'Not logged in' };
  }

  const targetUrl = normalizeCloudBackupUrl(urlInput || '') || getSavedCloudBackupUrl(username);
  if (!targetUrl) {
    return { ok: false, error: 'No cloud backup link found' };
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      return { ok: false, error: `Cloud read failed (${response.status})` };
    }

    const text = await response.text();
    const encryptedBackup = parseCloudPayloadText(text);
    if (!encryptedBackup) {
      return { ok: false, error: 'Cloud backup is empty' };
    }

    const result = importPlayerData(encryptedBackup);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    saveCloudBackupUrl(targetUrl, username);
    return { ok: true, url: targetUrl };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Download backup as file
export function downloadBackup(): void {
  const data = exportPlayerData();
  if (!data) {
    alert('No data to export');
    return;
  }

  const blob = new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mythic-pets-backup-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Upload backup from file
export function uploadBackup(file: File): Promise<BackupResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        resolve({ ok: false, error: 'Empty file' });
        return;
      }
      const result = importPlayerData(content);
      resolve(result);
    };
    reader.onerror = () => resolve({ ok: false, error: 'Failed to read file' });
    reader.readAsText(file);
  });
}
