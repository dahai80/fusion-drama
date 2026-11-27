/**
 * Desktop bridge (window.fusionDesktop injected by preload) type declarations and safe accessors.
 * Returns null in non-desktop environments (browser/server deployments); the UI hides
 * desktop-only features accordingly.
 */

export interface UpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  downloadProgress?: number
  downloadedFile?: string
}

export interface FusionDesktopBridge {
  pickDirectory: () => Promise<{ ok: boolean, path?: string, freeBytes?: number | null, error?: string, canceled?: boolean }>
  startMigration: (opts: { targetDir: string, migrateFiles: boolean }) => Promise<{ ok: boolean }>
  onMigrateProgress: (cb: (progress: { phase: string, message?: string, copiedBytes?: number, totalBytes?: number }) => void) => () => void
  getUpdateState: () => Promise<UpdateState>
  checkUpdate: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  applyUpdate: () => Promise<void>
  onUpdateProgress: (cb: (percent: number) => void) => () => void
}

export function useDesktopBridge(): FusionDesktopBridge | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { fusionDesktop?: FusionDesktopBridge }).fusionDesktop ?? null
}
