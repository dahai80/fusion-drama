package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/adk/middlewares/skill"
	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/schema"
	models "github.com/drama-generator/backend/domain/models"
	"github.com/drama-generator/backend/pkg/config"
	"github.com/drama-generator/backend/pkg/logger"
	"gorm.io/gorm"

	openaimodel "github.com/cloudwego/eino-ext/components/model/openai"
)

// AgentService 管理所有专业化 Agent 的创建和 SSE 流处理
type AgentService struct {
	db         *gorm.DB
	cfg        *config.Config
	log        *logger.Logger
	aiService  *AIService
	promptI18n *PromptI18n
	skillsDir  string

	// 业务 Service 引用
	dramaService            *DramaService
	characterLibraryService *CharacterLibraryService
	propService             *PropService
	storyboardService       *StoryboardService
	imageGenService         *ImageGenerationService
	framePromptService      *FramePromptService
}

// AgentChatRequest Agent 对话请求
type AgentChatRequest struct {
	Message   string `json:"message" binding:"required"`
	DramaID   uint   `json:"drama_id"`
	EpisodeID uint   `json:"episode_id"`
}

// AgentSSEEvent SSE 事件
type AgentSSEEvent struct {
	Type string      `json:"type"` // tool_call, tool_result, content, done, error
	Data interface{} `json:"data"`
}

// 支持的 Agent 类型
var validAgentTypes = map[string]bool{
	"script_rewriter":    true,
	"style_analyzer":     true,
	"extractor":          true,
	"voice_assigner":     true,
	"storyboard_breaker": true,
	"prompt_generator":   true,
}

// context key 用于向 Tools 传递请求上下文
type agentContextKey string

const (
	ctxKeyDramaID   agentContextKey = "agent_drama_id"
	ctxKeyEpisodeID agentContextKey = "agent_episode_id"
)

func NewAgentService(
	db *gorm.DB,
	cfg *config.Config,
	log *logger.Logger,
	dramaService *DramaService,
	characterLibraryService *CharacterLibraryService,
	propService *PropService,
	storyboardService *StoryboardService,
	imageGenService *ImageGenerationService,
	framePromptService *FramePromptService,
) *AgentService {
	// skills 目录相对于可执行文件的位置
	skillsDir := "skills"
	if _, err := os.Stat(skillsDir); os.IsNotExist(err) {
		// 尝试从项目根目录查找
		if wd, wdErr := os.Getwd(); wdErr == nil {
			candidate := filepath.Join(wd, "skills")
			if _, statErr := os.Stat(candidate); statErr == nil {
				skillsDir = candidate
			}
		}
	}

	return &AgentService{
		db:                      db,
		cfg:                     cfg,
		log:                     log,
		aiService:               NewAIService(db, log),
		promptI18n:              NewPromptI18n(cfg),
		skillsDir:               skillsDir,
		dramaService:            dramaService,
		characterLibraryService: characterLibraryService,
		propService:             propService,
		storyboardService:       storyboardService,
		imageGenService:         imageGenService,
		framePromptService:      framePromptService,
	}
}

// IsValidAgentType 检查 Agent 类型是否有效
func IsValidAgentType(agentType string) bool {
	return validAgentTypes[agentType]
}

// StreamChat 执行 Agent 对话并返回 SSE 事件通道
func (s *AgentService) StreamChat(ctx context.Context, agentType string, req AgentChatRequest) (<-chan AgentSSEEvent, error) {
	if !IsValidAgentType(agentType) {
		return nil, fmt.Errorf("invalid agent type: %s", agentType)
	}

	// 注入 drama/episode 上下文
	ctx = context.WithValue(ctx, ctxKeyDramaID, req.DramaID)
	ctx = context.WithValue(ctx, ctxKeyEpisodeID, req.EpisodeID)

	// 构建 Agent
	agent, err := s.buildAgent(ctx, agentType)
	if err != nil {
		return nil, fmt.Errorf("failed to build agent: %w", err)
	}

	// 创建 Runner
	runner := adk.NewRunner(ctx, adk.RunnerConfig{
		Agent:          agent,
		EnableStreaming: true,
	})

	// 启动 Agent
	iter := runner.Query(ctx, req.Message)

	// 创建事件通道
	eventCh := make(chan AgentSSEEvent, 32)

	go s.processAgentEvents(ctx, iter, eventCh)

	return eventCh, nil
}

