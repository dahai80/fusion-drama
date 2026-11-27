/**
 * Programmable provider sandbox — evaluates user-defined adapter code via node:vm
 *
 * Pure module (no DB dependency): evaluation / validation / method wrapping. DB read/write and caching live in custom-providers.ts.
 * Sandbox limits: no require/process/fs/Buffer/global; provides console/fetch/URL/URLSearchParams.
 * Module evaluation runs synchronously with a 5s timeout circuit breaker; adapter methods are called on demand in the generation pipeline.
 *
 * Audit 1107 F-9 trust statement: node:vm is NOT a security boundary. Host-realm
 * values reachable from user code (e.g. an object's .constructor.constructor)
 * can in principle reach the host Function constructor. The in-context wrappers
 * below close the casual `fetch.constructor` / `URL.constructor` escape paths,
 * and codeGeneration.strings=false blocks eval/Function-from-strings inside the
 * context — but this feature must be treated as "admin-defined adapter code
 * runs with backend privileges", never marketed as a hard sandbox.
 */
import vm from 'node:vm'

const EVAL_TIMEOUT_MS = 5000
/** Audit 1107 F-9: cap adapter source size — a 50MB "adapter" is abuse, not code */
const MAX_CODE_BYTES = 256 * 1024

/** Method set every adapter must export (maps 1:1 to the adapters/types.ts interfaces) */
const REQUIRED_EXPORTS = {
    image: ['buildGenerateRequest', 'parseGenerateResponse', 'buildPollRequest', 'parsePollResponse', 'extractImageUrl', 'extractImageBase64'],
    video: ['buildGenerateRequest', 'parseGenerateResponse', 'buildPollRequest', 'parsePollResponse', 'extractVideoUrl'],
} as const

/** In-sandbox console: logs to the main process with a unified prefix, making custom-code issues easier to locate */
function sandboxConsole(name: string) {
    const prefix = `[custom-provider:${name}]`
    return {
        log: (...args: any[]) => console.log(prefix, ...args),
        warn: (...args: any[]) => console.warn(prefix, ...args),
        error: (...args: any[]) => console.error(prefix, ...args),
    }
}

/**
 * Evaluates custom adapter code in the sandbox and returns its exports object.
 * User code convention: `module.exports = { buildGenerateRequest(...) {...}, ... }`
 */
export function evaluateCustomProviderCode(code: string, name: string): Record<string, any> {
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
        throw new Error(`custom provider code exceeds ${MAX_CODE_BYTES / 1024}KB limit`)
    }
    // host fetch is reachable only through an in-context wrapper (F-9):
    // user code sees a sandbox-realm function, so .constructor lands on the
    // context's own Function (disabled via codeGeneration.strings=false)
    const sandbox: Record<string, any> = {
        module: { exports: {} as Record<string, any> },
        console: sandboxConsole(name),
        __hostFetch: (...args: any[]) => fetch(...(args as [any, any])),
        __hostURL: URL,
        __hostURLSearchParams: URLSearchParams,
        setTimeout: () => { throw new Error('setTimeout is not available in custom provider sandbox') },
    }
    sandbox.exports = sandbox.module.exports
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
    // define public wrappers in the sandbox realm (host globals stay __-prefixed)
    new vm.Script(`
        this.fetch = function fetch(...a) { return __hostFetch(...a) }
        this.URL = function URL(...a) { return new __hostURL(...a) }
        this.URLSearchParams = function URLSearchParams(...a) { return new __hostURLSearchParams(...a) }
    `, { filename: `custom-provider:globals:${name}` }).runInContext(context)
    const script = new vm.Script(`(function(){\n${code}\n})()`, { filename: `custom-provider:${name}` })
    script.runInContext(context, { timeout: EVAL_TIMEOUT_MS })
    const mod = sandbox.module.exports
    if (!mod || typeof mod !== 'object' || Object.keys(mod).length === 0) {
        // i18n: user-facing
        throw new Error(`自定义 provider "${name}" 未导出对象：代码末尾需要 module.exports = { ... }`)
    }
    return mod
}

/** Validates the exports object satisfies the adapter interface for the given type; returns the required method names */
export function validateCustomProviderExports(mod: Record<string, any>, type: string): readonly string[] {
    const fns = (REQUIRED_EXPORTS as Record<string, readonly string[]>)[type] ?? []
    const missing = fns.filter(fn => typeof mod[fn] !== 'function')
    if (missing.length) {
        // i18n: user-facing
        throw new Error(`自定义 provider 缺少必需方法: ${missing.join(', ')}`)
    }
    return fns
}

/** Unified method-call wrapper: errors carry the provider name so failures are easier to locate in task logs */
export function wrapAdapterMethods(mod: Record<string, any>, fns: readonly string[], name: string): Record<string, any> {
    const wrapped: Record<string, any> = {}
    for (const fn of fns) {
        wrapped[fn] = (...args: any[]) => {
            try {
                return mod[fn](...args)
            } catch (err: any) {
                // i18n: user-facing
                throw new Error(`自定义 provider "${name}" ${fn}() 执行失败: ${err.message}`)
            }
        }
    }
    return wrapped
}
