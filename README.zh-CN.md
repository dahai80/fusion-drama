# 🎬 Fusion Drama - AI 短剧生成平台

<div align="center">

**基于 TypeScript 全栈的 AI 短剧自动化生产平台**

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/fusion-drama/fusion-drama?style=flat&logo=github&label=Release)](https://github.com/fusion-drama/fusion-drama/releases)

[English](README.md) | **简体中文** | [日本語](README.ja.md) | [한국어](README.ko.md)

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [图文教程](#-图文教程) • [桌面版](#-桌面应用推荐) • [部署指南](#-部署指南)

<h2>🔑 <a href="https://bench.dpdns.org">获取 Fusion API Key 👉 立即查看</a></h2>

**文本 · 图片 · 视频全部 AI 能力，一个 Key 即可开通**

部署完成后在「设置 → Fuse快捷配置」粘贴 Key，一键写入三条推荐配置，开箱即用


</div>

---

## 📖 项目简介

Fusion Drama 是一个基于 AI 的短剧自动化生产平台，实现从剧本生成、角色设计、分镜制作到视频合成的全流程自动化。

### 🎯 核心价值

- **🤖 AI 驱动**：使用大语言模型解析剧本，提取角色、场景和分镜信息
- **🎨 智能创作**：AI 绘图生成角色形象和场景背景
- **📹 视频生成**：基于文生视频和图生视频模型自动生成分镜视频
- **🔄 工作流**：完整的短剧制作工作流，从创意到成片一站式完成
- **🏠 本地优先**：搭配 Apple Silicon 自部署 [fusion-mlx](https://github.com/dahai80/fusion-mlx)，文/图/视频生成全离线（LTX-2.5 / MiniMax-H3 / Wan2.2）——无云端 Key、数据不出机；FFmpeg 拼接与导出始终内置

### 🛠️ 技术架构

```
frontend/   — Nuxt 3 + Vue 3 + TypeScript (纯 CSS，无 UI 框架)
backend/    — Hono + Drizzle ORM + Mastra AI Agents + better-sqlite3
backend/workspace/skills/ — Agent 技能定义 (SKILL.md，支持界面在线编辑)
desktop/    — Electron 桌面版（主进程 + esbuild 打包 + electron-builder 出 dmg/exe）
data/       — 生成资源文件与 SQLite 数据库
```

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

### 🌐 多语言界面

界面内置 **中文 / English / 日本語 / 한국어** 四种语言，并可全局设置 AI 生成内容的语言。

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
| `SQLITE_PATH` | `<仓库根>/data/fusion.sqlite3` | SQLite 数据库文件位置 |
| `PORT` | `5679` | 后端服务端口 |
| `STORAGE_PATH` | `<仓库根>/data/static` | 生成文件存储目录 |
| `FUSION_DATA_DIR` | — | 桌面版由 Electron 主进程注入（userData 数据根） |
| `WORKSPACE_PATH` | `backend/workspace` | Agent 技能/提示词目录（桌面版指向 userData 可写副本） |
| `FRONTEND_DIST` | `frontend/dist` | 前端静态产物目录 |
| `FFMPEG_BIN` / `FFPROBE_BIN` | npm 内置二进制 | 自定义 ffmpeg/ffprobe 可执行文件路径 |
| `PUBLIC_BASE_URL` | — | Seedance 引用本地参考资源时所需的公网地址（服务器部署用） |
| `FUSION_API_TOKEN` | — | 服务器模式 API 令牌。**必填（≥32 字符）**：令牌过弱时服务器拒绝启动，除非设置 `FUSION_BIND_HOST`。前端以 `Bearer` 方式携带（设置页 → 通用中配置一次，存 localStorage） |
| `FUSION_SHELL_GATEWAY` | — | Union Web 接入：fusion-web-shell 网关地址（如 `http://localhost:11432`）。设置后启动时把 `web/manifest.json` 注册到宿主注册中心（幂等、best-effort）。带 `?embedded=1` 打开页面会隐藏自有头部导航，供 Shell 内嵌 |

> **说明**：AI 服务的 API Key、Base URL 和模型参数全部在 Web 界面的「设置」页配置并入库，不在配置文件/环境变量中维护。

### 📥 安装依赖

```bash
# 克隆项目
git clone https://github.com/fusion-drama/fusion-drama.git
cd fusion-drama

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

内置 SQLite（`better-sqlite3` + WAL 模式），数据库表在首次启动时自动创建（幂等重放 DDL 与种子数据），默认文件位于 `data/fusion.sqlite3`，可通过 `SQLITE_PATH` 重定向。桌面版数据存放在用户数据目录（`~/Library/Application Support/FusionDrama/data/`）。

数据库结构升级通过版本化迁移（`PRAGMA user_version`）执行，每次 DDL 前自动 `VACUUM INTO` 快照备份到 `data/backups/`（保留最近 10 份）。服务器/Docker 部署可在网页端手动备份（设置 → 存储 → 立即备份）。

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
2. 在「Fuse快捷配置」中粘贴 Fusion API Key（[前往 bench.dpdns.org 获取](https://bench.dpdns.org)），一键写入文本、图片、视频三条推荐配置
3. 或使用「手动模板」按厂商逐个添加，支持连通性测试

配置完成横幅自动消失，即可开始创建剧集生产。

---

## 📖 图文教程

从小说到成片的完整制作流程。左侧进度栏始终标示当前所处阶段，跟着走即可。

### 第 1 步 · 创建项目

首页点「新建项目」，填写剧名并选择**画面比例**（横屏 16:9 / 竖屏 9:16，创建后不可改）与**画面风格**（3D / 真实感等，影响全局生图提示词）。

项目卡片即项目列表，随时点入续作：

### 第 2 步 · 配置 AI 服务（首次）

设置页「Fuse快捷配置」粘贴 API Key 一键写入三条推荐配置；或用「手动模板」按厂商自选模型（顶栏可随时切换当前模型，见第 5 步）。

### 第 3 步 · 剧本阶段

进入剧集工作台，先粘贴**原始内容**（小说文本），再点「AI 改写」生成拍摄剧本——按集拆分、标注场景与角色，改写时可换文本模型、调语气。满意后「保存并进入制作」。

### 第 4 步 · 资产制作

对剧本执行**提取**，自动获得角色 / 场景 / 道具清单；逐个点「生成形象」产出一致性参考图（也可批量）。生成的资产图会在后续生视频时作为参考素材注入。

### 第 5 步 · 分镜与视频

「视频制作」页先**拆分分镜**（AI 按镜头节奏切分并生成视频提示词），然后：

- 顶栏选择本次使用的**视频模型**（Seedance / Wan 3.0 / MiniMax…），分辨率与时长档位随之联动
- 右侧检查 / 微调每个分镜的提示词（`@角色名` 自动映射参考图）
- 点「批量生成视频」发起任务，失败任务可一键「重试失败」

### 第 6 步 · 拼接导出

勾选镜头（悬停可预览单个镜头视频），点「开始拼接」，FFmpeg 自动合成为完整剧集成片，支持在线播放与下载。完成后点「标记完成」，左侧进度栏点亮。

剧集列表随时展示各集制作状态，点「进入制作」继续未完成的集：

---

## 📦 部署指南

### 🖥️ 桌面应用（推荐）

### 🖥️ 桌面应用（推荐）

尚未发布预编译安装包，请从源码构建：

```bash
# 一键打包（前端 generate → 后端 esbuild → electron-builder）
npm run dist        # macOS dmg（arm64 + Intel）
npm run dist:win    # Windows NSIS 安装器（win-x64，可在 macOS 上交叉打包）

# 产物
# desktop/release/FusionDrama-<版本>-arm64.dmg        (Apple Silicon)
# desktop/release/FusionDrama-<版本>.dmg              (Intel)
# desktop/release/FusionDrama Setup <版本>.exe        (Windows)
```

双击安装、开箱即用的桌面版（macOS + Windows）：数据库（SQLite）、生成的媒体文件、Agent 技能全部存放在用户数据目录，卸载应用不影响数据。

安装说明：

- macOS 未签名包首次打开可能提示「App 已损坏，无法打开」（Gatekeeper 隔离属性，并非文件损坏）。修复：终端执行 `sudo xattr -cr /Applications/FusionDrama.app`（一次即可，之后正常启动）
- Windows 未签名包 SmartScreen 会提示「更多信息 → 仍要运行」
- 用户数据目录：`~/Library/Application Support/FusionDrama/`（数据库、生成的媒体、技能在线编辑的副本）
- 内置 FFmpeg/FFprobe 二进制，无需系统安装
- Electron 锁定 37.x：better-sqlite3 的 win32 预编译最高覆盖到该版本的 ABI（交叉打包免编译的关键）
- 应用内点击外部链接（如「前往 bench.dpdns.org 获取 Key」）直接用系统浏览器打开

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

已安装的客户端会在启动后自动检查清单（也可在「设置 → 关于更新」手动检查），发现新版即提示下载安装。自定义清单地址：`FUSION_UPDATE_FEED` 环境变量。

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
        alias /path/to/fusion-drama/data/static/;
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

### 🐳 Docker 部署（含应用内更新）

**方式一：预构建镜像（免克隆、免构建）**：多架构镜像（`linux/amd64` + `linux/arm64`），x86 服务器与 ARM 设备自动匹配

```bash
docker pull fusion/fusion-drama:4.0.0

docker run -d \
  --name fusion-drama \
  -p 5679:5679 \
  -v fusion-data:/app/data \
  --restart unless-stopped \
  fusion/fusion-drama:4.0.0
```

**方式二：docker compose（源码构建 + Watchtower 应用内更新）**：根目录提供一体化 `Dockerfile`（前端 generate + 后端依赖/运行时三阶段，后端与服务器部署一致走 tsx）与 `docker-compose.yml`（应用 + Watchtower）：

```bash
# 1. 配置环境（Watchtower 令牌，app 与 watchtower 两侧必须一致）
cp .env.example .env   # 修改 WATCHTOWER_TOKEN

# 2. 构建并启动（发布时注入版本号，供「关于更新」比对）
FUSION_VERSION=4.0.0 docker compose up -d --build

# 3. 访问 http://localhost:5679
```

- **数据持久化**：命名卷 `fusion-data` 挂载 `/app/data`（SQLite + 生成的图片/视频 + workspace/skills，更新镜像不丢数据）
- **应用内更新**：compose 自带 [Watchtower](https://containrrr.dev/watchtower/) sidecar（`--label-enable` 只更新标记容器，`--cleanup` 清旧镜像，每天自检一次）。设置页「关于更新」可检查新版本并「立即更新」——后端经 Watchtower HTTP API 触发，拉新镜像重建容器，几分钟后刷新页面即可
- **手动模式**：`docker-compose.yml` 中删除 app 的 `FUSION_WATCHTOWER_*` 两个环境变量（或整个 watchtower 服务）后，「关于更新」退化为新版本提示 + 手动命令 `docker compose pull && docker compose up -d`
- **发布镜像**：`docker buildx build --platform linux/amd64,linux/arm64 --build-arg FUSION_VERSION=x.y.z -t fusion/fusion-drama:x.y.z -t fusion/fusion-drama:latest --push .`，版本清单与桌面版共用 GitHub Releases 的 `latest.json`（可用 `FUSION_UPDATE_FEED` 覆盖）

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
- **打包**: esbuild（后端单文件 bundle）+ electron-builder（dmg arm64/x64，NSIS win-x64）

### 前端

- **框架**: Nuxt 3 (SPA 模式)
- **语言**: Vue 3 + TypeScript
- **路由**: 文件路由 (Vue Router 4)
- **样式**: 纯 CSS + CSS Variables
- **图标**: Lucide Vue
- **国际化**: vue-i18n（中文 / English / 日本語 / 한국어）

---

## 📝 常见问题

### Q: 可以完全本地生成视频、不接任何云 API 吗？

A: 可以。视频服务选 **fusion**（本地）并指向自托管的 [fusion-mlx](https://github.com/dahai80/fusion-mlx) 实例（OpenAI 兼容 API，`localhost:11434`）。Apple Silicon 上本地运行 LTX-2.5（主力）、MiniMax-H3（画质首选，Turbo LoRA 4 步）与 Wan2.2-TI2V-5B（中文原生 prompt）；文本、图片模型也可由同一实例提供。

### Q: 桌面版数据存在哪里？

A: `~/Library/Application Support/FusionDrama/data/`（SQLite 数据库 + 生成的图片/视频），技能在线编辑的副本在同级 `workspace/` 目录。开发模式下则使用仓库 `data/` 目录。

### Q: 旧版 MySQL 数据怎么迁移到 SQLite？

A: 保持 MySQL 可连接（环境变量或 `backend/.env`），执行 `cd backend && npx tsx scripts/import-mysql-to-sqlite.ts`，脚本会自动建表、逐表导入并校验行数（目标库非空需加 `--force`，写入前自动备份）。

### Q: FFmpeg 未安装或找不到？

A: 无需安装。项目内置 `ffmpeg-static` / `ffprobe-static` 二进制（桌面版随包携带）。系统 `PATH` 中的 FFmpeg 也不会冲突，也可通过 `FFMPEG_BIN`/`FFPROBE_BIN` 显式指定。

### Q: 页面顶部提示「尚未配置模型」？

A: 这是正常的首次部署引导。前往「设置」页，用「Fuse快捷配置」粘贴 API Key 一键写入，或通过「手动模板」按厂商添加。文本、图片、视频三类均有启用中的配置后横幅自动消失。

### Q: 前端无法连接后端 API？

A: 检查后端是否启动，端口是否正确。开发模式下前端代理配置在 `frontend/nuxt.config.ts`。

### Q: 数据库表未创建？

A: 后端会在首次启动时自动创建所有表，检查日志确认初始化是否成功。

---

## 📋 更新日志

### v1.0.0 (2026-10)

首个公开版本。项目于 2026 年 10 月启动——此前没有已发布的版本。

- 完整制作管线：小说 → 剧本改写 → 资产提取 → 分镜拆解 → 视频生成 → FFmpeg 拼接导出
- 多厂商 AI：文本/图片走 OpenAI 与 Gemini；视频支持 Seedance 2.0、Wan 3.0、MiniMax（云）以及 **fusion** 本地服务（自托管 [fusion-mlx](https://github.com/dahai80/fusion-mlx)，Apple Silicon）
- 本地视频模型路由：LTX-2.5（主力，联合 A/V）、MiniMax-H3 33B（画质首选，Turbo LoRA 4 步）、Wan2.2-TI2V-5B（中文原生 prompt）
- GPU 串行执行队列统一调度 GPU 密集任务；图片任务后主动卸载 FLUX（避免多模型并发 decode 触发 Metal 崩溃）
- Kokoro TTS 对白配音混入生成视频
- 未设置参考图时自动以分镜图作为 I2V 首帧
- 视频任务以分镜时长为准；分镜拆解直连 LLM 并加对白时长预算
- 桌面应用（Electron）：macOS/Windows 打包、应用内更新器、用户数据隔离（尚未发布预编译安装包，可从源码构建）
- Docker 服务器部署，支持应用内一键更新（watchtower）
- 四语言界面（中文 / English / 日本語 / 한국어）

---

## 📄 许可证

本项目采用 **[Apache License 2.0](LICENSE)** 许可证。

- ✅ 允许个人及商业使用、修改与分发
- ✅ 附带专利授权
- ℹ️ 第三方模型权重（LTX-2.5、MiniMax-H3、Wan2.2、FLUX.1 等）各有独立许可证——商用部署前请逐项确认

许可证全文见 [LICENSE](LICENSE)。

- 📦 第三方组件及其许可证（含通过 ffmpeg-static 打包的 GPL FFmpeg）：见 [NOTICE](NOTICE)
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

> _"让 AI 帮我们做更有创造力的事"_

## 🔗 相关链接

- [Fuse 短剧（Fusion Drama）](https://github.com/dahai80/fusion-drama) — AI 短剧一站式制作工具（本项目）
- [fusion-mlx](https://github.com/dahai80/fusion-mlx) — 自托管 Apple Silicon 推理引擎，为本地 fusion 视频服务提供算力

---

## 🙏 致谢

本项目参考并受益于众多开源项目，在此致谢：

- [Mastra](https://github.com/mastra-ai/mastra)（AI Agent 框架）、[Hono](https://github.com/honojs/hono)（Web 框架）、[Nuxt 3](https://github.com/nuxt/nuxt)（前端框架）
- [LTX-Video](https://github.com/Lightricks/LTX-Video)（Lightricks）、[MiniMax-H3](https://github.com/MiniMaxAI/MiniMax-H3)（MiniMax）、[Wan2.2](https://github.com/Wan-Video/Wan2.2)（阿里）、[FLUX.1](https://github.com/black-forest-labs/flux)（Black Forest Labs）—— 开放视频/图像模型生态
- [LINUX DO](https://linux.do/) — 真正的开源精神，共建共享的技术社区

---
