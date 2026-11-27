import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('prompt_generator video prompt format uses @name references instead of XML tags', () => {
  const agents = read('src/agents/index.ts')
  const skill = read('workspace/skills/prompt-generator/video-prompt/SKILL.md')

  // scenes/characters referenced via @name (names must match the scene/character lists exactly)
  // i18n: user-facing — asserts the kept zh agent-prompt text
  assert.match(agents, /@场景名/)
  // i18n: user-facing
  assert.match(agents, /@角色名/)
  // i18n: user-facing
  assert.match(agents, /@小明 → @图片1小明/)
  assert.doesNotMatch(agents, /<location>/)
  assert.doesNotMatch(agents, /<role>/)

  // SKILL.md kept in sync
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(skill, /@场景名/)
  // i18n: user-facing
  assert.match(skill, /@角色名/)
  // i18n: user-facing
  assert.match(skill, /@小明.*@图片1小明/)
  assert.doesNotMatch(skill, /<location>/)
  assert.doesNotMatch(skill, /<role>/)

  // settings.vue no longer embeds a default prompt copy (served by the /prompts API);
  // the frontend is not re-asserted here
})
