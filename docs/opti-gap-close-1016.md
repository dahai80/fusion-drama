# PRD 补齐计划（fusion-drama-opti-prd-1015 对照差距，2026-10-16）

来源：PRD 对照复盘结论——代码 3 项部分落地 + 5 项裁撤内 3 项可补、E2E 验收矩阵 10 条只跑 1 条。

> **状态：全部完成（2026-10-16）**。实际实现与演练结果见文末「落地记录」。偏差：备份格式用系统 tar.gz（免新增依赖）而非 zip；Agent 事件走 episode 维度（v4 迁移加 episode_id 列）而非任务化。

## 批次 A — 后端能力补齐（一次 commit）

1. **FR-BIZ-6/NFR-DATA-3 备份含 storage**：`POST /storage/backup` 改为 DB 快照 + storage 目录清单（zip 无依赖：用 tar 或自写 zip？——项目纯 Node，选 **tar 无压缩归档** 或引入 archiver）
   - 决策：`archiver` 新增依赖（zip 通用性，桌面/Win 也能解）；备份产物 `manual-<stamp>.zip`（内含 db.sqlite + static/）
   - `GET /storage/backups` 返回 size 为 zip 大小；保留 10 份
2. **FR-BIZ-1 级联清理**：drama 软删时级联清理（软删保留数据不删文件——**改硬删**？PRD 原文「级联清理资产文件与任务记录（DB 行+storage 文件+sys_task），删除后不可恢复要明示」）
   - 现 drama delete = 软删（deletedAt）。PRD 要求确认后真删。方案：confirm=true 时**硬删**——级联删 episodes → storyboards → chars/scenes/props → sys_task → storage 文件（复用 tasks.ts 的引用检查语义），响应中返回清理计数
   - episodes delete 同理（级联该集分镜/资产？不——资产属剧集级不属集级，只清该集分镜+任务）
3. **FR-P1-1 Agent 级事件**：`agents/index.ts` 工具调用链路落事件。Mastra 无原生 hook → 在 `agents/tools/*.ts` 每个工具入口/出口打点（工具拿 RequestContext 有 episodeId/dramaId/taskId？）
   - 查证：工具经 Mastra RequestContext 拿 episodeId/dramaId。sys_task_events.task_id 需要任务号——agent 流程无 sys_task 行（extract 走内存轮询）。方案：extractor/storyboard 任务化或事件表 task_id 可空+episode 维度查询。**先查 useTaskEvents 前端消费方式再定**

## 批次 B — E2E 演练（本地可跑）

4. **E5 kill -9 重启恢复**：起 dev 后端 → 造 processing 任务（直接 SQL 插入模拟）→ kill -9 → 重启 → 验证标 failed + 前端可见
5. **E6 拼接被杀重拼**：模拟 processing merge 行 → 重启 → 重拼无半成品残留（检查 merge 临时目录逻辑）
6. **E4 watchdog**：结构已有，验证 watchdog 超时路径（读码+触发一次超时任务）
7. **E8 已过**（v1→v3 真实迁移）——补「迁移后历史数据可读」查询验证
8. **E9 备份换机恢复**：批次 A 改造后，备份 → 新目录恢复 → 验证路径引用有效

## 批次 C — 压测/度量（PRD §10.2）

9. **NFR-PERF-1 压测**：造 10 万 sys_task 行 → GET /tasks 响应 <500ms 实测
10. **NFR-REL-4 队列反馈**：前端显示排队位次（gpu-queue 队列长度接口/事件）
11. **重试成功率度量**：sys_task 加 retry_of/retry_count 字段？——查重试语义现实现（前端重发=新任务）。方案：轻量——失败任务重发时带 retry_of 溯源，统计口径后端聚合接口

## 不做（维持 PRD 决策记录）

- FR-P1-3 worker 沙箱（M3）——O5 已由配置化满足，PRD §10.3 决策维持
- FR-P1-2 画布乐观锁——裁撤记录在案
- FR-P2-1/2/3、FR-P1-4——PRD 可选/M4 后续版本
- E2（Docker 双用户）——需真实 Docker 环境与云 Key，单独窗口跑
- E7/E10——对应功能裁撤
- 48h soak——生产灰度后跟踪，无法在会话内完成

