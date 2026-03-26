# Filmstrip 工作台 — 设计文档

## 概述

重新设计 EpisodeWorkbench，将现有的 Grid/Edit 双模式替换为 Tab 切换的工作台：**剧本 Tab** + **分镜 Tab（表格视图）**。左侧资源面板改为可折叠图标栏，Agent 保持右侧抽屉。

## 整体布局

```
┌──────────────────────────────────────────────────────────┐
│ TopBar: ← 返回 | 标题·集数 | [剧本] [分镜] | Agent | 合成 → │
├───┬──────────────────────────────────────────────────────┤
│   │                                                      │
│ 资 │                                                      │
│ 源 │         Tab 内容区                                    │
│ 图 │                                                      │
│ 标 │                                                      │
│ 栏 │                                                      │
│   │                                                      │
└───┴──────────────────────────────────────────────────────┘
```

## 左侧资源面板

- 默认收起，只显示图标（剧本、角色、场景）
- 点击图标展开对应面板，再点收回
- 类似 VS Code 侧边栏交互

## 剧本 Tab

### 内容

剧本文本编辑区，显示和编辑剧本内容。

### 操作按钮

- **上传/粘贴** — 导入用户原始内容
- **AI 改写** — 调用 `script_rewriter` Agent，将原始内容改写为格式化剧本
- **提取角色/场景** — 调用 `extractor` Agent，从格式化剧本中提取角色和场景的视觉特征信息

### 格式化剧本格式

AI 改写后输出的格式：

```
## S01 | 内景 · 咖啡厅 | 黄昏

黄昏的光线透过落地窗洒进咖啡厅，吧台上咖啡杯热气升腾。

小明独自坐在角落卡座，低头看手机，神情有些焦虑。

门铃响起，小红推门而入，带进一阵冷风。她看到小明，微笑着走过去。

小红：（微笑）等很久了吗？
小明：（抬头）还好，刚到。
```

规则：
- `## S编号 | 内景/外景 · 地点 | 时间` — 场景头
- 动作描写自然段 — 不包含镜头语言
- `角色名：（状态）台词` — 对白格式

### Pipeline 阶段

| 阶段 | 界面状态 | 可用操作 |
|---|---|---|
| 无剧本 | 空状态引导 | 上传/粘贴 |
| 有原始剧本 | 显示原始内容 | AI 改写 |
| 有格式化剧本 | 显示格式化剧本 | 提取角色/场景 |
| 已提取 | 剧本 + 资源面板有数据 | 切到分镜 Tab 拆分 |

## 分镜 Tab

### 布局

```
┌──────────────────────────────────────────────────────────┐
│ 工具栏: 添加 | 生成宫格图 | 批量生成图片 | 批量生成视频    │
├──────────────────────────────────────────────────────────┤
│ ☑ | #     | 缩略图  | 场景 | 景别 | 描述 | 视频提示词 | … │
│ □ | S01-01| [img]   | …   | …   | …   | …         | … │
│ □ | S01-02| [img]   | …   | …   | …   | …         | … │
│ ■ | S01-03| [img]   | …   | …   | …   | …         | … │
│ …                                                       │
├──────────────────────────────────────────────────────────┤
│ 状态栏: 共 12 镜头 | 有图 8 | 有视频 3 | 预计 1:48        │
└──────────────────────────────────────────────────────────┘
```

### 表格列定义

| 列 | 类型 | 编辑方式 | 说明 |
|---|---|---|---|
| ☑ | checkbox | 点击 | 多选，用于批量操作 |
| # | 序号 | 不可编辑 | S01-01 格式 |
| 缩略图 | 图片 160x90 | 不可编辑 | 首帧/尾帧，由生成填充 |
| 场景 | 下拉 | 内联下拉 | 来自场景头 |
| 景别 | 下拉 | 内联下拉 | 远景/全景/中景/近景/特写 |
| 描述 | textarea | 内联编辑 | 中文画面描述 |
| 视频提示词 | textarea | 内联编辑 | 带时间段+标签的提示词 |
| 角色 | 多选标签 | 点击弹出 | 该镜头涉及的角色 |
| 对白 | textarea | 内联编辑 | 台词 |
| 状态 | 标识 | 自动 | 待处理/有图/有视频 |
| 操作 | 按钮 | hover 显示 | 生成图片/生成视频 |

### 表格交互

- **全内联编辑** — 点击单元格直接编辑
- **单行操作** — hover 行尾出现生成图片/生成视频按钮
- **多选批量操作** — checkbox 多选后，工具栏出现批量生成按钮
- **缩略图** — 160x90 行内显示，hover 弹出大图

