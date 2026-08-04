import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('agent chat accepts a model override that wins over agent and text config defaults', () => {
  const route = read('src/routes/agent.ts')
  const agents = read('src/agents/index.ts')
  const context = read('src/agents/context.ts')

  // 可指定模型与文本配置（provider/baseUrl/apiKey 一并切换），经 RequestContext 传给动态 model 解析
  assert.match(route, /buildAgentRequestContext\(\{/)
  assert.match(route, /modelOverride: body\.model \|\| undefined/)
  assert.match(route, /textConfigId: body\.config_id \|\| undefined/)
  assert.match(route, /requestContext/)
  assert.match(agents, /model: buildModel\(type\)/)
  assert.match(agents, /requestContext\?\.get\('modelOverride'/)
  assert.match(agents, /requestContext\?\.get\('textConfigId'/)
  assert.match(context, /rc\.set\('modelOverride', values\.modelOverride\)/)
  assert.match(context, /rc\.set\('textConfigId', values\.textConfigId\)/)
  assert.match(agents, /modelOverride \|\| dbConfig\?\.model \|\| textConfig\.model/)
  assert.match(agents, /getConfigById\(textConfigId\)/)
})

test('character and scene image generation pass the selected model through', () => {
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')

  // 单角色 + 批量两处都透传
  const charPasses = characters.match(/model: body\.model/g) || []
  assert.ok(charPasses.length >= 2, `expected >=2 model pass-throughs in characters route, got ${charPasses.length}`)
  assert.match(scenes, /model: body\.model/)
  // 可指定图片配置覆盖集锁定配置
  const cfgPasses = characters.match(/configId: body\.config_id \?\? ep\.imageConfigId \?\? undefined/g) || []
  assert.ok(cfgPasses.length >= 2, `expected >=2 config overrides in characters route, got ${cfgPasses.length}`)
  assert.match(scenes, /configId: body\.config_id \?\? ep\.imageConfigId \?\? undefined/)
  // 服务层已有 params.model 优先于配置默认
  const service = read('src/services/generation.ts')
  assert.match(service, /model: params\.model \|\| config\.model/)
})

test('video generation route passes the selected model through', () => {
  const tasks = read('src/routes/tasks.ts')
  const service = read('src/services/generation.ts')

  assert.match(tasks, /model: body\.model/)
  assert.match(service, /model: params\.model \|\| config\.model/)
})
