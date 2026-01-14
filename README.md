# 🎬 Huobao Drama - AI短剧生成平台

<div align="center">

**基于 Go + Vue3 的全栈AI短剧自动化生产平台**


[![Go Version](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[功能特性](#功能特性) • [快速开始](#快速开始) • [部署指南](#部署指南)

</div>

---

## 📖 项目简介 / About

Huobao Drama 是一个基于AI的短剧自动化生产平台，实现从剧本生成、角色设计、分镜制作到视频合成的全流程自动化。

Huobao Drama is an AI-powered short drama production platform that automates the entire workflow from script generation, character design, storyboarding to video composition.

### 🎯 核心价值 / Core Features

- **🤖 AI驱动 / AI-Driven**：使用大语言模型自动生成剧本、角色设定和分镜脚本 | Automatic script, character, and storyboard generation using large language models
- **🎨 智能创作 / Intelligent Creation**：AI绘图生成角色形象和场景背景 | AI-generated character portraits and scene backgrounds
- **📹 视频生成 / Video Generation**：基于文生视频模型自动生成分镜视频 | Automatic storyboard video generation using text-to-video models
- **⚡ 批量处理 / Batch Processing**：支持批量生成和异步任务处理 | Support for batch generation and asynchronous task processing
- **🔄 工作流 / Workflow**：完整的短剧制作工作流，从创意到成片一站式完成 | Complete production workflow from idea to final video

### 🛠️ 技术架构

采用**DDD领域驱动设计**，清晰分层：

```
├── API层 (Gin HTTP)
├── 应用服务层 (Business Logic)
├── 领域层 (Domain Models)
└── 基础设施层 (Database, External Services)
```

### 🎥 作品展示 / Demo Videos

体验 AI 短剧生成效果：

<div align="center">

**示例作品 1**

<video src="https://ffile.chatfire.site/cf/public/20260114094337396.mp4" controls width="640"></video>

**示例作品 2**

<video src="https://ffile.chatfire.site/cf/public/fcede75e8aeafe22031dbf78f86285b8.mp4" controls width="640"></video>

[点击观看视频 1](https://ffile.chatfire.site/cf/public/20260114094337396.mp4) | [点击观看视频 2](https://ffile.chatfire.site/cf/public/fcede75e8aeafe22031dbf78f86285b8.mp4)

</div>

---

## ✨ 功能特性

### 🎭 角色管理
- ✅ AI生成角色形象
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

### 📦 资源管理
- ✅ 素材库统一管理
- ✅ 本地存储支持
- ✅ 资源导入导出
- ✅ 任务进度追踪

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
git clone https://github.com/chatfire-AI/huobao-drama.git
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

### 🐳 Docker 部署（推荐）

使用 Docker 部署是最简单快捷的方式，已内置默认配置，开箱即用。

#### 快速体验（推荐新手）

```bash
# 从 Docker Hub 拉取并运行
docker run -d \
  --name huobao-drama \
  -p 5678:5678 \
  --restart unless-stopped \
  huobao/huobao-drama:latest
```

访问: `http://localhost:5678` 即可开始使用！

#### 方式一：使用 Docker Compose

```bash
# 启动服务（使用内置配置）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

**自定义配置**（可选）：
```bash
# 1. 取消 docker-compose.yml 中配置文件挂载的注释
# 2. 复制并修改配置文件
cp configs/config.example.yaml configs/config.yaml
vim configs/config.yaml

# 3. 重启服务
docker-compose up -d
```

#### 方式二：使用 Docker 命令

**基础启动**（使用内置配置）：
```bash
docker run -d \
  --name huobao-drama \
  -p 5678:5678 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  huobao/huobao-drama:latest
```

**自定义配置启动**：
```bash
# 挂载自定义配置文件
docker run -d \
  --name huobao-drama \
  -p 5678:5678 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs/config.yaml:/app/configs/config.yaml:ro \
  --restart unless-stopped \
  huobao/huobao-drama:latest
```

**查看日志**：
```bash
docker logs -f huobao-drama
```

#### 方式三：本地构建镜像

```bash
# 1. 构建镜像
docker build -t huobao-drama:latest .

# 2. 运行容器
docker run -d \
  --name huobao-drama \
  -p 5678:5678 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  huobao-drama:latest
```

#### 镜像仓库

**Docker Hub**（国际）:
```bash
docker pull huobao/huobao-drama:latest
```

**Docker 部署优势：**
- ✅ 开箱即用，内置默认配置
- ✅ 环境一致性，避免依赖问题
- ✅ 一键启动，无需安装 Go、Node.js、FFmpeg
- ✅ 易于迁移和扩展
- ✅ 自动健康检查和重启
- ✅ 自动处理文件权限，无需手动配置

**📝 数据持久化说明：**

Docker 部署使用命名卷 `huobao-data` 存储数据库和上传文件：
- 数据会自动持久化，重启容器不会丢失
- 容器内 `app` 用户自动拥有完整读写权限
- 无需担心传统部署中的权限问题

如需备份数据：
```bash
# 查看卷位置
docker volume inspect huobao-drama_huobao-data

# 备份数据
docker run --rm -v huobao-drama_huobao-data:/data -v $(pwd):/backup alpine tar czf /backup/huobao-data-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v huobao-drama_huobao-data:/data -v $(pwd):/backup alpine tar xzf /backup/huobao-data-backup.tar.gz -C /data
```

---

### 🏭 传统部署方式

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

# 创建数据目录并设置权限（重要！）
# 注意：将 YOUR_USER 替换为实际运行服务的用户名（如 www-data、ubuntu、deploy 等）
sudo mkdir -p /opt/huobao-drama/data/storage
sudo chown -R YOUR_USER:YOUR_USER /opt/huobao-drama/data
sudo chmod -R 755 /opt/huobao-drama/data

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
User=YOUR_USER
WorkingDirectory=/opt/huobao-drama
ExecStart=/opt/huobao-drama/huobao-drama
Restart=on-failure
RestartSec=10

# 环境变量（可选）
# Environment="GIN_MODE=release"

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

**⚠️ 常见问题：SQLite 写权限错误**

如果遇到 `attempt to write a readonly database` 错误：

```bash
# 1. 确认当前运行服务的用户
sudo systemctl status huobao-drama | grep "Main PID"
ps aux | grep huobao-drama

# 2. 修复权限（将 YOUR_USER 替换为实际用户名）
sudo chown -R YOUR_USER:YOUR_USER /opt/huobao-drama/data
sudo chmod -R 755 /opt/huobao-drama/data

# 3. 验证权限
ls -la /opt/huobao-drama/data
# 应该显示所有者为运行服务的用户

# 4. 重启服务
sudo systemctl restart huobao-drama
```

**原因说明**：
- SQLite 需要对数据库文件 **和** 所在目录都有写权限
- 需要在目录中创建临时文件（如 `-wal`、`-journal`）
- **关键**：确保 systemd 配置中的 `User` 与数据目录所有者一致

**常用用户名**：
- Ubuntu/Debian: `www-data`、`ubuntu`
- CentOS/RHEL: `nginx`、`apache`
- 自定义部署: `deploy`、`app`、当前登录用户

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

## � 更新日志 / Changelog

### v1.0.1 (2026-01-14)

#### 🐛 Bug Fixes / 问题修复
- 修复 视频生成 API 响应解析问题
- 修复视频生成客户端选择逻辑

#### ✨ Features / 新增功能
- 添加 OpenAI Sora 视频端点配置（/videos 和 /videos/{taskId}）
- 优化错误处理，支持 JSON 对象和字符串格式的错误响应

#### 🔧 Improvements / 改进
- 完善视频生成服务的 provider 识别
- 优化客户端请求格式（支持 Sora/Doubao 模型）
- 改进日志输出，便于调试

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## API配置站点
2分钟完成配置：[API聚合站点](https://api.chatfire.site/models)

## 📧 联系方式
商务联系V：dangbao1117
## 项目交流群
![项目交流群](drama.png)
- 提交 [Issue](../../issues)
- 发送邮件至项目维护者

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个Star！**
## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=chatfire-AI/huobao-drama&type=date&legend=top-left)](https://www.star-history.com/#chatfire-AI/huobao-drama&type=date&legend=top-left)
Made with ❤️ by Huobao Team

</div>
