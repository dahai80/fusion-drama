# 🎬 Huobao Drama - AI短剧生成平台

<div align="center">

**基于 Go + Vue3 的全栈AI短剧自动化生产平台**

[![Go Version](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[功能特性](#功能特性) • [快速开始](#快速开始) • [部署指南](#部署指南)

</div>

---

## 📖 项目简介

Huobao Drama 是一个基于AI的短剧自动化生产平台，实现从剧本生成、角色设计、分镜制作到视频合成的全流程自动化。

### 🎯 核心价值

- **🤖 AI驱动**：使用大语言模型自动生成剧本、角色设定和分镜脚本
- **🎨 智能创作**：AI绘图生成角色形象和场景背景
- **📹 视频生成**：基于文生视频模型自动生成分镜视频
- **⚡ 批量处理**：支持批量生成和异步任务处理
- **🔄 工作流**：完整的短剧制作工作流，从创意到成片一站式完成

### 🛠️ 技术架构

采用**DDD领域驱动设计**，清晰分层：

```
├── API层 (Gin HTTP)
├── 应用服务层 (Business Logic)
├── 领域层 (Domain Models)
└── 基础设施层 (Database, External Services)
```

---

## ✨ 功能特性

### 📝 剧本创作
- ✅ AI自动生成剧本大纲
- ✅ 智能角色设定和关系图谱
- ✅ 分集剧情自动拆分
- ✅ 剧本编辑和版本管理

### 🎭 角色管理
- ✅ AI生成角色形象
- ✅ 角色库复用
- ✅ 批量角色生成
- ✅ 角色图片上传和管理

### 🎬 分镜制作
- ✅ 自动生成分镜脚本
- ✅ 场景描述和镜头设计
- ✅ 分镜图片生成（文生图）
- ✅ 帧类型选择（首帧/关键帧/尾帧/分镜板）

### 🎥 视频生成
- ✅ 图生视频自动生成
- ✅ 视频合成和剪辑
- ✅ 转场效果
- ✅ 批量视频处理

### 📦 资源管理
- ✅ 素材库统一管理
- ✅ 本地存储支持
- ✅ 资源导入导出
- ✅ 任务进度追踪

---

## 🏗️ 项目结构

```
huobao-drama/
├── api/                           # API 层 - HTTP 接口
│   ├── handlers/                  # 请求处理器 (16个)
│   │   ├── ai_config.go          # AI服务配置
│   │   ├── drama.go              # 剧本管理
│   │   ├── scene.go              # 场景管理
│   │   ├── storyboard.go         # 分镜管理
│   │   ├── character_library.go  # 角色库管理
│   │   ├── image_generation.go   # 图片生成
│   │   ├── video_generation.go   # 视频生成
│   │   ├── video_merge.go        # 视频合成
│   │   ├── script_generation.go  # 剧本生成
│   │   ├── frame_prompt.go       # 分镜提示词
│   │   ├── asset.go              # 资源管理
│   │   ├── task.go               # 任务管理
│   │   └── upload.go             # 文件上传
│   ├── middlewares/               # 中间件
│   │   ├── cors.go               # CORS 跨域
│   │   ├── logger.go             # 日志记录
│   │   └── ratelimit.go          # 限流控制
│   └── routes/                    # 路由注册
│       └── routes.go
│
├── application/                   # 应用服务层 - 业务逻辑
│   └── services/                  # 业务服务 (15个)
│       ├── ai_service.go         # AI服务管理
│       ├── drama_service.go      # 剧本业务
│       ├── storyboard_service.go # 分镜业务
│       ├── character_library_service.go  # 角色库
│       ├── image_generation_service.go   # 图片生成
│       ├── video_generation_service.go   # 视频生成
│       ├── video_merge_service.go        # 视频合成
│       ├── script_generation_service.go  # 剧本生成
│       ├── frame_prompt_service.go       # 分镜提示词
│       ├── storyboard_composition_service.go # 分镜合成
│       ├── resource_transfer_service.go  # 资源转移
│       ├── asset_service.go      # 资源管理
│       ├── task_service.go       # 任务调度
│       └── upload_service.go     # 上传处理
│
├── domain/                        # 领域层 - 数据模型
│   └── models/                    # 领域模型 (10个)
│       ├── drama.go              # 剧本模型 (Drama, Episode, Character, Scene)
│       ├── frame_prompt.go       # 分镜提示词
│       ├── image_generation.go   # 图片生成任务
│       ├── video_generation.go   # 视频生成任务
│       ├── video_merge.go        # 视频合成任务
│       ├── character_library.go  # 角色库
│       ├── asset.go              # 资源模型
│       ├── task.go               # 异步任务
│       ├── timeline.go           # 时间线
│       └── ai_config.go          # AI配置
│
├── infrastructure/                # 基础设施层
│   ├── database/                 # 数据库
│   │   ├── database.go           # 连接管理
│   │   └── repositories/         # 数据仓储
│   ├── external/                 # 外部服务
│   │   ├── ffmpeg/               # FFmpeg 视频处理
│   │   ├── midjourney/           # Midjourney 图片生成
│   │   └── openai/               # OpenAI 服务
│   ├── scheduler/                # 调度器
│   │   └── resource_transfer_scheduler.go  # 资源转移调度
│   └── storage/                  # 存储
│       └── local_storage.go      # 本地文件存储
│
├── pkg/                          # 公共包 - 工具库
│   ├── ai/                       # AI 客户端
│   │   └── openai_client.go     # OpenAI 封装
│   ├── config/                   # 配置管理
│   │   └── config.go
│   ├── image/                    # 图片处理
│   │   └── image_client.go      # 图片生成客户端
│   ├── logger/                   # 日志工具
│   │   └── logger.go
│   ├── response/                 # HTTP 响应
│   │   └── response.go
│   ├── utils/                    # 工具函数
│   │   └── json_parser.go
│   └── video/                    # 视频处理
│       ├── video_client.go       # 视频生成客户端
│       ├── minimax_client.go     # MiniMax 视频生成
│       ├── openai_sora_client.go # OpenAI Sora
│       └── volces_ark_client.go  # 火山引擎视频生成
│
├── web/                          # 前端项目 (Vue 3 + TypeScript)
│   ├── src/
│   │   ├── api/                  # API 调用 (9个接口模块)
│   │   ├── assets/               # 静态资源
│   │   ├── components/           # Vue 组件
│   │   ├── router/               # 路由配置
│   │   ├── stores/               # Pinia 状态管理
│   │   ├── types/                # TypeScript 类型定义 (8个)
│   │   ├── utils/                # 工具函数
│   │   ├── views/                # 页面视图 (28个页面)
│   │   ├── App.vue               # 根组件
│   │   └── main.ts               # 入口文件
│   ├── public/                   # 公共资源
│   ├── index.html                # HTML 模板
│   ├── package.json              # 依赖配置
│   ├── vite.config.ts            # Vite 配置
│   ├── tailwind.config.js        # TailwindCSS 配置
│   └── tsconfig.json             # TypeScript 配置
│
├── configs/                      # 配置文件
│   └── config.example.yaml       # 配置模板
├── data/                         # 运行时数据 (gitignore)
│   ├── drama_generator.db        # SQLite 数据库
│   └── storage/                  # 文件存储
├── migrations/                   # 数据库迁移
│   └── init.sql
├── main.go                       # 程序入口
├── go.mod                        # Go 模块定义
├── go.sum                        # 依赖版本锁定
└── README.md                     # 项目文档
```

---

## 🚀 快速开始

### 📋 环境要求

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| **Go** | 1.23+ | 后端运行环境 |
| **Node.js** | 18+ | 前端构建环境 |
| **npm** | 9+ | 包管理工具 |
| **FFmpeg** | 4.0+ | 视频处理（**必需**） |
| **SQLite** | 3.x | 数据库（已内置） |

#### 安装 FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
从 [FFmpeg官网](https://ffmpeg.org/download.html) 下载并配置环境变量

验证安装：
```bash
ffmpeg -version
```

### ⚙️ 配置文件

复制并编辑配置文件：

```bash
cp configs/config.example.yaml configs/config.yaml
vim configs/config.yaml
```

配置文件格式（`configs/config.yaml`）：

```yaml
app:
  name: "Huobao Drama API"
  version: "1.0.0"
  debug: true  # 开发环境设为true，生产环境设为false

server:
  port: 5678
  host: "0.0.0.0"
  cors_origins:
    - "http://localhost:3012"
  read_timeout: 600
  write_timeout: 600

database:
  type: "sqlite"
  path: "./data/drama_generator.db"
  max_idle: 10
  max_open: 100

storage:
  type: "local"
  local_path: "./data/storage"
  base_url: "http://localhost:5678/static"

ai:
  default_text_provider: "openai"
  default_image_provider: "openai"
  default_video_provider: "doubao"
```

**重要配置项：**
- `app.debug`: 调试模式开关（开发环境建议设为true）
- `server.port`: 服务运行端口
- `server.cors_origins`: 允许跨域访问的前端地址
- `database.path`: SQLite数据库文件路径
- `storage.local_path`: 本地文件存储路径
- `storage.base_url`: 静态资源访问URL
- `ai.default_*_provider`: AI服务提供商配置（在Web界面中配置具体的API Key）

### 📥 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd huobao-drama

# 安装Go依赖
go mod download

# 安装前端依赖
cd web
npm install
cd ..
```

### 🎯 启动项目

#### 方式一：开发模式（推荐）

**前后端分离，支持热重载**

```bash
# 终端1：启动后端服务
go run main.go

# 终端2：启动前端开发服务器
cd web
npm run dev
```

- 前端地址: `http://localhost:3012`
- 后端API: `http://localhost:5678/api/v1`
- 前端自动代理API请求到后端

#### 方式二：单服务模式

**后端同时提供API和前端静态文件**

```bash
# 1. 构建前端
cd web
npm run build
cd ..

# 2. 启动服务
go run main.go
```

访问: `http://localhost:5678`

### 🗄️ 数据库初始化

数据库表会在首次启动时自动创建（使用GORM AutoMigrate），无需手动迁移。

---

## 📦 部署指南

### 🏭 生产环境部署

#### 1. 编译构建

```bash
# 1. 构建前端
cd web
npm run build
cd ..

# 2. 编译后端
go build -o huobao-drama .
```

生成文件：
- `huobao-drama` - 后端可执行文件
- `web/dist/` - 前端静态文件（已嵌入后端）

#### 2. 准备部署文件

需要上传到服务器的文件：
```
huobao-drama            # 后端可执行文件
configs/config.yaml     # 配置文件
data/                   # 数据目录（可选，首次运行自动创建）
```

#### 3. 服务器配置

```bash
# 上传文件到服务器
scp huobao-drama user@server:/opt/huobao-drama/
scp configs/config.yaml user@server:/opt/huobao-drama/configs/

# SSH登录服务器
ssh user@server

# 修改配置文件
cd /opt/huobao-drama
vim configs/config.yaml
# 设置mode为production
# 配置域名和存储路径

# 赋予执行权限
chmod +x huobao-drama

# 启动服务
./huobao-drama
```

#### 4. 使用 systemd 管理服务

创建服务文件 `/etc/systemd/system/huobao-drama.service`:

```ini
[Unit]
Description=Huobao Drama Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/huobao-drama
ExecStart=/opt/huobao-drama/huobao-drama
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable huobao-drama
sudo systemctl start huobao-drama
sudo systemctl status huobao-drama
```

#### 5. Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 静态文件直接访问
    location /static/ {
        alias /opt/huobao-drama/data/storage/;
    }
}
```

---

## 🔧 开发指南

### 添加新功能

#### 1. 添加API接口

```bash
# 创建Handler
vim api/handlers/your_handler.go

# 注册路由
vim api/routes/routes.go
```

示例：
```go
// api/handlers/your_handler.go
func (h *YourHandler) YourMethod(c *gin.Context) {
    // 处理逻辑
    response.Success(c, data)
}

// api/routes/routes.go
your := api.Group("/your")
{
    your.GET("", yourHandler.List)
    your.POST("", yourHandler.Create)
}
```

#### 2. 添加业务服务

```go
// application/services/your_service.go
type YourService struct {
    db  *gorm.DB
    log *logger.Logger
}

func NewYourService(db *gorm.DB, log *logger.Logger) *YourService {
    return &YourService{db: db, log: log}
}

func (s *YourService) YourMethod() error {
    // 业务逻辑
    return nil
}
```

#### 3. 添加前端页面

```bash
# 创建页面组件
vim web/src/views/YourPage.vue

# 注册路由
vim web/src/router/index.ts

# 添加API调用
vim web/src/api/your-api.ts
```

### 调试技巧

**后端调试：**
```bash
# 启用详细日志
export LOG_LEVEL=debug
go run main.go

# 使用dlv调试器
dlv debug main.go
```

**前端调试：**
```bash
cd web
npm run dev
# 打开浏览器 DevTools
```

**数据库查询：**
```bash
sqlite3 data/drama_generator.db
.tables
.schema dramas
SELECT * FROM dramas;
```

---

## 🛠️ 常用命令

```bash
# 开发模式
go run main.go                      # 启动后端服务
cd web && npm run dev               # 启动前端开发服务器

# 编译构建
cd web && npm run build && cd ..    # 构建前端
go build -o huobao-drama .          # 编译后端

# 依赖管理
go mod download                     # 下载Go依赖
go mod tidy                         # 清理Go依赖
cd web && npm install && cd ..      # 安装前端依赖

# 代码检查
go fmt ./...                        # 格式化代码
go vet ./...                        # 代码检查
cd web && npm run lint && cd ..     # 前端代码检查

# 清理
go clean                            # 清理Go构建缓存
rm -rf web/dist                     # 清理前端构建产物
rm -f huobao-drama                  # 删除可执行文件

# 测试
go test ./...                       # 运行Go测试
cd web && npm run test && cd ..     # 运行前端测试
```

---

## 🎨 技术栈

### 后端技术
- **语言**: Go 1.23+
- **Web框架**: Gin 1.9+
- **ORM**: GORM
- **数据库**: SQLite
- **日志**: Zap
- **视频处理**: FFmpeg
- **AI服务**: 豆包 Doubao API

### 前端技术
- **框架**: Vue 3.4+
- **语言**: TypeScript 5+
- **构建工具**: Vite 5
- **UI组件**: Element Plus
- **CSS框架**: TailwindCSS
- **状态管理**: Pinia
- **路由**: Vue Router 4

### 开发工具
- **包管理**: Go Modules, npm
- **代码规范**: ESLint, Prettier
- **版本控制**: Git

---

## 📝 常见问题

### Q: FFmpeg未安装或找不到？
A: 确保FFmpeg已安装并在PATH环境变量中。运行 `ffmpeg -version` 验证。

### Q: 前端无法连接后端API？
A: 检查后端是否启动，端口是否正确。开发模式下前端代理配置在 `web/vite.config.ts`。

### Q: 数据库表未创建？
A: GORM会在首次启动时自动创建表，检查日志确认迁移是否成功。

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📧 联系方式
## 项目交流群
![项目交流群](drama.png)
- 提交 [Issue](../../issues)
- 发送邮件至项目维护者

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个Star！**

Made with ❤️ by Huobao Team

</div>
