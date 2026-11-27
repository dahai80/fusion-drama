/**
 * In-app onboarding tour (driver.js) — lightweight approach
 *
 * - Each page defines steps (selector + i18n copy keys), started via startTour()
 * - The "seen" flag is persisted server-side in app_settings (tours_seen): the desktop build
 *   gets a random port on every launch, so localStorage dies with the origin — hence the DB;
 *   localStorage is only an offline fallback cache
 * - Auto-opens on first visit, help button replays anytime; skip/finish both count as seen
 * - Theme styles reuse the design tokens (flame-orange accent), see the .driver-theme override in app.vue
 */
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const SEEN_KEY = 'fusion:tours'

let seenSet = new Set<string>()
let hydrated = false
let hydratePromise: Promise<void> | null = null

function readLocal(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}

function writeLocal(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

/**
 * Fetches seen tour ids from the server and unions them with the local cache (preserving
 * pre-upgrade marks in localStorage). Called by the client plugin at app startup; autoTour
 * fires a few hundred ms after onMounted, by which time hydration is done.
 */
export function hydrateTours(): Promise<void> {
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/v1/settings/tours-seen')
      const json = await res.json().catch(() => null)
      const server: string[] = Array.isArray(json?.data?.seen) ? json.data.seen : []
      seenSet = new Set([...server, ...readLocal()])
    } catch {
      seenSet = new Set(readLocal())
    }
    hydrated = true
    writeLocal([...seenSet])
  })()
  return hydratePromise
}

export function tourSeen(id: string): boolean {
  return seenSet.has(id) || readLocal().includes(id)
}

export function markTourSeen(id: string) {
  if (seenSet.has(id)) return
  seenSet.add(id)
  writeLocal([...seenSet])
  // Persist (fire-and-forget); when not yet hydrated, merge server data first to avoid overwriting tours marked by other pages
  void (async () => {
    try {
      if (!hydrated) await hydrateTours()
      seenSet.add(id)
      await fetch('/api/v1/settings/tours-seen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: [...seenSet] }),
      })
    } catch { /* localStorage already covers the unreachable-server case */ }
  })()
}

export interface TourStep {
  element: string            // CSS selector; '#__nuxt' and similar fallbacks mean a centered popover (no highlight)
  titleKey: string           // i18n key
  descKey: string            // i18n key
  popoverSide?: 'top' | 'bottom' | 'left' | 'right'
  popoverAlign?: 'start' | 'center' | 'end'
}

/**
 * Starts one tour. t is the useI18n translate function.
 * Returns whether the tour actually started (silently skipped when elements are missing or steps are empty).
 */
export function startTour(id: string, steps: TourStep[], t: (key: string) => string): boolean {
  const usable = steps.filter(s => s.element === '#__nuxt' || document.querySelector(s.element))
  if (!usable.length) return false

  const drv = driver({
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'nextStep',
    popoverClass: 'fusion-tour-popover',
    progressText: '{{current}} / {{total}}',
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.prev'),
    doneBtnText: t('tour.done'),
    onDestroyed: () => markTourSeen(id),
    steps: usable.map(s => ({
      element: s.element,
      popover: {
        title: t(s.titleKey),
        description: t(s.descKey),
        side: s.popoverSide || 'bottom',
        align: s.popoverAlign || 'start',
      },
    })),
  })
  drv.drive()
  return true
}

/** First-visit auto tour: skipped when already seen or elements are not ready */
export function autoTour(id: string, steps: TourStep[], t: (key: string) => string) {
  if (tourSeen(id)) return
  startTour(id, steps, t)
}
