# Frontend Overhaul Design

Date: 2026-03-25

## Overview

Comprehensive frontend restructuring of Huobao Drama covering three dimensions: UI/design system replacement, architecture reorganization, and feature redesign. The core change is replacing Element Plus with Shadcn Vue, restructuring routes and directories by domain, and replacing the linear 3-step EpisodeWorkflow + ProfessionalEditor with a unified progressive panel-based workbench.

## 1. UI System: Element Plus → Shadcn Vue

### What Gets Removed

- `element-plus` package and all `el-*` components
- `@element-plus/icons-vue` → replaced by `lucide-vue-next`
- `web/src/assets/styles/element/index.scss` (Element Plus overrides)
- All Element Plus CSS imports in `main.ts`

### What Gets Added

- `shadcn-vue` CLI-generated components in `web/src/components/ui/`
- `radix-vue` (Shadcn Vue's underlying headless library)
- `lucide-vue-next` for icons (tree-shakable)
- `class-variance-authority` + `clsx` + `tailwind-merge` (Shadcn Vue dependencies)

### Component Migration Map

| Element Plus | Shadcn Vue | Notes |
|---|---|---|
| el-button | Button | Glass variants via CVA |
| el-input | Input | |
| el-select | Select | Radix-based, fully accessible |
| el-dialog | Dialog | |
| el-drawer | Sheet | Used for Agent panel |
| el-tabs | Tabs | |
| el-form / el-form-item | Form (vee-validate based) | With FormField, FormItem |
| el-table | Table | |
| el-tag | Badge | |
| el-alert | Alert | |
| el-empty | Custom EmptyState | Keep existing component |
| el-loading | Skeleton | |
| el-image | Native img + custom | |
| el-upload | Custom upload | |
| el-tooltip | Tooltip | |
| el-popover | Popover | |
| el-dropdown | DropdownMenu | |
| el-switch | Switch | |
| el-checkbox | Checkbox | |
| el-radio | RadioGroup | |
| el-progress | Progress | |
| el-icon | Lucide icons directly | `<Film />` instead of `<el-icon><Film /></el-icon>` |

### Theme Integration Strategy

Shadcn Vue uses CSS variables (`--primary`, `--secondary`, `--accent`, etc.) defined in `:root` and `.dark`. Map Glass Design System tokens to Shadcn variables:

```css
:root {
  --primary: var(--accent);           /* Glass accent color */
  --primary-foreground: var(--glass-text-on-accent);
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --card: var(--bg-card);
  --card-foreground: var(--text-primary);
  --border: var(--border-primary);
  --ring: var(--border-focus);
  --muted: var(--bg-secondary);
  --muted-foreground: var(--text-muted);
  /* ... remaining mappings */
}
```

Glass semantic classes (`.glass-surface`, `.glass-btn-*`, `.glass-list-row`, etc.) remain as project-specific composition utilities on top of Shadcn primitives. The Glass component files (`components/glass/`) are kept but refactored to use Shadcn primitives internally.

### Dark Mode

Continues using Tailwind `darkMode: 'class'` strategy. The amber warm-night theme (琥珀暖夜) is preserved through the existing `.dark` CSS variable overrides in `glass-tokens.css`. Shadcn Vue's dark mode maps to the same `.dark` class.

## 2. Route Architecture: Nested Routes

### Current State (14 flat routes)

All routes are top-level. Drama-related routes (7) and Episode-related routes (4) have no nesting. URL patterns are inconsistent (`/dramas/:id` vs `/episodes/:id`).

### New Route Structure

```
/                                    → DramaList (home)
/library                             → CharacterLibrary
/assets                              → Assets
/settings                            → AIConfig

/drama/new                           → DramaCreate
/drama/:id                           → DramaLayout (left sidebar nav)
  ├ (index)                          → Overview
  ├ episodes                         → EpisodeList
  ├ characters                       → Characters
  ├ scenes                           → Scenes
  ├ props                            → Props
  └ settings                         → DramaSettings

/drama/:id/episode/:num/workbench    → EpisodeWorkbench (fullscreen)
/drama/:id/episode/:num/compose      → CompositionWorkbench (fullscreen)

/settings                            → SettingsLayout (nested)
  ├ (index)                          → AIConfig
  ├ agent-config                     → AgentConfig
  └ agent-debug                      → AgentDebug

/:pathMatch(.*)*                     → NotFound
```

### URL Redirects

Add redirects for backward compatibility:
- `/character-library` → `/library`
- `/dramas/:id` → `/drama/:id`
- `/dramas/:id/episode/:num` → `/drama/:id/episode/:num/workbench`

### Key Changes

- Drama management uses nested child routes under `/drama/:id` with a shared `DramaLayout`
- `DramaLayout` provides left sidebar navigation + shared drama data loading
- Episode workbench replaces both `EpisodeWorkflow` and `ProfessionalEditor`
- Script editing is absorbed into the workbench (no separate `/episodes/:id/edit` route)
- Storyboard editing is absorbed into the workbench (no separate `/episodes/:id/storyboard` route)
- Image generation is absorbed into the workbench (no separate `/episodes/:id/generate` route)
- Timeline editor route removed (functionality in composition workbench)

### Routes Removed

- `/dramas/:id` → replaced by `/drama/:id` (nested)
- `/dramas/:id/characters` → absorbed into `/drama/:id/characters`
- `/dramas/:id/images/characters` → absorbed into `/drama/:id/characters`
- `/dramas/:id/settings` → absorbed into `/drama/:id/settings`
- `/dramas/:id/episode/:num` (old EpisodeWorkflow) → replaced by `/drama/:id/episode/:num/workbench`
- `/dramas/:dramaId/episode/:num/professional` → merged into workbench
- `/episodes/:id/edit` → absorbed into workbench
- `/episodes/:id/storyboard` → absorbed into workbench
- `/episodes/:id/generate` → absorbed into workbench
- `/timeline/:id` → absorbed into composition workbench

## 3. Directory Structure

### New Layout

```
web/src/
├── components/
│   ├── ui/                          ← Shadcn Vue components (CLI-generated)
│   │   ├── button/
│   │   ├── input/
│   │   ├── dialog/
│   │   ├── sheet/                   ← Used for Agent drawer
│   │   ├── tabs/
│   │   ├── ...
│   │   └── index.ts
│   ├── glass/                       ← Kept, refactored to use Shadcn internals
│   │   ├── GlassCard.vue
│   │   ├── GlassButton.vue          ← Wraps Shadcn Button with Glass variants
│   │   └── ...
│   ├── common/                      ← Shared business components
│   │   ├── AppHeader.vue
│   │   ├── ImageCropDialog.vue
│   │   ├── EmptyState.vue
│   │   ├── ErrorBoundary.vue
│   │   └── ...
│   ├── layout/
│   │   ├── AppLayout.vue
│   │   ├── AppSidebar.vue
│   │   └── SidebarItem.vue
│   ├── agent/                       ← NEW: Agent interaction components
│   │   ├── AgentDrawer.vue          ← Sheet-based slide-out panel
│   │   ├── AgentChat.vue            ← SSE streaming chat UI
│   │   ├── AgentTypeSwitcher.vue    ← Agent type selector
│   │   └── AgentResultAction.vue    ← "Apply" button for agent results
│   └── editor/
│       ├── GridImageEditor.vue
│       └── VideoTimelineEditor.vue
├── views/
│   ├── drama/
│   │   ├── DramaList.vue
│   │   ├── DramaCreate.vue
│   │   ├── DramaLayout.vue          ← NEW: left sidebar navigation layout
│   │   ├── management/
│   │   │   ├── OverviewTab.vue
│   │   │   ├── EpisodesTab.vue
│   │   │   ├── CharactersTab.vue
│   │   │   ├── ScenesTab.vue
│   │   │   ├── PropsTab.vue
│   │   │   └── SettingsTab.vue
│   │   ├── episode/
│   │   │   ├── EpisodeWorkbench.vue  ← NEW: unified progressive workbench
│   │   │   └── workbench/
│   │   │       ├── ResourcePanel.vue        ← Left 20%: script + characters + scenes
│   │   │       ├── ScriptBlock.vue          ← Script section in resource panel
│   │   │       ├── CharacterBlock.vue       ← Character list in resource panel
│   │   │       ├── SceneBlock.vue           ← Scene list in resource panel
│   │   │       ├── StoryboardGrid.vue       ← Right 80%: grid mode
│   │   │       ├── StoryboardCard.vue       ← Individual storyboard card
│   │   │       ├── StoryboardEditor.vue     ← Right 80%: edit mode (strip + preview + properties)
│   │   │       ├── StoryboardStrip.vue      ← Vertical thumbnail strip in edit mode
│   │   │       ├── PreviewPane.vue          ← Image/video preview in edit mode
│   │   │       └── PropertiesPanel.vue      ← Properties + generation actions in edit mode
│   │   └── composition/
│   │       └── CompositionWorkbench.vue
│   ├── library/
│   │   └── CharacterLibrary.vue
│   ├── assets/
│   │   └── Assets.vue
│   └── settings/
│       ├── AIConfig.vue
│       ├── AgentConfig.vue            ← Existing, kept
│       ├── AgentDebug.vue             ← Existing, kept
│       └── components/
│           └── ProviderCard.vue
├── composables/
│   ├── useEpisodeWorkbench.ts       ← NEW: workbench state orchestration
│   ├── useResourcePanel.ts          ← NEW: resource panel (script + characters + scenes)
│   ├── useStoryboardGrid.ts         ← NEW: grid/edit mode switching
│   ├── useProfessionalEditor.ts     ← Kept, refactored for workbench
│   ├── useFrameImageGeneration.ts   ← Kept
│   ├── useVideoGenerationPro.ts     ← Kept
│   ├── useAgentChat.ts              ← NEW: SSE agent communication
│   ├── usePolling.ts                ← Kept
│   ├── useBatchSelection.ts         ← Kept
│   ├── useFilteredList.ts           ← Kept
│   └── useVideoMerge.ts             ← Kept
├── stores/                           ← Kept, drama store extended for DramaLayout
│   ├── drama.ts                     ← Extended: load once in DramaLayout, share via store
│   ├── episode.ts                   ← Kept
│   ├── aiConfig.ts                  ← Kept
│   └── ui.ts                        ← Kept
├── api/                              ← Kept, add agent API
│   ├── agent.ts                     ← NEW: agent SSE endpoints
│   └── ... (existing)
├── types/                            ← Kept, add agent types
│   ├── agent.ts                     ← NEW: agent types
│   └── ... (existing)
└── utils/                            ← Kept
```

### Files Deleted

- `views/drama/EpisodeWorkflow.vue` (2499 lines) → replaced by EpisodeWorkbench
- `views/drama/ProfessionalEditor.vue` → merged into EpisodeWorkbench
- `views/drama/professional/` (entire directory) → components refactored into workbench/
  - `PreviewPane.vue` → `workbench/PreviewPane.vue`
  - `StoryboardList.vue` → `workbench/StoryboardStrip.vue`
  - `PropertiesTab.vue` → `workbench/PropertiesPanel.vue`
  - `SceneEditorPanel.vue` → absorbed into PropertiesPanel
  - `GenerationTab.vue` → absorbed into PropertiesPanel
  - `PanelSection.vue` → removed
  - `CompositionTab.vue` → moved to composition/
  - `CompositionWorkbench.vue` → moved to composition/
  - `dialogs/` (SceneSelector, CharacterSelector, PropSelector) → kept as shared components under workbench/
- `views/drama/DramaManagement.vue` (1502 lines) → replaced by DramaLayout + management/ children
- `views/drama/workflow/ScriptStep.vue` → absorbed into workbench/ScriptBlock.vue
- `views/drama/workflow/ImageStep.vue` → absorbed into workbench grid operations
- `views/drama/workflow/VideoStep.vue` → absorbed into workbench grid operations
- `views/workflow/CharacterExtraction.vue` → absorbed into workbench
- `views/workflow/CharacterImages.vue` → absorbed into workbench
- `views/workflow/DramaSettings.vue` → moved to management/
- `views/script/ScriptEdit.vue` → absorbed into workbench
- `views/storyboard/StoryboardEdit.vue` → absorbed into workbench
- `views/generation/ImageGeneration.vue` → absorbed into workbench
- `views/generation/VideoGeneration.vue` → absorbed into workbench
- `views/editor/TimelineEditor.vue` → absorbed into composition
- `views/generation/components/` (4 dialog files) → refactored into workbench
- `assets/styles/element/index.scss` → removed with Element Plus

## 4. EpisodeWorkbench: Progressive Panel-Based Workbench

### Layout

```
┌──────────────────────────────────────────────────────┐
│ TopBar: ← Back | Title | Progress | 🤖 Agent | 合成→│
├────────────┬─────────────────────────────────────────┤
│  Resource  │          Storyboard Area (~80%)         │
│  Panel     │                                          │
│  (~20%)    │  Grid Mode: 5-col card grid              │
│            │  Edit Mode: strip + preview + properties │
│ ┌────────┐ │                                          │
│ │ Script │ │                                          │
│ │(small) │ │                                          │
│ ├────────┤ │                                          │
│ │ Chars  │ │                                          │
│ │ (list) │ │                                          │
│ ├────────┤ │                                          │
│ │ Scenes │ │                                          │
│ │ (list) │ │                                          │
│ └────────┘ │                                          │
└────────────┴─────────────────────────────────────────┘
```

### Progressive Fill Stages

**Stage 1 — Script Only (entry point)**
- Left: Script block expanded (editable textarea), characters and scenes are grayed-out placeholders
- Right: Empty state with guidance text
- Actions: Upload script, Agent rewrite, "Extract Characters & Scenes" button

**Stage 2 — Characters & Scenes Extracted**
- Left: Script block collapses to summary. Character list and scene list appear with content
- Right: Empty state with "Agent Storyboard Breakdown" button
- Actions: Generate character images, generate scene images, batch operations

**Stage 3 — Storyboards Created (full workbench)**
- Left: All three resource blocks populated and compact
- Right: Storyboard grid fills the area (5 columns)
- Each card shows: thumbnail/status, title, shot type, generation state
- Card border color indicates status: gray (text only), blue (generating), amber (has image), green (has image + video)
- Actions: Batch generate images, batch generate videos, add storyboard

**Stage 3b — Single Storyboard Edit Mode**
- Triggered by clicking a storyboard card
- Right area switches from grid to: vertical thumbnail strip + center preview + right properties panel
- Properties panel: scene, characters, props, shot parameters, prompts, generate buttons
- "Back to grid" button to return to grid mode

### Resource Panel Blocks

Each block in the left resource panel has two states:
- **Collapsed**: Single line showing icon, name, count/status
- **Expanded**: Shows full content (script text, character list with avatars, scene list with thumbnails)

Clicking a block toggles between collapsed and expanded. When a block has no content yet, it appears grayed-out/disabled.

### Agent Drawer

- Triggered by "🤖 Agent" button in top bar
- Slides in from the right as a Shadcn Sheet (~400px wide)
- Overlays the storyboard area (does not push layout)
- Components:
  - **Top**: Agent type switcher (dropdown or segmented control)
  - **Middle**: SSE streaming chat messages
  - **Bottom**: Input field + send button
- Agent types: script_rewriter, style_analyzer, extractor, voice_assigner, storyboard_breaker, prompt_generator
- Context injection: automatically includes current storyboard, scene, characters in agent request
- Result actions: "Apply" button on agent responses maps results to workbench fields:
  - prompt_generator → fills image_prompt / video_prompt fields
  - storyboard_breaker → creates storyboard list
  - script_rewriter → updates script content
  - style_analyzer → fills style description
  - extractor → populates characters and scenes

## 5. DramaLayout: Left Sidebar Navigation

### Layout

```
┌──────────┬─────────────┬──────────────────────┐
│ App      │  Drama      │                      │
│ Sidebar  │  Secondary  │  Content Area        │
│ (global) │  Nav        │  (router-view)       │
│          │             │                      │
│ Projects │  Overview   │                      │
│ Library  │  Episodes   │                      │
│ Assets   │  Characters │                      │
│ Settings │  Scenes     │                      │
│          │  Props      │                      │
│          │  Settings   │                      │
└──────────┴─────────────┴──────────────────────┘
```

### DramaLayout Component

- Wraps all `/drama/:id/*` child routes
- Loads drama data on mount, provides via `provide/inject` or Pinia store
- Left sidebar shows:
  - Drama title and genre
  - Navigation items with counts: Overview, Episodes (N), Characters (N), Scenes (N), Props (N), Settings
  - Active item highlighted
- Each nav item corresponds to a nested child route
- Content area renders `<router-view />`

### Data Sharing

DramaLayout loads the drama and its related data (characters, scenes, props, episodes) once. Child components access this data through the drama Pinia store, avoiding redundant API calls. This replaces the current pattern where DramaManagement loads everything and passes via props/events.

## 6. New Composables

### useEpisodeWorkbench

Orchestrates the entire workbench state:
- Current pipeline stage (script → extracted → storyboards)
- View mode (grid vs edit)
- Selected storyboard ID
- Delegates to sub-composables: useResourcePanel, useStoryboardGrid, useProfessionalEditor

### useResourcePanel

Manages the left resource panel:
- Script content and editing state
- Characters list with generation status
- Scenes list with generation status
- Block expand/collapse state
- Extract characters & scenes action (calls agent or direct API)

### useStoryboardGrid

Manages the right storyboard area:
- Grid/edit mode toggle
- Storyboard list with status computation
- Batch selection for bulk operations
- Batch generate images/videos actions
- Progress tracking (how many have images, how many have videos)

### useAgentChat

Manages Agent drawer communication:
- SSE connection to `/api/v1/agent/:type/chat`
- Message history per agent type
- Streaming state
- Context building (current storyboard, scene, characters)
- Result parsing and apply actions

## 7. New API Module

### api/agent.ts

New module for SSE streaming only. Agent config CRUD already exists in `api/agentConfig.ts` and is kept as-is.

```typescript
export const agentAPI = {
  // SSE streaming chat via fetch + ReadableStream (POST endpoint, cannot use EventSource)
  streamChat(agentType: string, data: AgentChatRequest): Promise<ReadableStream<AgentSSEEvent>>
}
```

Note: The backend endpoint is `POST /api/v1/agent/:type/chat`. Native `EventSource` only supports GET, so this uses `fetch()` with `response.body.getReader()` to read the SSE stream.

### types/agent.ts

```typescript
interface AgentChatRequest {
  message: string
  drama_id?: number
  episode_id?: number
  // Note: backend AgentChatRequest currently only has Message, DramaID, EpisodeID.
  // Context injection (current storyboard, scene, characters) is built into the
  // message string client-side, or the backend struct needs to be extended with
  // a Context field to support structured context passing.
}

interface AgentSSEEvent {
  type: 'tool_call' | 'tool_result' | 'content' | 'done' | 'error'
  data: string
  tool_name?: string
}

interface AgentConfig {
  id: number
  agent_type: string
  name: string
  description: string
  system_prompt: string
  model: string
  temperature: number
  max_tokens: number
  max_iterations: number
  is_active: boolean
  created_at: string
  updated_at: string
}
```

## 8. Migration Strategy

### Phase 1: Foundation
1. Initialize Shadcn Vue: `npx shadcn-vue@latest init`, generate base components into `components/ui/`
2. Install `lucide-vue-next`, `class-variance-authority`, `clsx`, `tailwind-merge`
3. Map Glass tokens to Shadcn CSS variables
4. Audit and migrate `components/common/` (shared components used everywhere, must be migrated early)
5. Create `components/agent/` shell components

### Phase 2: Route Restructuring
6. Create `DramaLayout.vue` with left sidebar navigation
7. Extend `drama` Pinia store for DramaLayout data sharing pattern
8. Refactor routes to nested structure (including redirects for old URLs)
9. Move management tab components under `views/drama/management/`
10. Remove `DramaManagement.vue`

### Phase 3: Workbench
11. Create `EpisodeWorkbench.vue` and workbench sub-components
12. Build ResourcePanel (ScriptBlock, CharacterBlock, SceneBlock)
13. Build StoryboardGrid and StoryboardCard
14. Build StoryboardEditor (edit mode: strip + preview + properties)
15. Refactor components from `views/drama/professional/` into workbench sub-components
16. Create new composables (useEpisodeWorkbench, useResourcePanel, useStoryboardGrid)
17. Remove `EpisodeWorkflow.vue`, `ProfessionalEditor.vue`, and `professional/` directory

### Phase 4: Agent Integration
18. Build AgentDrawer, AgentChat, AgentTypeSwitcher
19. Create useAgentChat composable (fetch + ReadableStream for POST SSE)
20. Create api/agent.ts (streamChat only; keep existing agentConfig.ts)
21. Wire agent results to workbench actions

### Phase 5: Component Migration
22. Migrate remaining views from Element Plus to Shadcn Vue (view by view)
23. Replace `@element-plus/icons-vue` with Lucide icons across all files
24. Remove Element Plus package and all imports
25. Remove `assets/styles/element/index.scss`

### Phase 6: Cleanup
26. Remove deleted view files and unused composables
27. Remove empty directories (views/workflow/, views/script/, views/storyboard/, views/generation/, views/editor/)
28. Update i18n keys for renamed/removed components
29. Run `pnpm build:check` to verify no TypeScript errors
30. Run `pnpm lint:fix` to clean up
