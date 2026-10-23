/**
 * 可编程 Provider 沙箱 — node:vm 求值用户自定义适配器代码
 *
 * 纯模块（无 DB 依赖）：求值 / 校验 / 方法包装。DB 读写与缓存见 custom-providers.ts。
 * 沙箱限制：无 require/process/fs/Buffer/global；提供 console/fetch/URL/URLSearchParams。
 * 模块求值同步执行带 5s 超时熔断；适配器方法在生成管线中按需调用。
 */
import vm from 'node:vm'

const EVAL_TIMEOUT_MS = 5000

/** 适配器必须导出的方法集合（与 adapters/types.ts 接口一一对应） */
const REQUIRED_EXPORTS = {
    image: ['buildGenerateRequest', 'parseGenerateResponse', 'buildPollRequest', 'parsePollResponse', 'extractImageUrl', 'extractImageBase64'],
    video: ['buildGenerateRequest', 'parseGenerateResponse', 'buildPollRequest', 'parsePollResponse', 'extractVideoUrl'],
} as const

/** 沙箱内 console：统一前缀落主进程日志，便于定位自定义代码问题 */
function sandboxConsole(name: string) {
    const prefix = `[custom-provider:${name}]`
    return {
        log: (...args: any[]) => console.log(prefix, ...args),
        warn: (...args: any[]) => console.warn(prefix, ...args),
        error: (...args: any[]) => console.error(prefix, ...args),
    }
}

/**
 * 沙箱求值自定义适配器代码，返回其导出对象。
 * 用户代码约定：`module.exports = { buildGenerateRequest(...) {...}, ... }`
 */
export function evaluateCustomProviderCode(code: string, name: string): Record<string, any> {
    const sandbox: Record<string, any> = {
        module: { exports: {} as Record<string, any> },
        console: sandboxConsole(name),
        fetch: (...args: any[]) => fetch(...(args as [any, any])),
        URL,
        URLSearchParams,
        setTimeout: () => { throw new Error('setTimeout is not available in custom provider sandbox') },
    }
    sandbox.exports = sandbox.module.exports
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
    const script = new vm.Script(`(function(){\n${code}\n})()`, { filename: `custom-provider:${name}` })
    script.runInContext(context, { timeout: EVAL_TIMEOUT_MS })
    const mod = sandbox.module.exports
    if (!mod || typeof mod !== 'object' || Object.keys(mod).length === 0) {
        throw new Error(`自定义 provider "${name}" 未导出对象：代码末尾需要 module.exports = { ... }`)
    }
    return mod
}

/** 校验导出对象满足对应类型的适配器接口，返回必需方法名列表 */
export function validateCustomProviderExports(mod: Record<string, any>, type: string): readonly string[] {
    const fns = (REQUIRED_EXPORTS as Record<string, readonly string[]>)[type] ?? []
    const missing = fns.filter(fn => typeof mod[fn] !== 'function')
    if (missing.length) {
        throw new Error(`自定义 provider 缺少必需方法: ${missing.join(', ')}`)
    }
    return fns
}

/** 方法调用统一包装：报错带 provider 名，便于在任务日志中定位 */
export function wrapAdapterMethods(mod: Record<string, any>, fns: readonly string[], name: string): Record<string, any> {
    const wrapped: Record<string, any> = {}
    for (const fn of fns) {
        wrapped[fn] = (...args: any[]) => {
            try {
                return mod[fn](...args)
            } catch (err: any) {
                throw new Error(`自定义 provider "${name}" ${fn}() 执行失败: ${err.message}`)
            }
        }
    }
    return wrapped
}
