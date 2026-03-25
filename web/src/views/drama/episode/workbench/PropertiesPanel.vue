<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ImageIcon,
  Video,
  MapPin,
  Users,
  Camera,
  RotateCcw,
  Move,
} from 'lucide-vue-next'
import type { Storyboard, Character, Scene } from '@/types/drama'

const props = defineProps<{
  storyboard: Storyboard | null
  characters: Character[]
  scenes: Scene[]
}>()

const emit = defineEmits<{
  saveField: [field: string, value: any]
  generateImage: []
  generateVideo: []
  showCharacterSelector: []
  showSceneSelector: []
}>()

const shotTypeOptions = ['远景', '全景', '中景', '近景', '特写']
const angleOptions = ['平视', '仰视', '俯视', '侧面']
const movementOptions = ['固定镜头', '推镜', '拉镜', '跟镜']

const sceneDisplay = computed(() => {
  if (!props.storyboard?.scene) return null
  const s = props.storyboard.scene
  return `${s.location || ''}${s.time ? ' · ' + s.time : ''}`
})

const storyboardCharacters = computed(() => {
  if (!props.storyboard?.character_ids?.length) return []
  return props.characters.filter(c =>
    props.storyboard!.character_ids!.includes(c.id)
  )
})

function onFieldChange(field: string, event: Event) {
  const target = event.target as HTMLTextAreaElement | HTMLInputElement
  emit('saveField', field, target.value)
}

function onSelectChange(field: string, value: string) {
  emit('saveField', field, value)
}
</script>

