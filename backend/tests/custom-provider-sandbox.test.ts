import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    evaluateCustomProviderCode,
    validateCustomProviderExports,
    wrapAdapterMethods,
} from '../src/services/custom-provider-sandbox'

const imageAdapterCode = `
module.exports = {
    buildGenerateRequest(config, record) {
        return {
            url: config.baseUrl + '/generate',
            method: 'POST',
            headers: { Authorization: 'Bearer ' + config.apiKey },
            body: { model: config.model, prompt: record.prompt },
        }
    },
    parseGenerateResponse(result) { return { isAsync: false, imageUrl: result.url } },
    buildPollRequest(config, taskId) { return { url: config.baseUrl + '/' + taskId, method: 'GET', headers: {}, body: undefined } },
    parsePollResponse(result) { return { status: 'completed', imageUrl: result.url } },
    extractImageUrl(result) { return result.url || null },
    extractImageBase64() { return null },
}
`

test('sandbox evaluates module.exports and wraps adapter methods', () => {
    const mod = evaluateCustomProviderCode(imageAdapterCode, 'demo')
    const fns = validateCustomProviderExports(mod, 'image')
    assert.deepEqual(fns, [
        'buildGenerateRequest', 'parseGenerateResponse', 'buildPollRequest',
        'parsePollResponse', 'extractImageUrl', 'extractImageBase64',
    ])

    const wrapped = wrapAdapterMethods(mod, fns, 'demo')
    const req = wrapped.buildGenerateRequest(
        { provider: 'custom:demo', baseUrl: 'https://api.example.com', apiKey: 'k1', model: 'm1' },
        { id: 1, prompt: 'a cat' },
    )
    assert.equal(req.url, 'https://api.example.com/generate')
    assert.equal(req.headers.Authorization, 'Bearer k1')
})

test('sandbox hides require/process/fs and rejects non-object exports', () => {
    // require/process/fs 均不可见（直接引用抛 ReferenceError；typeof 只返回 undefined 不抛）
    assert.throws(() => evaluateCustomProviderCode('module.exports = { probe: require("fs") }', 'p1'), /require is not defined/)
    assert.throws(() => evaluateCustomProviderCode('module.exports = { probe: process.exit(1) }', 'p2'), /process is not defined/)
    // 未导出对象（module.exports 保持空对象）
    assert.throws(() => evaluateCustomProviderCode('1 + 1', 'p3'), /未导出对象/)
    // 缺必需方法
    const mod = evaluateCustomProviderCode('module.exports = { buildGenerateRequest() {} }', 'p4')
    assert.throws(() => validateCustomProviderExports(mod, 'image'), /缺少必需方法/)
})

test('sandbox times out runaway code', () => {
    assert.throws(
        () => evaluateCustomProviderCode('while (true) {}', 'runaway'),
        /Script execution timed out/,
    )
})

test('sandbox method wrapper surfaces provider name on error', () => {
    const mod = evaluateCustomProviderCode('module.exports = { boom() { throw new Error("kaput") } }', 'bad')
    const wrapped = wrapAdapterMethods(mod, ['boom'], 'bad')
    assert.throws(() => wrapped.boom(), /自定义 provider "bad" boom\(\) 执行失败: kaput/)
})
