# 火宝短剧

基于 TypeScript 的 AI 短剧生产工作台。  
当前开源版本覆盖了从剧集内容编写、AI 改写、角色场景提取、分镜生成，到图片生成、配音生成、视频生成、单镜头合成和整集拼接导出的完整流程。

![火宝短剧](/Users/connor/AiProject/huobao-drama/drama.png)

## 项目简介

火宝短剧是一个本地优先的短剧生产工具，面向连载短剧项目，提供完整的生产工作流：

- 项目与剧集管理
- AI 剧本改写与信息提取
- 角色、场景、分镜编辑
- 角色图、场景图、镜头图生成
- 配音试听、镜头 TTS、视频生成
- FFmpeg 单镜头合成与整集拼接
- 可视化工作台统一管理全流程

本仓库是当前的 TypeScript 版本，不是旧的 Go 版本实现。

## 技术栈

### 前端

- Nuxt 3
- Vue 3
- TypeScript
- 纯 CSS

### 后端

- Hono
- Drizzle ORM
- better-sqlite3
- Mastra Agents
- FFmpeg

### 存储

- SQLite 数据库
- 本地文件存储 `data/static/`

## 项目结构

```text
frontend/   Nuxt 3 工作台前端
backend/    Hono API + Drizzle + agent/runtime 服务
configs/    示例配置
data/       本地数据库与生成资源
skills/     agent 运行时技能定义
```

关键入口：

- 后端入口：[backend/src/index.ts](/Users/connor/AiProject/huobao-drama/backend/src/index.ts)
- 数据库入口：[backend/src/db/index.ts](/Users/connor/AiProject/huobao-drama/backend/src/db/index.ts)
- 工作台页面：[frontend/app/pages/drama/[id]/episode/[episodeNumber].vue](/Users/connor/AiProject/huobao-drama/frontend/app/pages/drama/[id]/episode/[episodeNumber].vue)

## 核心工作流

工作台当前按这条流程组织：

1. 原始内容录入
2. 可选 AI 改写
3. 角色与场景提取
4. 音色分配
5. 分镜拆解与编辑
6. 角色图 / 场景图 / 镜头图生成
7. 配音生成
8. 视频生成
9. 单镜头视频合成
10. 整集拼接导出

此外还包含宫格图工具，用于：

- 生成多格参考图
- 切分宫格图
- 手动将格子分配回选中的分镜

## 功能概览

### 项目与剧集管理

- 创建和管理短剧项目
- 创建剧集，并在创建时锁定图片 / 视频 / 音频模型配置
- 本地 SQLite 持久化

### AI 工作流

当前内置 agent：

- `script_rewriter`
- `extractor`
- `storyboard_breaker`
- `voice_assigner`
- `grid_prompt_generator`

对应能力包括：

- 剧本改写
- 角色与场景提取
- 分镜拆解
- 音色分配
- 宫格图提示词生成

### 素材生成

- 角色图片生成
- 场景图片生成
- 镜头图片生成
- 角色试听生成
- 镜头 TTS 生成
- 文生视频 / 图生视频生成

### 编辑与生产

- 分镜绑定角色与场景
- 分镜级提示词编辑
- 已生成图片 / 视频预览
- 批量合成
- 最终整集导出

### 运维与配置

- AI 服务配置页面
- 音色同步接口
- agent / 图片 / 音频 / 视频 / 合成 / 拼接日志输出

## 环境要求

- Node.js 18+
- npm 9+
- FFmpeg 已安装并在 `PATH` 中可用

推荐：

- macOS / Linux
- 本地对 `data/` 目录有读写权限

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. 准备配置

如需本地配置文件：

```bash
cp configs/config.example.yaml configs/config.yaml
```

当前运行时的 provider 配置主要来自 Web 设置页数据库配置，但 `config.example.yaml` 仍然可作为本地参考。

### 3. 启动后端

```bash
cd backend
npm run dev
```

默认地址：

- `http://localhost:5679`

### 4. 启动前端

```bash
cd frontend
npm run dev
```

默认地址：

- `http://localhost:3013`

开发模式下前端会代理：

- `/api`
- `/static`

到后端服务。

## 构建与运行

### 前端静态导出

```bash
cd frontend
npm run generate
```

当前前端是 Nuxt SPA 模式。  
如果你希望后端直接托管前端静态资源，使用 `npm run generate`，输出目录为：

- `frontend/dist`

### 后端类型检查

```bash
cd backend
npm run typecheck
```

### 后端启动

```bash
cd backend
npm start
```

## 生产运行模式

### 前后端分离模式

- 前端：`cd frontend && npm run preview`
- 后端：`cd backend && npm start`

### 单服务模式

如果希望后端直接提供前端页面：

```bash
cd frontend
npm run generate

cd ../backend
npm start
```

当前后端静态托管前端目录：

- `frontend/dist`

## 数据库

当前默认数据库文件：

- `data/huobao_drama.db`

后端现在支持从空数据库文件启动，并自动初始化基础表。

如果需要改路径：

```bash
DB_PATH=/absolute/path/to/your.db npm start
```

## 文件存储

生成资源默认写入：

- `data/static/images`
- `data/static/videos`
- `data/static/audio`
- `data/static/subtitles`
- `data/static/composed`
- `data/static/merged`
- `data/static/grid-cells`

后端通过：

- `/static/*`

对外提供访问。

