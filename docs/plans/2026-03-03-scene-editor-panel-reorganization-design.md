# SceneEditorPanel 重组设计

**日期：** 2026-03-03
**状态：** 已批准，待实现

## 背景

当前 SceneEditorPanel 有 6 个顶层 PanelSection：场景要素、镜头设置、内容描述、音频氛围、图片生成、视频生成。前 4 个本质上是图片/视频生成的输入参数，不应单独存在，导致用户工作流割裂。

## 目标

将 6 个 section 合并为 2 个，内部平铺融合，减少认知负担。

## 新结构

### panel-scroll 顶层（仅 2 个 PanelSection）

```
PanelSection "📸 图片生成"  default-open: true
PanelSection "🎬 视频生成"  default-open: true
```

### 📸 图片生成 section — 内部平铺顺序

```
场景       背景预览图（可点击放大）+ "选择场景" 按钮
角色       头像 chip 行 + "添加角色" 按钮
道具       头像 chip 行 + "添加道具" 按钮
── 视觉分割线 ──
帧类型     first / last / action / key  radio-button 组
提示词     textarea (4行) + "提取提示词" 按钮（右上角）
操作行     "生成图片" 按钮  +  "上传图片" 按钮
结果       生成图片网格（有图时显示）
```

### 🎬 视频生成 section — 内部平铺顺序

```
镜头设置   shot_type / movement / angle 三列下拉（shot-row）
动作       action textarea (3行)
对白       dialogue textarea (2行)
动作结果   result textarea (2行)
镜头描述   description textarea (3行)
音频氛围   内联 toggle 折叠：sound_effect / bgm_prompt / atmosphere（默认折叠）
── 视觉分割线 ──
提示词预览 video_prompt 只读展示 + 复制按钮
模型选择   el-select
生成按钮   gen-btn
合成工作台 composition-link-btn
结果列表   video-result-list / empty-hint
```

## 音频氛围折叠方案

使用内联 toggle（`<details>` 原生元素或 `v-show` + 小箭头按钮），默认折叠，展开后显示 3 个 textarea。不使用嵌套 PanelSection 避免多层折叠。

## 代码清理

删除以下 i18n key（zh-CN.ts + en-US.ts）：
- `sectionSceneElements`
- `sectionShotSettings`
- `sectionContent`
- `sectionAudio`

删除对应 SCSS（如有残留 `.section-*` 类）。

## 不改变的内容

- `panel-nav`（顶部分镜导航）保持不变
- 所有 emit 事件保持不变（`show-scene-selector`、`toggle-character` 等）
- 所有数据绑定和 save-field 逻辑保持不变
- PanelSection 组件本身不变
