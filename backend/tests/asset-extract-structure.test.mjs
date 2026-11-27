import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('extraction service runs per-target async tasks', () => {
  const svc = read('src/services/extraction.ts')

  // Three asset targets
  assert.match(svc, /'characters' \| 'scenes' \| 'props'/)
  assert.match(svc, /EXTRACT_TARGETS.*characters.*scenes.*props/s)
  // In-memory task table keyed by episode x target
  assert.match(svc, /`\$\{episodeId\}:\$\{target\}`/)
  assert.match(svc, /status: 'running' \| 'done' \| 'error'/)
  // Same episode+target already running does not start again
  assert.match(svc, /tasks\.get\(key\)\?\.status === 'running'\)\s*return false/)
  // Each target restricted to extracting only its own type (Chinese LLM prompts in extraction.ts)
  assert.match(svc, /本次只提取角色/) // i18n: user-facing
  assert.match(svc, /本次只提取场景/) // i18n: user-facing
  assert.match(svc, /本次只提取道具/) // i18n: user-facing
  // fire-and-forget async execution of the extractor Agent
  assert.match(svc, /mastra\.getAgent\('extractor'\)/)
  assert.match(svc, /\.then\(\s*(?:async\s*)?\(result[^)]*\) => \{[\s\S]*status = 'done'/)
  assert.match(svc, /\.catch\(\s*(?:async\s*)?\(err/)
  // Print Agent progress step by step (tool calls + text), summary on completion
  assert.match(svc, /onStepFinish/)
  assert.match(svc, /-step/)
  assert.match(svc, /toolCalls/)
})

test('extraction tools dedupe by normalized name so near-names reuse existing assets', () => {
  const tools = read('src/agents/tools/extract-tools.ts')

  // Normalization: bracket-locator/alias-suffix removal + whitespace/case unification
  assert.match(tools, /normalizeName\(name: string\)/)
  assert.match(tools, /replace\(\/\[（\(]/) // full/half-width bracket character class
  assert.match(tools, /replace\(\/\[\\s/) // whitespace character class
  assert.match(tools, /\.toLowerCase\(\)/)
  // Character saving: exact match first, normalized near-name fallback, reuse on hit without duplicate creation
  assert.match(tools, /normalizeName\(c\.name\) === normName/)
  assert.match(tools, /matchedViaNorm/)
  assert.match(tools, /save-characters-reuse/)
  // Props likewise reuse by normalized name
  assert.match(tools, /normalizeName\(p\.name\) === normName/)
  assert.match(tools, /save-props-reuse/)
  // Scenes match by location+time; location only gets whitespace/case normalization (brackets kept)
  assert.match(tools, /normalizeLocation\(loc: string\)/)
  assert.match(tools, /normalizeLocation\(s\.location\) === normLocation/)
  // read_existing_* return normalized fields for the Agent's reuse decision
  assert.match(tools, /normalized_name: normalizeName/)
  assert.match(tools, /normalized_location: normalizeLocation/)
})

test('episodes route exposes async extract endpoints', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.post\('\/:id\/extract'/)
  assert.match(route, /app\.get\('\/:id\/extract-status'/)
  assert.match(route, /target 必须是 characters \/ scenes \/ props/) // i18n: user-facing
  assert.match(route, /startExtraction\(ep\.id, ep\.dramaId, target, \{ model: body\.model/)
  // Top-bar text model override passed through to the extraction Agent
  assert.match(read('src/services/extraction.ts'), /modelOverride: opts\.model/)
  // issue #3: status query is async (await); falls back to sys_task when no in-memory state — terminal state visible to the frontend after restart
  assert.match(route, /await getExtractionStatus\(id\)/)
})

test('extraction status falls back to sys_task when memory is gone (issue #3)', () => {
  const svc = read('src/services/extraction.ts')

  // Persisted as type=extract (dual-track running state: in-memory Map + sys_task row)
  assert.match(svc, /type: 'extract'/)
  // getExtractionStatus is async; targets missing in memory fall back to the latest DB row
  assert.match(svc, /export async function getExtractionStatus/)
  assert.match(svc, /eq\(schema\.sysTask\.type, 'extract'\)/)
  assert.match(svc, /hit\.status === 'completed' \? 'done' : hit\.status === 'failed' \? 'error'/)
})