// buildAgent 根据类型构建对应的 Eino Agent
func (s *AgentService) buildAgent(ctx context.Context, agentType string) (adk.Agent, error) {
	// 1. 从 agent_configs 读取该 Agent 类型的配置
	var agentCfg models.AgentConfig
	hasAgentCfg := false
	if err := s.db.Where("agent_type = ? AND is_active = ?", agentType, true).First(&agentCfg).Error; err == nil {
		hasAgentCfg = true
	}

	// 2. 从 DB 获取 AI 文本配置（供应商级别）
	aiConfig, err := s.aiService.GetDefaultConfig("text")
	if err != nil {
		return nil, fmt.Errorf("no text AI provider configured: %w", err)
	}

	// 3. 确定模型名称：Agent 配置优先，否则用供应商默认
	modelName := ""
	if hasAgentCfg && agentCfg.Model != "" {
		modelName = agentCfg.Model
		// 尝试找到包含该模型的供应商配置
		if modelConfig, err := s.aiService.GetConfigForModel("text", modelName); err == nil {
			aiConfig = modelConfig
		}
	} else if len(aiConfig.Model) > 0 {
		modelName = aiConfig.Model[0]
	}

	// 4. 确定温度
	temp := float32(0.7)
	if hasAgentCfg {
		temp = float32(agentCfg.Temperature)
	}

	// 5. 确定最大迭代次数
	maxIterations := 15
	if hasAgentCfg && agentCfg.MaxIterations > 0 {
		maxIterations = agentCfg.MaxIterations
	}

	// 6. 确定系统提示词：DB 优先，否则用默认
	instruction := s.getSystemPrompt(agentType)
	if hasAgentCfg && agentCfg.SystemPrompt != "" {
		instruction = agentCfg.SystemPrompt
	}

	// 7. 构建 Eino OpenAI ChatModel
	chatModel, err := openaimodel.NewChatModel(ctx, &openaimodel.ChatModelConfig{
		BaseURL:     aiConfig.BaseURL,
		APIKey:      aiConfig.APIKey,
		Model:       modelName,
		Temperature: &temp,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create chat model: %w", err)
	}

	s.log.Infow("Building agent",
		"agent_type", agentType,
		"model", modelName,
		"temperature", temp,
		"max_iterations", maxIterations,
		"provider", aiConfig.Provider)

	// 获取该 Agent 类型的 Tools
	tools := s.getToolsForAgent(ctx, agentType)

	// 构建 Skill 中间件
	handlers, err := s.buildSkillHandlers(ctx, agentType)
	if err != nil {
		s.log.Warnw("Failed to build skill handlers, continuing without skills", "error", err, "agent_type", agentType)
		handlers = nil
	}

	// 创建 ChatModelAgent
	agent, err := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
		Name:        agentType,
		Description: s.getAgentDescription(agentType),
		Instruction: instruction,
		Model:       chatModel,
		ToolsConfig: adk.ToolsConfig{
			ToolsNodeConfig: compose.ToolsNodeConfig{
				Tools: tools,
			},
		},
		MaxIterations: maxIterations,
		Handlers:      handlers,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create agent: %w", err)
	}

	return agent, nil
}

