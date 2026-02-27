import { getActiveProfileKey } from './auth';
import { uploadBackupToCloud } from './backup';

const AUTO_BACKUP_INTERVAL_MS = 60_000;

let backupIntervalId: ReturnType<typeof setInterval> | null = null;
let isBackingUp = false;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

async function runAutoBackup(): Promise<void> {
  if (isBackingUp) {
    return;
  }

  const username = getActiveProfileKey();
  if (!username || username === 'guest') {
    return;
  }

  isBackingUp = true;
  try {
    const result = await uploadBackupToCloud();
    if (!result.ok) {
      console.warn('Auto cloud backup failed:', result.error);
    }
  } catch (error) {
    console.warn('Auto cloud backup error:', error);
  } finally {
    isBackingUp = false;
  }
}

function onVisibilityChange(): void {
  if (!hasWindow()) {
    return;
  }
  if (document.visibilityState === 'hidden') {
    void runAutoBackup();
  }
}

function onPageHide(): void {
  void runAutoBackup();
}

function onBeforeUnload(): void {
  void runAutoBackup();
}

export function startAutoCloudBackup(): void {
  if (!hasWindow() || backupIntervalId) {
    return;
  }

  void runAutoBackup();
  backupIntervalId = setInterval(() => {
    void runAutoBackup();
  }, AUTO_BACKUP_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
}

export function stopAutoCloudBackup(): void {
  if (!hasWindow()) {
    return;
  }

  if (backupIntervalId) {
    clearInterval(backupIntervalId);
    backupIntervalId = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('beforeunload', onBeforeUnload);
}

export function triggerAutoCloudBackup(): void {
  void runAutoBackup();
}
