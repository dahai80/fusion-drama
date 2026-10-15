# fusion-drama 优化落地计划（对应 architecture/fusion-drama-opti-prd-1015.md v2）

日期：2026-10-15。PRD 逐条对照当前源码后的结论与执行批次。

## 0. 现状核对（PRD ↔ 源码）

前期 5 轮审计修复已覆盖 PRD 大量地基项，逐条核实如下：

| PRD 项 | 状态 | 证据 |
|---|---|---|
| FR-P0-2 Key 保护 | ✅ 已有 | aiConfigs.ts `withParsedFields(mask)` 响应掩码 + 留空不改 |
| FR-P0-3 上传校验 | ✅ 已有 | upload.ts 扩展名+MIME+sharp 重编码；/static nosniff+immutable |
| FR-P0-4 更新链加固 | ✅ 已有 | updater.ts sha256 缺失 hard fail、basename 钳制、dev feed 门禁 |
| FR-P0-6 ffmpeg/SSRF | ✅ 已有 | ffmpeg-merge.ts concatEscape + assertContainedUnderDataRoot；storage.ts assertPublicHttpUrl |
| FR-P0-5 watchdog/超时/终态化/防重入/启动清扫 | ✅ 大部 | gpu-queue AbortController+watchdog；generation 4xx 终态化、configId 重解析、E4 去重；index.ts 启动原子清扫（await 后 serve） |
| FR-BIZ-5 贵重产物保护 | ✅ 已有 | resultUrl 先落库再下载缩略图；缩略图失败不判死 |
| FR-BIZ-4 幂等（任务级） | ✅ 已有 | tasks.ts processing 同类型去重 |
| NFR-REL-1 启动恢复 | ✅ 已有 | 单条原子 UPDATE + await |
| NFR-OPS-4 Docker | ✅ 已有 | entrypoint 版本比对、tsx 钉死 |
| FR-BIZ-2 引用一致性 | ✅ 基本已有 | 资产均为软删除（deletedAt），物理删除不存在；tasks DELETE 有 4 表引用校验 |

## 1. 本轮落地范围（3 批）

### Batch 1 — M1 地基残余
1. **FR-P0-1a 服务器模式强制鉴权**：绑定非回环地址（无 FUSION_BIND_HOST，即对外部署）且 `FUSION_API_TOKEN` 长度 <32 → 启动即退出并给出可操作报错。桌面/dev（127.0.0.1 绑定）保持免鉴权。
   - 偏差说明：PRD 的 bcrypt 口令+JWT 多用户体系不做——PRD 3 章明确"桌面单人 + 自托管单团队"、不做多租户，静态 Bearer token 与该形态匹配；JWT 属过度设计。
2. **FR-P0-1b 删除二次确认**：dramas/episodes DELETE 要求 `confirm=true`（query 或 body），缺失返回 400；前端调用接线。
3. **FR-P0-1c 级联删除（FR-BIZ-1）**：drama 软删时级联软删其 episodes；episode 软删时级联失败化在途任务。
4. **FR-P0-5a 任务取消**：新增 `POST /api/v1/tasks/:id/cancel`；generation.ts 维护 taskId→AbortController 注册表，取消在步骤边界生效（gpu-queue AbortController 真中断）；pending 直接标 cancelled。
5. **FR-P0-5b merge 防重入**：同 episode 已有 processing 拼接时拒绝新拼接（PRD 4.8）。
6. **NFR-OPS-3 schema 版本化**：`PRAGMA user_version` 迁移器（db/migrations.ts），升版前自动 `VACUUM INTO` 备份库文件到 DATA_ROOT/backups；首个迁移 = user_version 基线。后续加列走迁移数组，废除散落 ALTER。

### Batch 2 — M2 交互
7. **FR-P1-1 任务事件流**：新表 `sys_task_events(task_id, seq, type, payload, created_at)`；generation/agent 关键节点落事件（start/progress/completed/failed/error）；`GET /api/v1/tasks/:id/events` SSE 回放（Last-Event-ID 续传）+ DB tail 跟踪至终态。前端任务卡片接入（降级：事件不落库不阻断主流程）。
8. **FR-BIZ-3 剧本版本保留**：迁移 #2 加 episodes.script_history；script_rewriter 覆写前把旧稿压入历史（保留最近 5 版）；`POST /api/v1/episodes/:id/rollback-script` 回退上一版；前端工作台加回退按钮（4 语言文案）。
9. **FR-P1-2 画布乐观锁**：迁移 #3 加 episodes.flow_version；新增 `PUT /api/v1/episodes/:id/storyboard-order`（CAS `WHERE flow_version=?`，冲突 409 + 返回最新版本）；前端保存分镜顺序走该接口，冲突时提示刷新。
10. **FR-P2-4 前端轮询收敛**：`usePolling()` composable（onUnmounted 自动清理）；merge 轮询与任务轮询接入；useApi 超时统一。

### Batch 3 — M4 打磨
11. **NFR-OPS-2 健康自检**：/health 增加 schemaVersion、storageWritable、engineOk（fusion-mlx 探测，2s 超时，失败不 503 只置 false）。
12. **FR-BIZ-6 服务器版 DB 备份**：`POST /api/v1/storage/backup`（VACUUM INTO 时间戳文件到 DATA_ROOT/backups，保留最近 10 份）+ `GET /api/v1/storage/backups` 列表；恢复沿用桌面版迁移桥，文档注明。
13. **FR-BIZ-2a I2V 首帧选图唯一化**：首帧解析逻辑收敛到宿主（generation.ts），adapter 只接收已解析的 firstFrameUrl。

### 明确不做（本决策记录，PRD 决策记录 §10.3 同口径）
- **FR-P1-3 worker_threads 供应商沙箱**：双轨迁移 2 周量级，且 O5 的成功指标（纯配置接入新供应商）已由 ai_service_configs + OpenAI 兼容 adapter 满足——自定义 baseUrl+Key 即可接入中转站/新供应商，无需发版。沙箱插件体系单独立项。
- **FR-P2-1 四视图 / P2-2 画风提取 / P2-3 衍生资产树**：新特性非缺陷，M4 打磨项，随下个功能版本。
- **JWT/bcrypt 多用户**：见 #1 偏差说明。
- **NFR-PERF-2 5GB 流式上传**：产品无视频上传入口，图片上传已限 10MB；记录待真实需求出现再做。

## 2. 验证口径
- 每批：`cd backend && npm run typecheck && node --import tsx --test`（存量 66 用例全绿）；动前端则 `npm run generate` + frontend tests 46 全绿；动 desktop 则 esbuild bundle 校验。
- Batch 1 额外：启动演练（无 token 全网卡绑定拒启 / 32B token 放行）、cancel/merge 防重入结构测试。
- 每批一个 commit（英文 + Co-Authored-By），push dahai80 master。