// buildSkillHandlers 构建 Skill 中间件
func (s *AgentService) buildSkillHandlers(ctx context.Context, agentType string) ([]adk.ChatModelAgentMiddleware, error) {
	// 映射 agent 类型到 skills 子目录
	skillsDirs := s.getSkillDirsForAgent(agentType)
	if len(skillsDirs) == 0 {
		return nil, nil
	}

	var handlers []adk.ChatModelAgentMiddleware
	for _, dir := range skillsDirs {
		absDir := filepath.Join(s.skillsDir, dir)
		if _, err := os.Stat(absDir); os.IsNotExist(err) {
			s.log.Warnw("Skills directory not found", "dir", absDir)
			continue
		}

		backend := &localSkillBackend{baseDir: absDir}
		middleware, err := skill.NewMiddleware(ctx, &skill.Config{
			Backend: backend,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create skill middleware for %s: %w", dir, err)
		}
		handlers = append(handlers, middleware)
	}

	return handlers, nil
}

// getSkillDirsForAgent 返回 Agent 类型对应的 skills 目录列表
func (s *AgentService) getSkillDirsForAgent(agentType string) []string {
	switch agentType {
	case "script_rewriter":
		return []string{"script-rewriter"}
	case "style_analyzer":
		return []string{"style-analyzer"}
	case "extractor":
		return []string{"character-scene-extractor"}
	case "voice_assigner":
		return []string{"voice-assigner"}
	case "storyboard_breaker":
		return []string{"storyboard-breaker"}
	case "prompt_generator":
		return []string{"image-prompt-generator", "video-prompt-generator"}
	default:
		return nil
	}
}

// processAgentEvents 处理 Agent 事件流并写入 SSE 通道
func (s *AgentService) processAgentEvents(ctx context.Context, iter *adk.AsyncIterator[*adk.AgentEvent], eventCh chan<- AgentSSEEvent) {
	defer close(eventCh)

	for {
		// 检查客户端是否已断开
		select {
		case <-ctx.Done():
			return
		default:
		}

		event, ok := iter.Next()
		if !ok {
			s.sendEvent(ctx, eventCh, AgentSSEEvent{Type: "done", Data: map[string]string{}})
			return
		}

		if event.Err != nil {
			s.sendEvent(ctx, eventCh, AgentSSEEvent{Type: "error", Data: map[string]string{"message": event.Err.Error()}})
			return
		}

		if event.Output == nil || event.Output.MessageOutput == nil {
			continue
		}

		mv := event.Output.MessageOutput
		if mv.IsStreaming && mv.MessageStream != nil {
			s.processStreamMessage(ctx, mv, eventCh)
		} else if mv.Message != nil {
			s.processMessage(ctx, mv.Message, mv.Role, mv.ToolName, eventCh)
		}
	}
}

// sendEvent 安全地发送事件，客户端断开时不阻塞
func (s *AgentService) sendEvent(ctx context.Context, eventCh chan<- AgentSSEEvent, event AgentSSEEvent) {
	select {
	case eventCh <- event:
	case <-ctx.Done():
	}
}

// processStreamMessage 处理流式消息
func (s *AgentService) processStreamMessage(ctx context.Context, mv *adk.MessageVariant, eventCh chan<- AgentSSEEvent) {
	defer mv.MessageStream.Close()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		msg, err := mv.MessageStream.Recv()
		if err == io.EOF {
			return
		}
		if err != nil {
			s.log.Warnw("Error receiving stream message", "error", err)
			return
		}
		s.processMessage(ctx, msg, mv.Role, mv.ToolName, eventCh)
	}
}

// processMessage 处理单条消息并发送对应 SSE 事件
func (s *AgentService) processMessage(ctx context.Context, msg *schema.Message, role schema.RoleType, toolName string, eventCh chan<- AgentSSEEvent) {
	if msg == nil {
		return
	}

	// Tool 调用
	if len(msg.ToolCalls) > 0 {
		for _, tc := range msg.ToolCalls {
			s.sendEvent(ctx, eventCh, AgentSSEEvent{
				Type: "tool_call",
				Data: map[string]interface{}{
					"tool":      tc.Function.Name,
					"arguments": tc.Function.Arguments,
				},
			})
		}
		return
	}

	// Tool 结果
	if role == schema.Tool {
		content := msg.Content
		if len(content) > 2000 {
			content = content[:2000] + "...[truncated]"
		}
		s.sendEvent(ctx, eventCh, AgentSSEEvent{
			Type: "tool_result",
			Data: map[string]interface{}{
				"tool":   toolName,
				"result": content,
			},
		})
		return
	}

	// 普通文本内容
	if msg.Content != "" {
		s.sendEvent(ctx, eventCh, AgentSSEEvent{
			Type: "content",
			Data: map[string]string{"content": msg.Content},
		})
	}
}