## 验证口径

每批：typecheck + node --import tsx --test 全绿 + 涉及前端跑 generate；演练项逐条记录实际命令与输出到本文件。

## 落地记录（2026-10-16）

### 批次 A 实际实现

1. **备份 bundle**：`POST /storage/backup` = VACUUM INTO 快照 + 系统 `tar -czf` 打包（DB + STORAGE_ROOT）→ `bundle-<stamp>.tar.gz`；tar 不可用时降级 DB-only 快照。`GET /storage/backups`/prune 兼容 `.sqlite` 与 `.tar.gz`
2. **级联硬删**：`utils/cascade.ts`（cascadeDeleteDrama/cascadeDeleteEpisode）——DB 行按序删 + 文件删除前查 characters/scenes/props/storyboards 交叉引用防误删他剧资产；DELETE /dramas/:id、/episodes/:id 均 confirm=true 硬删，返回清理计数
3. **Agent 级事件**：migrations v4（sys_task_events + episode_id 列 + 索引）；`appendEpisodeEvent`（taskId:0/seq:0 占位）；`agents/index.ts` instrumentTools 包装全部 AGENT_TOOLS 打 tool_call/tool_result；`routes/agent.ts` 打 agent_started/agent_finished；`GET /episodes/:id/events` SSE（回放+tail，agent_finished 后 3s 静默发 end）；前端 useTaskEvents 支持 kind='episode'，episode.vue 提取时实时显示 agent 活动
4. **队列反馈**：gpu-queue `onQueued` 回调 → position>1 时发 `queued` 任务事件；`GET /tasks/queue` 深度接口；前端排队位次展示（4 语言文案）
5. **重试溯源**：migrations v5（sys_task.retry_of）；POST /tasks 接收 retry_of；前端失败重发自动带原任务 id；`GET /tasks/retry-stats` 聚合（重试数/成功率/覆盖基线）

### 批次 B 演练结果（dev server localhost:5679 真机）

| 演练 | 结果 | 关键证据 |
|---|---|---|
| E4 watchdog | PASS | 3s 超时注入挂死任务 → `GPU job "E4-drill-hang" exceeded 0min watchdog`，后续任务正常执行，depth 归零 |
| E5 kill -9 重启恢复 | PASS | processing 任务 → kill -9 → 重启后 status=failed「服务重启，生成任务中断，请重试」+ 启动清扫日志 |
| E6 拼接被杀 | PASS（先补缺口）| 发现 kill -9 跳过 finally → static/temp 残留；index.ts 启动清扫补齐后：merge 行标 failed + `TEMP_FILES=0` |
| E8 迁移后历史数据可读 | PASS | v4/v5 新列历史行 NULL 可读；最早任务行（2026-09-18）可查；空库全新迁移链 v1→v5 顺序应用 |
| E9 备份换机恢复 | PASS | bundle 1.24GB → 解压新目录 → DB 开启 user_version=5、526 任务行可读；static 582=582 文件逐一对应；storyboard 活动引用 0 缺失（234 个任务行缺失为备份前历史漂移，原始库同样缺失） |

### 批次 C 度量结果

| 项 | 结果 |
|---|---|
| NFR-PERF-1 压测 | PASS：10 万行 sys_task（独立临时库），GET /tasks 无过滤 5.1-7.5ms、type 过滤 5.4-5.9ms、组合过滤 2.3-3.5ms，全部 << 500ms 预算 |
| NFR-REL-4 队列反馈 | PASS：`GET /tasks/queue` live 返回 depth；排队位次事件+前端文案就绪 |
| 重试成功率度量 | PASS：`GET /tasks/retry-stats` live 返回（retries/retrySuccessRate/failedTasksTotal/failedTasksRetried） |

### 基线数字

- backend typecheck clean；backend 81/81 tests；frontend 49/49 tests；`npm run generate` clean
- 演练数据已清理（sys_task 723、video_merges 6、/tmp 临时库与恢复目录、压测件全部删除）