### 工具栏操作

- **添加镜头** — 在表格末尾新增一行
- **生成宫格图** — 选中多个镜头 → 合并提示词生成宫格图 → 拆分回各镜头缩略图（首帧/尾帧）
- **批量生成图片** — 选中镜头批量生成首帧/尾帧图片
- **批量生成视频** — 选中镜头批量生成视频

### 空状态

分镜 Tab 在未拆分镜头时显示空状态引导，提示用户先完成剧本 Tab 的流程后点击"拆分镜头"按钮。

## 视频提示词格式

拆分镜头时 AI 生成的视频提示词沿用现有格式：

```
0-3秒：<location>咖啡厅</location>，近景，<role>小明</role>低头看手机，表情焦虑。
3-6秒：<location>咖啡厅</location>，全景，门铃响，<role>小红</role>推门走入。
6-9秒：<location>咖啡厅</location>，中景，<role>小红</role>微笑走向小明，坐下。
```

每个镜头约 10-15 秒，单次视频生成覆盖。

## 内容量参考

| 成片时长 | 镜头数 | 格式化剧本 | 用户原始内容 |
|---|---|---|---|
| 1 分钟 | 5-6 个 | ~600 字 | ~500 字 |
| 2 分钟 | 10-12 个 | ~1200 字 | ~1000 字 |
| 3 分钟 | 15-18 个 | ~1800 字 | ~1500 字 |

格式化剧本相比原始内容增加约 20-30%（场景头标记和对白格式化）。

## Agent 改动

| Agent | 改动 | 说明 |
|---|---|---|
| `script_rewriter` | 改 prompt 模板 | 输出格式化剧本格式 |
| `extractor` | 不变 | 提取角色/场景视觉特征 |
| `storyboard_breaker` | 改输出格式 | 同时生成视频提示词 |
| `prompt_generator` | 可能调整 | 视频提示词格式对齐 |
| `style_analyzer` | 不变 | — |
| `voice_assigner` | 不变 | — |

## Agent 交互

- 保持右侧抽屉
- 加快捷键触发
- 交互方式不变

## 删除的组件

- `StoryboardGrid.vue` — 表格替代
- `StoryboardEditor.vue` — 内联编辑替代
- `StoryboardStrip.vue` — 不再需要
- `PreviewPane.vue` — 缩略图 hover 替代
- `PropertiesPanel.vue` — 内联编辑替代
- `StoryboardCard.vue` — 表格行替代

## 新增/改造的组件

| 组件 | 类型 | 说明 |
|---|---|---|
| `ScriptTab.vue` | 新增 | 剧本 Tab 内容：编辑器 + 操作按钮 |
| `StoryboardTable.vue` | 新增 | 分镜 Tab 内容：表格 + 工具栏 + 状态栏 |
| `StoryboardTableRow.vue` | 新增 | 表格行：内联编辑 + hover 操作 |
| `TableToolbar.vue` | 新增 | 表格工具栏：批量操作按钮 |
| `EpisodeWorkbench.vue` | 改造 | Tab 切换布局替代现有 pipeline stage |
| `ResourcePanel.vue` | 改造 | 改为可折叠图标栏 |

## 前端文件变动清单

### 删除
- `web/src/views/drama/episode/workbench/StoryboardGrid.vue`
- `web/src/views/drama/episode/workbench/StoryboardEditor.vue`
- `web/src/views/drama/episode/workbench/StoryboardStrip.vue`
- `web/src/views/drama/episode/workbench/PreviewPane.vue`
- `web/src/views/drama/episode/workbench/PropertiesPanel.vue`
- `web/src/views/drama/episode/workbench/StoryboardCard.vue`

### 新增
- `web/src/views/drama/episode/workbench/ScriptTab.vue`
- `web/src/views/drama/episode/workbench/StoryboardTable.vue`
- `web/src/views/drama/episode/workbench/StoryboardTableRow.vue`
- `web/src/views/drama/episode/workbench/TableToolbar.vue`

### 改造
- `web/src/views/drama/episode/EpisodeWorkbench.vue`
- `web/src/views/drama/episode/workbench/ResourcePanel.vue`
- `web/src/composables/useStoryboardGrid.ts` → 改为 `useStoryboardTable.ts`
- `web/src/composables/useEpisodeWorkbench.ts`

### 后端改动
- `application/services/agent_tools_script.go` — 改写 prompt 模板
- `application/services/agent_tools_storyboard.go` — 拆分输出含视频提示词