// getSystemPrompt 获取 Agent 的系统提示词
func (s *AgentService) getSystemPrompt(agentType string) string {
	isEN := s.promptI18n.IsEnglish()

	switch agentType {
	case "script_rewriter":
		if isEN {
			return "You are a professional screenwriter. Your task is to rewrite novel text into short drama screenplay format. Maintain the core plot, enhance visual storytelling and dialogue. Use the available tools to read scripts, rewrite them, and save results."
		}
		return "你是专业编剧。你的任务是将小说文本改写为短剧剧本格式。保持情节核心，增强画面感和对白。使用可用工具读取剧本、改写内容并保存结果。"
	case "style_analyzer":
		if isEN {
			return "You are a visual style consultant. Analyze the narrative style, visual tone, color palette, and rhythm of scripts. Use tools to read content and update style settings."
		}
		return "你是视觉风格顾问。分析剧本的叙事风格、视觉调性、色彩倾向和节奏感。使用工具读取内容并更新风格设置。"
	case "extractor":
		if isEN {
			return "You are a production assistant. Extract character information, scene/background details, and props from scripts accurately. Use the extraction tools to analyze and save results to the database."
		}
		return "你是制片助理。从剧本中精确提取角色信息、场景/背景细节和道具。使用提取工具分析并将结果保存到数据库。"
	case "voice_assigner":
		if isEN {
			return "You are a voice casting director. Analyze character traits (personality, age, gender, identity) and assign appropriate voice styles. Use tools to view characters and assign voices."
		}
		return "你是配音导演。分析角色特征（性格、年龄、性别、身份）并分配合适的音色。使用工具查看角色信息并分配音色。"
	case "storyboard_breaker":
		if isEN {
			return "You are a storyboard artist. Break down scripts into detailed shot sequences including shot type, camera angle, movement, action, dialogue, and atmosphere. Use tools to generate and refine storyboards."
		}
		return "你是分镜师。将剧本拆解为详细的镜头序列，包含景别、角度、运镜、动作、对话和氛围。使用工具生成和优化分镜。"
	case "prompt_generator":
		if isEN {
			return "You are an AI prompt engineering expert. Generate high-quality prompts for image generation (characters, scenes, shots) and video generation. Use tools to create and save prompts."
		}
		return "你是AI绘画提示词专家。生成高质量的图片生成提示词（角色、场景、镜头）和视频生成提示词。使用工具创建并保存提示词。"
	default:
		return "You are a helpful assistant."
	}
}

// getAgentDescription 获取 Agent 描述
func (s *AgentService) getAgentDescription(agentType string) string {
	switch agentType {
	case "script_rewriter":
		return "Rewrites novel text into screenplay format"
	case "style_analyzer":
		return "Analyzes visual style of drama episodes"
	case "extractor":
		return "Extracts characters, scenes, and props from scripts"
	case "voice_assigner":
		return "Assigns voice styles to characters"
	case "storyboard_breaker":
		return "Breaks down scripts into storyboard shots"
	case "prompt_generator":
		return "Generates image and video prompts"
	default:
		return "A helpful assistant"
	}
}

// getToolsForAgent 获取 Agent 类型对应的 Tools（自动过滤 nil 工具）
func (s *AgentService) getToolsForAgent(ctx context.Context, agentType string) []tool.BaseTool {
	var tools []tool.BaseTool
	switch agentType {
	case "script_rewriter":
		tools = s.getScriptRewriterTools()
	case "style_analyzer":
		tools = s.getStyleAnalyzerTools()
	case "extractor":
		tools = s.getExtractorTools()
	case "voice_assigner":
		tools = s.getVoiceAssignerTools()
	case "storyboard_breaker":
		tools = s.getStoryboardBreakerTools()
	case "prompt_generator":
		tools = s.getPromptGeneratorTools()
	}
	// 过滤掉 InferTool 失败产生的 nil 工具
	var valid []tool.BaseTool
	for _, t := range tools {
		if t != nil {
			valid = append(valid, t)
		} else {
			s.log.Warnw("Nil tool detected and filtered", "agent_type", agentType)
		}
	}
	return valid
}

// --- 调试 API 方法 ---

// AgentDebugInfo 调试信息
type AgentDebugInfo struct {
	AgentType     string            `json:"agent_type"`
	SystemPrompt  string            `json:"system_prompt"`
	DefaultPrompt string            `json:"default_prompt"`
	Skills        []SkillFileInfo   `json:"skills"`
	Tools         []string          `json:"tools"`
}

// SkillFileInfo Skill 文件信息
type SkillFileInfo struct {
	Name    string `json:"name"`
	Dir     string `json:"dir"`
	Content string `json:"content"`
}

// GetDebugInfo 获取 Agent 调试信息
func (s *AgentService) GetDebugInfo(ctx context.Context, agentType string) (*AgentDebugInfo, error) {
	if !IsValidAgentType(agentType) {
		return nil, fmt.Errorf("invalid agent type: %s", agentType)
	}

	info := &AgentDebugInfo{
		AgentType:     agentType,
		DefaultPrompt: s.getSystemPrompt(agentType),
	}

	// 从 DB 读自定义 prompt
	var agentCfg models.AgentConfig
	if err := s.db.Where("agent_type = ?", agentType).First(&agentCfg).Error; err == nil {
		info.SystemPrompt = agentCfg.SystemPrompt
	}
	if info.SystemPrompt == "" {
		info.SystemPrompt = info.DefaultPrompt
	}

	// 读取 Skills
	skillDirs := s.getSkillDirsForAgent(agentType)
	for _, dir := range skillDirs {
		absDir := filepath.Join(s.skillsDir, dir)
		entries, err := os.ReadDir(absDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			skillFile := filepath.Join(absDir, entry.Name(), "SKILL.md")
			content, err := os.ReadFile(skillFile)
			if err != nil {
				continue
			}
			info.Skills = append(info.Skills, SkillFileInfo{
				Name:    entry.Name(),
				Dir:     dir,
				Content: string(content),
			})
		}
	}

	// 收集 Tool 名称
	tools := s.getToolsForAgent(ctx, agentType)
	for _, t := range tools {
		if toolInfo, err := t.Info(ctx); err == nil {
			info.Tools = append(info.Tools, toolInfo.Name)
		}
	}

	return info, nil
}