## AI 服务配置

在设置页中配置 provider。

当前支持的服务分类：

- 文本
- 图片
- 视频
- 音频

设置页内还提供：

- 火宝一键配置

用于快速初始化默认服务配置。

## Agents 与 Skills

当前运行时 agent：

- `script_rewriter`
- `extractor`
- `storyboard_breaker`
- `voice_assigner`
- `grid_prompt_generator`

Skills 存放在：

- `skills/`

后端会在运行时按 agent 类型加载对应 skill，并拼接进最终 agent instructions。

## 媒体链路说明

### 图片生成

- 本地参考图在需要时会转成 base64 再发给 provider
- 单镜头图片会自动带入场景图、角色图、镜头参考图

### 配音生成

- `无`
- `无对白`
- `环境音`
- `音效`
- `BGM`

这类内容会自动跳过，不进入 TTS 生成

### 视频生成

- 支持包括 Volcengine / Seedance 在内的 provider adapter
- 本地参考图会在发送前转换成 provider 可接受的格式

### 视频合成与拼接

- 单镜头合成使用 FFmpeg
- 如果本机 FFmpeg 不支持字幕烧录 filter，会自动降级为视频 + 音频合成
- 整集拼接现在要求使用已合成镜头，并统一转码，稳定性更高

## 主要 API 分组

关键路由包括：

- `/api/v1/dramas`
- `/api/v1/episodes`
- `/api/v1/storyboards`
- `/api/v1/characters`
- `/api/v1/scenes`
- `/api/v1/images`
- `/api/v1/videos`
- `/api/v1/compose`
- `/api/v1/merge`
- `/api/v1/grid`
- `/api/v1/agent`
- `/api/v1/ai-configs`
- `/api/v1/ai-voices`

Webhook 路由：

- `/webhooks`

## 开源说明

当前仓库已做过一轮开源清理：

- 运行期内容数据已清空
- 生成静态资源已清空
- 默认本地数据库已切换为新的 `huobao_drama.db`

发布前仍建议自行检查：

- `.env`
- 本地配置覆盖
- API Key
- 本地数据库快照

## 更新日志

### v2.0.0

这是火宝短剧当前 TypeScript 版本的开源基线版本。

`2.0.0` 主要更新：

- 项目迁移到当前 TypeScript 技术栈
  - Hono 后端
  - Drizzle + better-sqlite3
  - Nuxt 3 工作台前端
- 重做单集工作台 UI 和生产流程
  - 更紧凑的控制台布局
  - 重做分镜编辑区
  - 重做配音、镜头图、视频、合成、导出界面
- 增加运行时 skill 加载
- 扩展多种媒体 provider adapter
  - Gemini
  - OpenAI 兼容图片接口
  - MiniMax
  - Volcengine / Seedance
  - Ali
- 增加宫格图生成、切分和重新分配流程
- 完善 agent / 图片 / 音频 / 视频 / 合成 / 拼接日志
- 优化本地文件处理
  - 本地参考图按需转码
  - 默认数据库切换为 `data/huobao_drama.db`
- 完成开源版运行数据清理

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request。

建议流程：

1. Fork 仓库
2. 创建功能分支
3. 完成修改
4. 运行相关检查
5. 提交 Pull Request

常用检查命令：

```bash
cd backend
npm run typecheck

cd ../frontend
npm run build
```

## API 配置站点

2 分钟完成配置：[API 聚合站点](https://api.chatfire.site/models)

---

## 👨‍💻 关于我们

**AI 火宝 - AI 工作室创业中**

- 🏠 **位置**: 中国南京
- 🚀 **状态**: 创业中
- 📧 **Email**: [18550175439@163.com](mailto:18550175439@163.com)
- 🐙 **GitHub**: [https://github.com/chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama)

> _"让 AI 帮我们做更有创造力的事"_

### 📢 招聘信息

#### 全栈高级开发工程师（Base 南京）

**关于岗位：**

我们是创业团队，致力于打造 AI 驱动的终端应用。如果你热爱技术、追求极致，渴望在 AI 领域有所作为，欢迎加入我们，一起做有意义的事！

**岗位要求：**

1. 参与 AI 驱动的终端应用全栈开发，覆盖 Web/移动端前后端系统搭建，主导核心业务模块的设计、开发、测试与上线迭代。
2. 负责核心功能模块开发，包括：前端交互实现（React/Vue.js + TypeScript）、后端服务开发（Python/Node.js + Flask/FastAPI），确保模块高效、稳定、可扩展。
3. 负责 AI 模型服务接口设计与对接，参与 AI 能力落地终端场景的技术方案设计，推动 AI 技术与业务场景的深度融合。
4. 深度践行 vibe coding 开发模式，注重代码质量、开发效率与技术美感，搭建规范的开发流程，推动团队研发模式优化。

**加入我们：**

如果你对 AI 技术充满热情，喜欢挑战和创新，欢迎投递简历至 [18550175439@163.com](mailto:18550175439@163.com)

期待志同道合的你一起探索 AI 的无限可能！

## 项目交流群

![项目交流群](drama.png)

- 提交 [Issue](../../issues)
- 发送邮件至项目维护者

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star！**

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=chatfire-AI/huobao-drama&type=date&legend=top-left)](https://www.star-history.com/#chatfire-AI/huobao-drama&type=date&legend=top-left)
Made with ❤️ by Huobao Team

</div>