<template>
  <div class="props-root">
    <ScrollArea v-if="storyboard" class="props-scroll">
      <div class="props-content">
        <!-- Scene -->
        <div class="props-section">
          <div class="props-label">
            <MapPin :size="12" />
            场景
          </div>
          <div
            class="props-scene-display"
            @click="emit('showSceneSelector')"
          >
            <span v-if="sceneDisplay" class="scene-text">{{ sceneDisplay }}</span>
            <span v-else class="scene-placeholder">选择场景...</span>
          </div>
        </div>

        <!-- Characters -->
        <div class="props-section">
          <div class="props-label">
            <Users :size="12" />
            角色
          </div>
          <div class="props-characters" @click="emit('showCharacterSelector')">
            <Badge
              v-for="char in storyboardCharacters"
              :key="char.id"
              class="char-badge"
            >
              {{ char.name }}
            </Badge>
            <span v-if="!storyboardCharacters.length" class="scene-placeholder">
              点击添加角色...
            </span>
          </div>
        </div>

        <!-- Shot parameters -->
        <div class="props-section">
          <div class="props-label">
            <Camera :size="12" />
            镜头
          </div>
          <div class="props-row">
            <Select
              :model-value="storyboard.shot_type || ''"
              @update:model-value="(v: string) => onSelectChange('shot_type', v)"
            >
              <SelectTrigger class="props-select-trigger">
                <SelectValue placeholder="景别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in shotTypeOptions" :key="opt" :value="opt">
                  {{ opt }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="props-row">
            <Select
              :model-value="storyboard.angle || ''"
              @update:model-value="(v: string) => onSelectChange('angle', v)"
            >
              <SelectTrigger class="props-select-trigger">
                <SelectValue placeholder="角度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in angleOptions" :key="opt" :value="opt">
                  {{ opt }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="props-row">
            <Select
              :model-value="storyboard.movement || ''"
              @update:model-value="(v: string) => onSelectChange('movement', v)"
            >
              <SelectTrigger class="props-select-trigger">
                <SelectValue placeholder="运镜" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in movementOptions" :key="opt" :value="opt">
                  {{ opt }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Description -->
        <div class="props-section">
          <div class="props-label">描述</div>
          <textarea
            class="props-textarea"
            :value="storyboard.description || ''"
            placeholder="镜头描述..."
            rows="2"
            @change="onFieldChange('description', $event)"
          />
        </div>

        <!-- Dialogue -->
        <div class="props-section">
          <div class="props-label">台词</div>
          <textarea
            class="props-textarea"
            :value="storyboard.dialogue || ''"
            placeholder="角色台词..."
            rows="2"
            @change="onFieldChange('dialogue', $event)"
          />
        </div>

        <!-- Action -->
        <div class="props-section">
          <div class="props-label">动作</div>
          <textarea
            class="props-textarea"
            :value="storyboard.action || ''"
            placeholder="角色动作..."
            rows="2"
            @change="onFieldChange('action', $event)"
          />
        </div>

        <!-- Image Prompt -->
        <div class="props-section">
          <div class="props-label">
            <ImageIcon :size="12" />
            图片 Prompt
          </div>
          <textarea
            class="props-textarea props-textarea--tall"
            :value="storyboard.image_prompt || ''"
            placeholder="图片生成提示词..."
            rows="3"
            @change="onFieldChange('image_prompt', $event)"
          />
        </div>

        <!-- Video Prompt -->
        <div class="props-section">
          <div class="props-label">
            <Video :size="12" />
            视频 Prompt
          </div>
          <textarea
            class="props-textarea props-textarea--tall"
            :value="storyboard.video_prompt || ''"
            placeholder="视频生成提示词..."
            rows="3"
            @change="onFieldChange('video_prompt', $event)"
          />
        </div>

        <!-- Generate buttons -->
        <div class="props-actions">
          <Button
            variant="outline"
            size="sm"
            class="props-gen-btn"
            @click="emit('generateImage')"
          >
            <ImageIcon :size="14" />
            生成图片
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="props-gen-btn"
            @click="emit('generateVideo')"
          >
            <Video :size="14" />
            生成视频
          </Button>
        </div>
      </div>
    </ScrollArea>

    <!-- Empty state -->
    <div v-else class="props-empty">
      <p>选择分镜以编辑属性</p>
    </div>
  </div>
</template>

<style scoped>
.props-root {
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  background: var(--bg-secondary, rgba(0, 0, 0, 0.15));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.props-scroll {
  flex: 1;
  min-height: 0;
}

.props-content {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.props-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.props-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
  display: flex;
  align-items: center;
  gap: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.props-row {
  margin-top: 2px;
}

.props-select-trigger {
  height: 28px !important;
  font-size: 12px !important;
  background: var(--bg-primary, rgba(0, 0, 0, 0.2)) !important;
  border-color: var(--border-primary, rgba(255, 255, 255, 0.08)) !important;
}

/* Scene display */
.props-scene-display {
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--bg-primary, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.15s;
}

.props-scene-display:hover {
  border-color: rgba(255, 255, 255, 0.18);
}

.scene-text {
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
}

.scene-placeholder {
  color: var(--text-muted, rgba(255, 255, 255, 0.3));
  font-size: 12px;
}

/* Characters */
.props-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--bg-primary, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
  cursor: pointer;
  min-height: 30px;
  align-items: center;
  transition: border-color 0.15s;
}

.props-characters:hover {
  border-color: rgba(255, 255, 255, 0.18);
}

.char-badge {
  font-size: 10px !important;
  padding: 1px 7px !important;
  height: auto !important;
  border-radius: 9999px !important;
  background: rgba(232, 162, 67, 0.15) !important;
  color: rgba(232, 162, 67, 0.9) !important;
  border: none !important;
}

/* Textareas */
.props-textarea {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
  background: var(--bg-primary, rgba(0, 0, 0, 0.2));
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s;
}

.props-textarea::placeholder {
  color: var(--text-muted, rgba(255, 255, 255, 0.3));
}

.props-textarea:focus {
  outline: none;
  border-color: var(--accent, #e8a243);
}

.props-textarea--tall {
  min-height: 60px;
}

/* Generate buttons */
.props-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}

.props-gen-btn {
  width: 100%;
  font-size: 12px !important;
  height: 32px !important;
  justify-content: center;
  gap: 6px;
}

/* Empty state */
.props-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, rgba(255, 255, 255, 0.3));
  font-size: 12px;
}

.props-empty p {
  margin: 0;
}
</style>
