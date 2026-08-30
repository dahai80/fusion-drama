/**
 * 存储迁移全局状态（模块级单例）。
 * MigrateOverlay 据此渲染全屏遮罩；迁移由设置页触发，进度经 preload 订阅回填。
 */
import { reactive } from 'vue'

interface MigrateState {
  active: boolean
  phase: string
  percent: number
  message: string
}

const state = reactive<MigrateState>({
  active: false,
  phase: '',
  percent: 0,
  message: '',
})

const PHASE_TEXT: Record<string, string> = {
  validating: '正在校验目标目录…',
  stopping: '正在停止后台服务…',
  moving: '正在迁移数据文件…',
  config: '正在更新存储配置…',
  restarting: '正在重启后台服务…',
  done: '迁移完成',
  error: '迁移失败',
}

export function useMigrateState() {
  function begin() {
    state.active = true
    state.phase = 'validating'
    state.percent = 0
    state.message = PHASE_TEXT.validating
  }

  function update(p: { phase: string, message?: string, copiedBytes?: number, totalBytes?: number }) {
    state.phase = p.phase
    if (p.phase === 'moving' && p.totalBytes) {
      state.percent = Math.min(99, Math.round(((p.copiedBytes ?? 0) / p.totalBytes) * 100))
      state.message = `正在迁移数据文件… ${formatBytes(p.copiedBytes ?? 0)} / ${formatBytes(p.totalBytes)}`
    } else {
      state.message = p.message || PHASE_TEXT[p.phase] || p.phase
      if (p.phase === 'done') state.percent = 100
    }
  }

  function end() {
    state.active = false
  }

  return { state, begin, update, end }
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}
