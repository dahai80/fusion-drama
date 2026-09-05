# 🎬 Huobao Drama - AI 短剧生成平台

<div align="center">

**基于 TypeScript 全栈的 AI 短剧自动化生产平台**

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[功能特性](#功能特性) • [快速开始](#快速开始) • [部署指南](#部署指南)

<h2>🔑 <a href="https://api.chatfire.site">获取 Huobao API Key 👉 立即查看</a></h2>

**文本 · 图片 · 视频全部 AI 能力，一个 Key 即可开通**

部署完成后在「设置 → 火宝快捷配置」粘贴 Key，一键写入三条推荐配置，开箱即用

</div>

---

## 📖 项目简介

Huobao Drama 是一个基于 AI 的短剧自动化生产平台，实现从剧本生成、角色设计、分镜制作到视频合成的全流程自动化。

### 🎯 核心价值

- **🤖 AI 驱动**：使用大语言模型解析剧本，提取角色、场景和分镜信息
- **🎨 智能创作**：AI 绘图生成角色形象和场景背景
- **📹 视频生成**：基于文生视频和图生视频模型自动生成分镜视频
- **🔄 工作流**：完整的短剧制作工作流，从创意到成片一站式完成

### 🛠️ 技术架构

```
frontend/   — Nuxt 3 + Vue 3 + TypeScript (纯 CSS，无 UI 框架)
backend/    — Hono + Drizzle ORM + Mastra AI Agents + better-sqlite3
backend/workspace/skills/ — Agent 技能定义 (SKILL.md，支持界面在线编辑)
desktop/    — Electron 桌面版（主进程 + esbuild 打包 + electron-builder 出 dmg）
data/       — 生成资源文件与 SQLite 数据库
```

> 🔥 **AI创作省钱攻略｜快乐马 & Seedance 合作专属折扣，优惠到底** 👉 [立即查看](https://aiad.dfycloud.com/)

---

## ✨ 功能特性

### 🎭 角色管理

- ✅ AI 生成角色形象
- ✅ 批量角色生成
- ✅ 角色图片上传和管理

### 🎬 视频任务

- ✅ AI 自动生成视频任务
- ✅ 场景描述和视频提示词生成
- ✅ 按任务批量生成视频

### 🎥 视频生成

- ✅ 文生视频自动生成
- ✅ FFmpeg 单镜头合成与字幕处理
- ✅ 整集拼接导出

### 📦 资源管理

- ✅ 素材库统一管理
- ✅ 本地存储支持
- ✅ 任务进度追踪

### 🤖 AI Agents

内置 4 个 Mastra Agent，支持数据库配置和 Skill 扩展：

| Agent | 职责 |
|---|---|
| `script_rewriter` | 小说 → 格式化剧本改写 |
| `extractor` | 角色 / 场景 / 道具智能提取与去重 |
| `storyboard_breaker` | 剧本 → 分镜序列拆解 |
| `prompt_generator` | 角色/场景/道具图片提示词 + 分镜视频提示词生成 |

### 🔌 多厂商适配

| 类型 | 支持厂商 |
|---|---|
| **文本** | OpenAI(兼容接口)、Gemini |
| **图片** | OpenAI、Gemini、火山引擎 |
| **视频** | 火山引擎 Seedance 2.0(标准 / Fast / Mini)、MiniMax H3、阿里云百炼 Wan 3.0 (Prime / 标准) |

---

## 🚀 快速开始

### 📋 环境要求

| 软件 | 版本要求 | 说明 |
|---|---|---|
| **Node.js** | 20+ | 前后端运行环境 |
| **npm** | 9+ | 包管理工具 |

> **数据库零安装**：内置 SQLite（单文件，随项目数据目录存放），无需安装任何数据库服务。
> **FFmpeg 无需安装**：项目通过 `ffmpeg-static` / `ffprobe-static` npm 包内置二进制，开箱即用。

### ⚙️ 环境变量

无需配置文件，通过环境变量设置（均有默认值，本地开发可零配置启动）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SQLITE_PATH` | `<仓库根>/data/huobao.sqlite3` | SQLite 数据库文件位置 |
| `PORT` | `5679` | 后端服务端口 |
| `STORAGE_PATH` | `<仓库根>/data/static` | 生成文件存储目录 |
| `HUOBAO_DATA_DIR` | — | 桌面版由 Electron 主进程注入（userData 数据根） |
| `WORKSPACE_PATH` | `backend/workspace` | Agent 技能/提示词目录（桌面版指向 userData 可写副本） |
| `FRONTEND_DIST` | `frontend/dist` | 前端静态产物目录 |
| `FFMPEG_BIN` / `FFPROBE_BIN` | npm 内置二进制 | 自定义 ffmpeg/ffprobe 可执行文件路径 |
| `PUBLIC_BASE_URL` | — | Seedance 引用本地参考资源时所需的公网地址（服务器部署用） |

> **说明**：AI 服务的 API Key、Base URL 和模型参数全部在 Web 界面的「设置」页配置并入库，不在配置文件/环境变量中维护。

### 📥 安装依赖

```bash
# 克隆项目
git clone https://github.com/chatfire-AI/huobao-drama.git
cd huobao-drama

# 安装后端依赖
cd backend && npm install

# 安装前端依赖
cd ../frontend && npm install
```

### 🎯 启动项目

#### 方式一：开发模式（推荐）

前后端分离，支持热重载：

```bash
# 终端1：启动后端
cd backend
npm run dev

# 终端2：启动前端
cd frontend
npm run dev
```

- 前端地址: `http://localhost:3013`
- 后端 API: `http://localhost:5679/api/v1`
- 前端自动代理 `/api` 和 `/static` 到后端

#### 方式二：单服务模式

后端同时提供 API 和前端静态文件：

```bash
# 1. 构建前端
cd frontend && npm run generate

# 2. 复制构建产物到后端读取的目录（generate 产物在 .output/public，后端只读取 frontend/dist）
cp -r .output/public dist

# 3. 启动后端
cd ../backend && npm start
```

访问: `http://localhost:5679`

### 🗄️ 数据库

内置 SQLite（`better-sqlite3` + WAL 模式），数据库表在首次启动时自动创建（幂等重放 DDL 与种子数据），默认文件位于 `data/huobao.sqlite3`，可通过 `SQLITE_PATH` 重定向。桌面版数据存放在用户数据目录（`~/Library/Application Support/HuobaoDrama/data/`）。

从旧版 MySQL 迁移数据：

**启动时自动迁移（推荐）**：显式配置了 MySQL（`DATABASE_URL` 或 `MYSQL_HOST`）且 SQLite 为空库时，后端启动会自动探测并一次性导入全部表（行数逐表校验、单事务原子写入、失败自动回滚并在下次启动重试、成功后写 `.mysql-imported` 标记避免重复）。设 `MYSQL_AUTO_IMPORT=false` 可关闭。

```bash
# 也可手动执行（目标库非空需加 --force，写入前自动备份）
cd backend && npx tsx scripts/import-mysql-to-sqlite.ts
```

> 迁移只覆盖数据库行；旧部署 `data/static/` 下的图片/视频等媒体文件需手动拷贝，否则历史素材无法访问。

### 🔑 首次使用：配置 AI 服务

启动后所有 AI 功能（文本/生图/视频）都需要先配置模型服务，未配置时页面顶部会有横幅引导：

1. 打开「设置」页
2. 在「火宝快捷配置」中粘贴 Huobao API Key（[前往 api.chatfire.site 获取](https://api.chatfire.site)），一键写入文本、图片、视频三条推荐配置
3. 或使用「手动模板」按厂商逐个添加，支持连通性测试

配置完成横幅自动消失，即可开始创建剧集生产。

---

## 📦 部署指南

### 🖥️ 桌面应用（推荐）

双击安装、开箱即用的 macOS 桌面版：数据库（SQLite）、生成的媒体文件、Agent 技能全部存放在用户数据目录，卸载应用不影响数据。

```bash
# 一键打包（前端 generate → 后端 esbuild → electron-builder）
npm run dist        # macOS dmg（arm64 + Intel）
npm run dist:win    # Windows NSIS 安装器（win-x64，可在 macOS 上交叉打包）

# 产物
# desktop/release/HuobaoDrama-<版本>-arm64.dmg        (Apple Silicon)
# desktop/release/HuobaoDrama-<版本>.dmg              (Intel)
# desktop/release/HuobaoDrama Setup <版本>.exe        (Windows)
```

安装说明：

- macOS 未签名包首次打开需右键 → 打开，或执行 `xattr -cr /Applications/HuobaoDrama.app`
- Windows 未签名包 SmartScreen 会提示「更多信息 → 仍要运行」；正式分发需代码签名证书
- 用户数据目录：`~/Library/Application Support/HuobaoDrama/`（数据库、生成的媒体、技能在线编辑的副本）
- 内置 FFmpeg/FFprobe 二进制，无需系统安装
- Electron 锁定 37.x：better-sqlite3 的 win32 预编译最高覆盖到该版本的 ABI（交叉打包免编译的关键）
- 正式分发需配置 Apple Developer 签名 + 公证（`desktop/electron-builder.yml` 的 `identity`）

#### 🔄 应用内更新（无需 Apple 签名）

桌面版内置更新器（与 Tauri 同类方案：macOS 目录替换 / Windows 静默安装，本地 sha256 校验）。发布新版流程：

```bash
# 1. 改 desktop/package.json 的 version，然后打包
npm run dist        # macOS（产出 dmg + 更新用 zip）
npm run dist:win    # Windows（产出 Setup.exe）

# 2. 生成版本清单 release/latest.json（含各平台产物 sha256）
cd desktop && npm run feed

# 3. 发布：把 latest.json + 安装包 + zip 上传到 GitHub Release（tag 形如 v1.0.1）
```

已安装的客户端会在启动后自动检查清单（也可在「设置 → 关于更新」手动检查），发现新版即提示下载安装。自定义清单地址：`HUOBAO_UPDATE_FEED` 环境变量。

桌面版开发调试：

```bash
npm run build:frontend   # 前端静态产物（frontend/.output/public）
cd desktop && npm run dev  # 打包后端 bundle 并以 Electron 窗口运行
```

> 已知限制：Seedance 视频模型引用本地参考资源时需要 `PUBLIC_BASE_URL` 公网地址，桌面版无公网入口，该场景会得到明确的中文报错；文生视频/图片等其余能力不受影响。

---

### 🏭 服务器部署方式

```bash
# 1. 构建前端
cd frontend && npm run generate

# 2. 复制构建产物（generate 产物在 frontend/.output/public，后端只读取 frontend/dist，缺此步 API 正常但页面 404）
cp -r .output/public dist && cd ..

# 3. 启动后端
cd backend && npm start
```

需要上传到服务器的文件：

```
backend/                    # 后端源码 + node_modules
backend/workspace/skills/   # Agent 技能文件
frontend/dist/              # 前端构建产物
data/                       # 数据目录（首次运行自动创建）
```

#### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 参考视频/音频上传最大 50MB
    client_max_body_size 100m;

    # 生成的图片/视频直连磁盘，不经过 Node：sendfile 零拷贝 + 长缓存
    # （产物按 uuid 命名、内容不变，可安全 immutable 缓存）
    location /static/ {
        alias /path/to/huobao-drama/data/static/;
        sendfile on;
        tcp_nopush on;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://localhost:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> 媒体加载优化：生成图片时后端会自动产出 400px 缩略图（`*_thumb.webp`）供列表页加载，视频会抽取海报帧（`*_poster.jpg`）作为封面，前端仅在点开大图/播放时才加载原文件。历史存量文件可在 `backend/` 下执行 `npm run backfill-artwork` 一次性补齐。

---

## 🎨 技术栈

### 后端

- **运行时**: Node.js 20+
- **Web 框架**: Hono
- **ORM**: Drizzle ORM + better-sqlite3（WAL 模式）
- **AI Agent**: Mastra + AI SDK (OpenAI compatible)
- **视频处理**: FFmpeg (fluent-ffmpeg + 内置二进制)
- **图片处理**: Sharp

### 桌面端

- **壳**: Electron（utilityProcess 承载后端，BrowserWindow 同源加载）
- **打包**: esbuild（后端单文件 bundle）+ electron-builder（dmg，arm64/x64）

### 前端

- **框架**: Nuxt 3 (SPA 模式)
- **语言**: Vue 3 + TypeScript
- **路由**: 文件路由 (Vue Router 4)
- **样式**: 纯 CSS + CSS Variables
- **图标**: Lucide Vue

---

## 📝 常见问题

### Q: 桌面版数据存在哪里？

A: `~/Library/Application Support/HuobaoDrama/data/`（SQLite 数据库 + 生成的图片/视频），技能在线编辑的副本在同级 `workspace/` 目录。开发模式下则使用仓库 `data/` 目录。

### Q: 旧版 MySQL 数据怎么迁移到 SQLite？

A: 保持 MySQL 可连接（环境变量或 `backend/.env`），执行 `cd backend && npx tsx scripts/import-mysql-to-sqlite.ts`，脚本会自动建表、逐表导入并校验行数（目标库非空需加 `--force`，写入前自动备份）。

### Q: FFmpeg 未安装或找不到？

A: 无需安装。项目内置 `ffmpeg-static` / `ffprobe-static` 二进制（桌面版随包携带）。系统 `PATH` 中的 FFmpeg 也不会冲突，也可通过 `FFMPEG_BIN`/`FFPROBE_BIN` 显式指定。

### Q: 页面顶部提示「尚未配置模型」？

A: 这是正常的首次部署引导。前往「设置」页，用「火宝快捷配置」粘贴 API Key 一键写入，或通过「手动模板」按厂商添加。文本、图片、视频三类均有启用中的配置后横幅自动消失。

### Q: 前端无法连接后端 API？

A: 检查后端是否启动，端口是否正确。开发模式下前端代理配置在 `frontend/nuxt.config.ts`。

### Q: 数据库表未创建？

A: 后端会在首次启动时自动创建所有表，检查日志确认初始化是否成功。

---

## 📋 更新日志

### v4.0.0 (2026-08)

#### 🖥️ 桌面应用 + 数据库迁移

- Electron 桌面版（macOS dmg，arm64/x64 双架构）
  - 双击安装、开箱即用：自动选择端口、单实例锁、崩溃隔离的后端子进程
  - 用户数据隔离：SQLite 库 / 生成媒体 / 技能副本均存放于 userData 目录
  - 内置 FFmpeg/FFprobe 随包分发；workspace 技能模板首启动拷贝、升级只补缺不覆盖
- 数据库从 MySQL 完全迁移到 SQLite（better-sqlite3 + WAL）
  - 业务代码零改动（Drizzle 查询层天然可移植），DDL 幂等重放
  - 新增一次性导入脚本 `import-mysql-to-sqlite.ts`（逐表行数校验 + 自动备份）
- 后端 esbuild 单文件打包（externals：sharp/better-sqlite3/ffmpeg 二进制包）
- 移除 Docker/MySQL 部署方式（git 历史可找回）

### v3.0.0 (2026-08)

#### 🚀 部署与体验优化

- Docker 部署就绪改造
  - MySQL / 应用健康检查，应用等待数据库就绪后启动
  - 数据库初始化增加重试，容器编排下首次部署零人工干预
  - 移除系统 FFmpeg 依赖，全面使用内置二进制
  - Agent skills 目录 volume 持久化（设置页在线编辑不丢失）
  - 新增 `docker/init.sql` 及导出脚本（DBA 审核 / 预建表）
- 首次使用引导
  - 未配置 AI 服务时全站顶部横幅提示并引导至设置页
  - 设置页新增「火宝快捷配置」：一个 Key 写入文本/图片/视频三条推荐配置
  - 未配置模型的报错中文化并指引设置页
- 视频模型默认调整为 Seedance 2.0 Fast
- 厂商收敛：仅保留 OpenAI / Gemini / 火山引擎
- 工作台：任务列表抽屉、流水线大环节状态、选择性拼接（拼接前校验视频文件存在）
- 素材库改版、@提及优化、剧集列表重构

### v2.0.0 (2026-04)

#### 🚀 重大更新

- 项目全面迁移至 TypeScript 技术栈
  - 后端：Hono + Drizzle ORM + mysql2
  - 前端：Nuxt 3 + Vue 3
  - AI Agent：Mastra 框架
- 重做单集工作台 UI 和生产流程
  - 更紧凑的控制台布局
  - 重做分镜编辑区
  - 重做镜头图、视频、合成、导出界面
- 新增 Docker 部署支持，前后端合并为单镜像
- 增加运行时 Skill 加载机制
- 扩展多厂商媒体 Adapter
  - 图片：OpenAI、Gemini、火山引擎、阿里
  - 视频：火山引擎/Seedance、Vidu、阿里
- 优化本地文件处理与参考图按需转码

### v1.0.4 (2026-01-27)

- 引入本地存储策略，规避外部资源链接失效
- Base64 参考图嵌入式传输
- 修复镜头切换状态重置问题
- 添加场景迁移至章节

### v1.0.3 (2026-01-16)

- 优化数据库并发访问性能
- Docker 跨平台支持 host.docker.internal

### v1.0.2 (2026-01-14)

- 修复视频生成 API 响应解析问题
- 添加 OpenAI Sora 视频端点配置
- 优化错误处理和日志输出

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

常用检查命令：

```bash
cd backend && npm run typecheck
cd ../frontend && npm run build
```

---

## ☕ 捐赠支持

如果这个项目对你有帮助，欢迎扫码请作者喝杯咖啡 ☕，你的支持是持续更新的动力！

<div align="center">
  <img src="donate.png" alt="支付宝捐赠二维码" width="240" />
</div>

---

> _"让 AI 帮我们做更有创造力的事"_

## 🔗 友情链接

本项目已获得 [LINUX DO](https://linux.do/) 社区链接认可。

- [LINUX DO](https://linux.do/) — 真正的开源精神，共建共享的技术社区

---
