# Graphite Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing orange film-console styling with the selected graphite-and-blue workbench design without changing routes, data, or production behavior.

**Architecture:** Keep the current Nuxt page structure and business logic. Make `studio.css` the source of truth for color, type, controls, elevation, and focus states, then remove the small set of page-local orange gradients and decorative film treatments that bypass those tokens.

**Tech Stack:** Nuxt 3, Vue 3, scoped CSS, Node built-in test runner, existing `lucide-vue-next` dependency.

---

## Visual Contract

- **Visual thesis:** A flat graphite editing surface with cool gray hierarchy, one restrained blue accent, and almost no elevation.
- **Content plan:** Preserve the existing project launcher, project episode list, six-step production workbench, and settings forms; only clarify their hierarchy through dividers, density, and selection states.
- **Interaction thesis:** Use a short fade-in for page entry, quiet surface changes for hover, and a blue focus/selection outline; remove ornamental lift, glow, and spring motion.

### Task 1: Lock the graphite theme contract

**Files:**
- Create: `frontend/tests/graphite-theme-structure.test.mjs`
- Test: `frontend/tests/graphite-theme-structure.test.mjs`

- [ ] **Step 1: Write the failing structural test**

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const studioCss = read('../app/assets/studio.css')
const layout = read('../app/layouts/default.vue')
const surfaces = [
  studioCss,
  layout,
  read('../app/pages/index.vue'),
  read('../app/pages/drama/[id]/index.vue'),
  read('../app/pages/drama/[id]/episode/[episodeNumber].vue'),
  read('../app/pages/settings.vue'),
].join('\n')

