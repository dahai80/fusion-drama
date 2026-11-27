/**
 * preload — renderer-process security bridge
 * Exposes window.fusionDesktop: directory picker, migration trigger, migration progress subscription.
 * contextIsolation is on by default; only whitelisted methods are exposed via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('fusionDesktop', {
  /** Opens the native directory picker; returns { ok, path?, freeBytes?, error?, canceled? } */
  pickDirectory: () => ipcRenderer.invoke('fusion:pick-directory'),
  /** Triggers storage migration; returns { ok } or rejects (error details in progress events/exceptions) */
  startMigration: (opts: { targetDir: string, migrateFiles: boolean }) =>
    ipcRenderer.invoke('fusion:start-migration', opts),
  /** Subscribes to migration progress; returns an unsubscribe function */
  onMigrateProgress: (cb: (progress: { phase: string, copiedBytes?: number, totalBytes?: number, message?: string }) => void) => {
    const listener = (_event: unknown, progress: Parameters<typeof cb>[0]) => cb(progress)
    ipcRenderer.on('fusion:migrate-progress', listener)
    return () => ipcRenderer.removeListener('fusion:migrate-progress', listener)
  },
  // ---- In-app update ----
  getUpdateState: () => ipcRenderer.invoke('fusion:update-state'),
  checkUpdate: () => ipcRenderer.invoke('fusion:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('fusion:update-download'),
  applyUpdate: () => ipcRenderer.invoke('fusion:update-apply'),
  /** Subscribes to update download progress (0-100); returns an unsubscribe function */
  onUpdateProgress: (cb: (percent: number) => void) => {
    const listener = (_event: unknown, percent: number) => cb(percent)
    ipcRenderer.on('fusion:update-progress', listener)
    return () => ipcRenderer.removeListener('fusion:update-progress', listener)
  },
})