// UpdateSkillContent 更新 Skill 文件内容
func (s *AgentService) UpdateSkillContent(dir, skillName, content string) error {
	skillFile := filepath.Join(s.skillsDir, dir, skillName, "SKILL.md")
	if _, err := os.Stat(skillFile); os.IsNotExist(err) {
		return fmt.Errorf("skill file not found: %s/%s", dir, skillName)
	}
	return os.WriteFile(skillFile, []byte(content), 0644)
}

// --- 本地 Skill 文件系统后端 ---

// localSkillBackend 实现 skill.Backend 接口，从本地文件系统读取 SKILL.md
type localSkillBackend struct {
	baseDir string
}

func (b *localSkillBackend) List(ctx context.Context) ([]skill.FrontMatter, error) {
	entries, err := os.ReadDir(b.baseDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read skills dir: %w", err)
	}

	var matters []skill.FrontMatter
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillFile := filepath.Join(b.baseDir, entry.Name(), "SKILL.md")
		if _, statErr := os.Stat(skillFile); os.IsNotExist(statErr) {
			continue
		}
		content, readErr := os.ReadFile(skillFile)
		if readErr != nil {
			continue
		}
		fm := parseSkillFrontMatter(string(content))
		if fm.Name == "" {
			fm.Name = entry.Name()
		}
		matters = append(matters, fm)
	}
	return matters, nil
}

func (b *localSkillBackend) Get(ctx context.Context, name string) (skill.Skill, error) {
	skillFile := filepath.Join(b.baseDir, name, "SKILL.md")
	content, err := os.ReadFile(skillFile)
	if err != nil {
		return skill.Skill{}, fmt.Errorf("skill %q not found: %w", name, err)
	}

	fm, body := parseSkillContent(string(content))
	if fm.Name == "" {
		fm.Name = name
	}

	return skill.Skill{
		FrontMatter:   fm,
		Content:       body,
		BaseDirectory: filepath.Join(b.baseDir, name),
	}, nil
}

// parseSkillFrontMatter 解析 SKILL.md 的 YAML frontmatter
func parseSkillFrontMatter(content string) skill.FrontMatter {
	fm, _ := parseSkillContent(content)
	return fm
}

// parseSkillContent 分离 frontmatter 和正文
func parseSkillContent(content string) (skill.FrontMatter, string) {
	var fm skill.FrontMatter

	if !strings.HasPrefix(content, "---") {
		return fm, content
	}

	parts := strings.SplitN(content[3:], "---", 2)
	if len(parts) != 2 {
		return fm, content
	}

	// 简单解析 YAML frontmatter
	for _, line := range strings.Split(strings.TrimSpace(parts[0]), "\n") {
		line = strings.TrimSpace(line)
		if kv := strings.SplitN(line, ":", 2); len(kv) == 2 {
			key := strings.TrimSpace(kv[0])
			val := strings.TrimSpace(kv[1])
			switch key {
			case "name":
				fm.Name = val
			case "description":
				fm.Description = val
			case "context":
				fm.Context = skill.ContextMode(val)
			case "agent":
				fm.Agent = val
			case "model":
				fm.Model = val
			}
		}
	}

	return fm, strings.TrimSpace(parts[1])
}

// --- 辅助函数 ---

func getDramaIDFromCtx(ctx context.Context) uint {
	if v, ok := ctx.Value(ctxKeyDramaID).(uint); ok {
		return v
	}
	return 0
}

func getEpisodeIDFromCtx(ctx context.Context) uint {
	if v, ok := ctx.Value(ctxKeyEpisodeID).(uint); ok {
		return v
	}
	return 0
}

func toJSON(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf(`{"error": "%s"}`, err.Error())
	}
	return string(b)
}
