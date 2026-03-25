import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ElementPlus from 'element-plus'
import UploadNovelDialog from '../UploadNovelDialog.vue'

// Suppress Element Plus ResizeObserver / offsetHeight errors in happy-dom
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  }
})

vi.mock('@/utils/novelSplitter', () => ({
  splitNovel: vi.fn(() => [
    { title: '第1章', content: '章节一内容', charCount: 5 },
    { title: '第2章', content: '章节二内容', charCount: 5 },
    { title: '第3章', content: '章节三内容', charCount: 5 },
  ]),
}))

vi.mock('@/api/drama', () => ({
  dramaAPI: {
    get: vi.fn(),
    saveEpisodes: vi.fn(),
  },
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

import { splitNovel } from '@/utils/novelSplitter'
import { dramaAPI } from '@/api/drama'
import { toast } from 'vue-sonner'

const zhCN = {
  common: { cancel: '取消', failed: '失败' },
  drama: {
    novel: {
      title: '上传小说拆分章节',
      dragTip: '将 .txt 文件拖到此处，或点击上传',
      txtOnly: '仅支持 .txt 格式',
      fileName: '文件名',
      totalChars: '总字数',
      splitMode: '拆分模式',
      byChapter: '按章节标记',
      byCharCount: '按字数',
      targetChars: '目标字数',
      saveMode: '保存模式',
      append: '追加到现有章节',
      replace: '替换所有章节',
      replaceWarning: '替换模式将删除所有现有章节，此操作不可撤销！',
      startSplit: '开始拆分',
      totalChapters: '共 {count} 章',
      totalCharsCount: '总字数：{count}',
      charCount: '{count} 字',
      saveSuccess: '章节保存成功',
      noFile: '请先上传文件',
      back: '返回',
      save: '保存章节',
    },
  },
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
})

function mountDialog(props = {}) {
  return mount(UploadNovelDialog, {
    props: {
      modelValue: true,
      dramaId: 'drama-1',
      existingEpisodeCount: 0,
      ...props,
    },
    global: {
      plugins: [i18n, ElementPlus],
    },
    attachTo: document.body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UploadNovelDialog', () => {
  describe('Step 1 — Upload & Config UI', () => {
    it('initial render: startSplit button is disabled when no file uploaded', () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      expect(vm.step).toBe(1)
      expect(vm.fileText).toBe('')
      // The :disabled binding is `!fileText`, so with empty fileText the button should be disabled
      // Verify via DOM: find button containing the split text
      const allButtons = wrapper.findAll('button')
      const splitBtn = allButtons.find((b) => b.text().includes('开始拆分'))
      // In happy-dom, Element Plus may not set the HTML disabled attribute,
      // so verify the underlying reactive state that drives the disabled binding
      expect(!!vm.fileText).toBe(false)
      // If the button is found, check it has disabled-related markers
      if (splitBtn) {
        expect(
          splitBtn.attributes('disabled') !== undefined ||
          splitBtn.classes().includes('is-disabled')
        ).toBe(true)
      }
    })

    it('after setting fileText: startSplit button becomes enabled', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '一些小说内容'
      await wrapper.vm.$nextTick()
      const buttons = wrapper.findAll('button')
      const splitBtn = buttons.find((b) => b.text().includes('开始拆分'))
      expect(splitBtn?.attributes('disabled')).toBeUndefined()
    })

    it('split mode radio binding works', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      expect(vm.splitMode).toBe('chapter')
      vm.splitMode = 'charCount'
      await wrapper.vm.$nextTick()
      expect(vm.splitMode).toBe('charCount')
    })

    it('replace warning shown when replace selected and existingEpisodeCount > 0', async () => {
      const wrapper = mountDialog({ existingEpisodeCount: 5 })
      const vm = wrapper.vm as any
      vm.fileText = '一些内容'
      vm.saveMode = 'replace'
      await wrapper.vm.$nextTick()
      const alertEl = wrapper.find('.el-alert')
      expect(alertEl.exists()).toBe(true)
    })

    it('replace warning NOT shown when existingEpisodeCount is 0', async () => {
      const wrapper = mountDialog({ existingEpisodeCount: 0 })
      const vm = wrapper.vm as any
      vm.fileText = '一些内容'
      vm.saveMode = 'replace'
      await wrapper.vm.$nextTick()
      const alertEl = wrapper.find('.el-alert')
      expect(alertEl.exists()).toBe(false)
    })
  })

  describe('Step 2 — Preview', () => {
    it('clicking split calls splitNovel and moves to step 2', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.splitMode = 'chapter'
      vm.targetChars = 3000
      await wrapper.vm.$nextTick()

      vm.handleSplit()
      await wrapper.vm.$nextTick()

      expect(splitNovel).toHaveBeenCalledWith('小说内容', {
        mode: 'chapter',
        targetChars: 3000,
      })
      expect(vm.step).toBe(2)
      expect(vm.chapters).toHaveLength(3)
    })

    it('chapter items render correct count in step 2', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      const items = wrapper.findAll('.chapter-item')
      expect(items).toHaveLength(3)
    })

    it('click chapter item changes selectedIndex', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      expect(vm.selectedIndex).toBe(0)
      const items = wrapper.findAll('.chapter-item')
      await items[2].trigger('click')
      expect(vm.selectedIndex).toBe(2)
    })

    it('stats tags show correct chapter count and total chars', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      expect(vm.chapters).toHaveLength(3)
      expect(vm.totalCharsCount).toBe(15)
      const stats = wrapper.find('.preview-stats')
      expect(stats.exists()).toBe(true)
    })

    it('delete chapter removes it and adjusts selectedIndex', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      expect(vm.chapters).toHaveLength(3)
      vm.selectedIndex = 2
      vm.handleDeleteChapter(2)
      await wrapper.vm.$nextTick()

      expect(vm.chapters).toHaveLength(2)
      expect(vm.selectedIndex).toBe(1)
    })

    it('editing content updates charCount', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      vm.handleContentEdit('新的内容abc')
      expect(vm.chapters[0].content).toBe('新的内容abc')
      expect(vm.chapters[0].charCount).toBe(7)
    })
  })

  describe('Save Logic', () => {
    it('replace mode: calls saveEpisodes with episode_number starting from 1', async () => {
      vi.mocked(dramaAPI.saveEpisodes).mockResolvedValue(undefined as any)
      const wrapper = mountDialog({ existingEpisodeCount: 3 })
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.saveMode = 'replace'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      await vm.handleSave()
      await flushPromises()

      expect(dramaAPI.get).not.toHaveBeenCalled()
      expect(dramaAPI.saveEpisodes).toHaveBeenCalledWith('drama-1', [
        { episode_number: 1, title: '第1章', script_content: '章节一内容' },
        { episode_number: 2, title: '第2章', script_content: '章节二内容' },
        { episode_number: 3, title: '第3章', script_content: '章节三内容' },
      ])
    })

    it('append mode with existing episodes: calls get then saveEpisodes with merged data', async () => {
      vi.mocked(dramaAPI.get).mockResolvedValue({
        episodes: [
          { id: 10, episode_number: 1, title: '已有章节', script_content: '已有内容' },
        ],
      } as any)
      vi.mocked(dramaAPI.saveEpisodes).mockResolvedValue(undefined as any)

      const wrapper = mountDialog({ existingEpisodeCount: 1 })
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.saveMode = 'append'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      await vm.handleSave()
      await flushPromises()

      expect(dramaAPI.get).toHaveBeenCalledWith('drama-1')
      expect(dramaAPI.saveEpisodes).toHaveBeenCalledWith('drama-1', [
        { id: 10, episode_number: 1, title: '已有章节', script_content: '已有内容' },
        { episode_number: 2, title: '第1章', script_content: '章节一内容' },
        { episode_number: 3, title: '第2章', script_content: '章节二内容' },
        { episode_number: 4, title: '第3章', script_content: '章节三内容' },
      ])
    })

    it('save success: emits success event', async () => {
      vi.mocked(dramaAPI.saveEpisodes).mockResolvedValue(undefined as any)
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.saveMode = 'replace'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      await vm.handleSave()
      await flushPromises()

      expect(toast.success).toHaveBeenCalled()
      expect(wrapper.emitted('success')).toBeTruthy()
    })

    it('save failure: calls toast.error and does not emit success', async () => {
      vi.mocked(dramaAPI.saveEpisodes).mockRejectedValue(new Error('网络错误'))
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.saveMode = 'replace'
      vm.handleSplit()
      await wrapper.vm.$nextTick()

      await vm.handleSave()
      await flushPromises()

      expect(toast.error).toHaveBeenCalledWith('网络错误')
      expect(wrapper.emitted('success')).toBeFalsy()
    })
  })

  describe('Close & Reset', () => {
    it('after close: step resets to 1, fileText empty, chapters empty', async () => {
      const wrapper = mountDialog()
      const vm = wrapper.vm as any
      vm.fileText = '小说内容'
      vm.handleSplit()
      await wrapper.vm.$nextTick()
      expect(vm.step).toBe(2)
      expect(vm.chapters).toHaveLength(3)

      vm.handleClose()
      await wrapper.vm.$nextTick()

      expect(vm.step).toBe(1)
      expect(vm.fileText).toBe('')
      expect(vm.chapters).toHaveLength(0)
      expect(vm.selectedIndex).toBe(0)
      expect(vm.editingIndex).toBe(-1)
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    })
  })
})