test('graphite theme exposes the selected neutral and blue tokens', () => {
  assert.match(studioCss, /--surface-base:\s*#15171a/i)
  assert.match(studioCss, /--surface-raised:\s*#1c1f23/i)
  assert.match(studioCss, /--accent:\s*#4c8dff/i)
  assert.match(studioCss, /--success:\s*#63a87a/i)
  assert.match(studioCss, /--font-body:\s*'Inter',\s*'Noto Sans SC'/)
})

test('core surfaces remove the old film-console decoration', () => {
  assert.doesNotMatch(surfaces, /#d96f27|rgba\(217\s*,\s*111\s*,\s*39/i)
  assert.doesNotMatch(surfaces, /linear-gradient|radial-gradient|repeating-linear-gradient/i)
  assert.doesNotMatch(surfaces, /Noto Serif SC|film-strip|film-frame/i)
})
```

- [ ] **Step 2: Run the test and confirm it fails against the old orange theme**

Run: `cd frontend && node --test tests/graphite-theme-structure.test.mjs`

Expected: FAIL on the missing `#15171a`, `#4c8dff`, and the presence of orange/gradient styling.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add frontend/tests/graphite-theme-structure.test.mjs
git commit -m "test(ui): define graphite theme contract"
```

### Task 2: Replace the shared theme and simplify the header

**Files:**
- Modify: `frontend/app/assets/studio.css`
- Modify: `frontend/app/layouts/default.vue`
- Test: `frontend/tests/graphite-theme-structure.test.mjs`
- Test: `frontend/tests/button-system-structure.test.mjs`
- Test: `frontend/tests/professional-redesign-surface.test.mjs`

- [ ] **Step 1: Replace shared theme tokens and control surfaces**

Use these exact core values in `:root` and keep the existing variable names so all pages inherit the redesign:

```css
:root {
  --surface-base: #15171a;
  --surface-raised: #1c1f23;
  --surface-muted: #20242a;
  --surface-soft: #191c20;
  --surface-input: #171a1e;
  --surface-outline: #30343a;
  --surface-outline-strong: #40464f;
  --accent: #4c8dff;
  --accent-dark: #3678e8;
  --accent-bg: rgba(76, 141, 255, 0.12);
  --accent-text: #78a9ff;
  --accent-glow: rgba(76, 141, 255, 0.24);
  --action-primary: #4c8dff;
  --action-primary-hover: #6aa1ff;
  --action-primary-press: #3678e8;
  --success: #63a87a;
  --warning: #d6a45e;
  --error: #c96b6b;
  --font-display: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  --font-body: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
}
```

Make buttons, inputs, cards, overlays, and body backgrounds flat. Keep one 2px focus ring, 6px radii, and a light modal-only shadow. Replace the embedded select SVG with native select rendering.

- [ ] **Step 2: Simplify the global header**

Remove the `film-strip` markup and its CSS. Replace the two inline navigation SVGs with the already-installed `LayoutGrid` and `Settings` components from `lucide-vue-next`. Keep the logo, route logic, navigation labels, and 56px height unchanged.

```js
import { LayoutGrid, Settings } from 'lucide-vue-next'
```

```vue
<LayoutGrid :size="15" :stroke-width="1.8" />
<Settings :size="15" :stroke-width="1.8" />
```

- [ ] **Step 3: Update existing token assertions**

Change old orange token expectations in the three existing structural tests to the exact graphite values above. Do not weaken unrelated behavior assertions.

- [ ] **Step 4: Run the focused tests**

Run: `cd frontend && node --test tests/graphite-theme-structure.test.mjs tests/button-system-structure.test.mjs tests/professional-redesign-surface.test.mjs`

Expected: Theme assertions pass; the no-gradient assertion may still fail until Task 3 removes page-local styles.

- [ ] **Step 5: Commit shared theme changes**

```bash
git add frontend/app/assets/studio.css frontend/app/layouts/default.vue frontend/tests/button-system-structure.test.mjs frontend/tests/professional-redesign-surface.test.mjs
git commit -m "feat(ui): apply graphite theme system"
```

### Task 3: Remove page-local orange and decorative treatments

**Files:**
- Modify: `frontend/app/pages/index.vue`
- Modify: `frontend/app/pages/drama/[id]/index.vue`
- Modify: `frontend/app/pages/drama/[id]/episode/[episodeNumber].vue`
- Modify: `frontend/app/pages/settings.vue`
- Test: `frontend/tests/graphite-theme-structure.test.mjs`
- Test: `frontend/tests/episode-workbench-structure.test.mjs`
- Test: `frontend/tests/project-launcher-structure.test.mjs`

- [ ] **Step 1: Flatten the project launcher**

Remove the decorative `film-thumb` pseudo-elements and rename the thumbnail class to `project-thumb`. Use a neutral `#24282d` surface with a blue left rule, 1px dividers, no lift transform, and `var(--accent)` for progress.

```css
.project-row::before { background: var(--accent); }
.project-row:hover,
.project-row:focus-visible {
  border-color: var(--border-strong);
  background: var(--bg-hover);
  box-shadow: none;
  transform: none;
}
.project-thumb {
  width: 78px;
  height: 56px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-hover);
}
.progress-fill { background: var(--accent); }
```

- [ ] **Step 2: Flatten project detail and dialogs**

Replace dialog and configuration-card gradients with `var(--surface-raised)` and `var(--surface-muted)`. Remove hover lift/shadow from episode rows while retaining the existing navigation behavior and status text.

- [ ] **Step 3: Match the selected workbench reference**

Keep the existing six-stage markup and actions. Change the workbench background to `var(--surface-base)`, keep the desktop rail, use a blue inset active rule, green completed status, flat toolbars, flat task/asset rows, and a solid blue progress fill. Wrap the current video task list and a new read-only inspector in `video-task-workbench`; reuse the existing `selectedSb`, `getShotReferenceAssets()`, `lockedVideoConfigLabel`, and generation functions instead of adding state or API calls. Clicking a task row selects it, while the task button keeps `@click.stop` so it does not change selection accidentally.

```css
.pipe-item.active { box-shadow: inset 2px 0 0 var(--accent); }
.pipe-item.done .pipe-icon,
.icon-done { color: var(--success); border-color: rgba(99, 168, 122, 0.34); }
.progress-fill { background: var(--accent); }
.video-task-workbench {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  border: 1px solid var(--surface-outline);
}
.video-task-inspector {
  border-left: 1px solid var(--surface-outline);
  background: var(--surface-raised);
  overflow-y: auto;
}
```

- [ ] **Step 4: Flatten settings navigation and forms**

Use `var(--bg-hover)` for hover, `var(--accent-bg)` for the active item, flat provider rows, and the shared modal shadow only for dialogs. Preserve provider selection, test, save, toggle, and delete behavior.

- [ ] **Step 5: Update behavior-preserving structural assertions**

Change project launcher and episode theme assertions from orange values to `#4c8dff` and `#63a87a`. Keep all action-placement, generation, and routing assertions unchanged.

- [ ] **Step 6: Run the entire frontend test suite**

Run: `cd frontend && node --test tests/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit the page redesign**

```bash
git add frontend/app/pages/index.vue frontend/app/pages/drama/[id]/index.vue frontend/app/pages/drama/[id]/episode/[episodeNumber].vue frontend/app/pages/settings.vue frontend/tests/graphite-theme-structure.test.mjs frontend/tests/episode-workbench-structure.test.mjs frontend/tests/project-launcher-structure.test.mjs
git commit -m "feat(ui): redesign workbench in graphite"
```

### Task 4: Build and visually verify

**Files:**
- Create: `design-qa.md`

- [ ] **Step 1: Build the production frontend**

Run: `cd frontend && npm run build`

Expected: Nuxt build exits with code 0.

- [ ] **Step 2: Capture the rendered workbench**

Run: `cd frontend && npm run dev -- --host 127.0.0.1`

Open the real video-generation workbench at 1440×1024 in the in-app browser, select a populated episode's “视频生成” step, and capture the selected-row/inspector state shown in the reference.

- [ ] **Step 3: Compare reference and implementation together**

Use the selected reference image and browser capture in one comparison. Check typography, 220px rail, main-list density, 320px inspector, graphite token accuracy, real media thumbnails, copy, focus states, and overflow.

- [ ] **Step 4: Record and resolve QA findings**

Save `design-qa.md` with the source image path, implementation screenshot path, viewport, tested interactions, console result, comparison history, and `final result: passed`. Fix all P0/P1/P2 findings before marking it passed.

- [ ] **Step 5: Run final verification**

Run: `cd frontend && node --test tests/*.test.mjs && npm run build`

Expected: all structural tests pass and the production build exits with code 0.

- [ ] **Step 6: Commit QA evidence**

```bash
git add design-qa.md
git commit -m "docs(ui): record graphite design QA"
```
