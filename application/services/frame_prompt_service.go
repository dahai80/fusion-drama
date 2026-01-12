package services

import (
	"fmt"
	"strings"

	"github.com/drama-generator/backend/domain/models"
	"github.com/drama-generator/backend/pkg/logger"
	"gorm.io/gorm"
)

// FramePromptService 处理帧提示词生成
type FramePromptService struct {
	db        *gorm.DB
	aiService *AIService
	log       *logger.Logger
}

// NewFramePromptService 创建帧提示词服务
func NewFramePromptService(db *gorm.DB, log *logger.Logger) *FramePromptService {
	return &FramePromptService{
		db:        db,
		aiService: NewAIService(db, log),
		log:       log,
	}
}

// FrameType 帧类型
type FrameType string

const (
	FrameTypeFirst  FrameType = "first"  // 首帧
	FrameTypeKey    FrameType = "key"    // 关键帧
	FrameTypeLast   FrameType = "last"   // 尾帧
	FrameTypePanel  FrameType = "panel"  // 分镜板（3格组合）
	FrameTypeAction FrameType = "action" // 动作序列（5格）
)

// GenerateFramePromptRequest 生成帧提示词请求
type GenerateFramePromptRequest struct {
	StoryboardID string    `json:"storyboard_id"`
	FrameType    FrameType `json:"frame_type"`
	// 可选参数
	PanelCount int `json:"panel_count,omitempty"` // 分镜板格数，默认3
}

// FramePromptResponse 帧提示词响应
type FramePromptResponse struct {
	FrameType   FrameType          `json:"frame_type"`
	SingleFrame *SingleFramePrompt `json:"single_frame,omitempty"` // 单帧提示词
	MultiFrame  *MultiFramePrompt  `json:"multi_frame,omitempty"`  // 多帧提示词
}

// SingleFramePrompt 单帧提示词
type SingleFramePrompt struct {
	Prompt      string `json:"prompt"`
	Description string `json:"description"`
}

// MultiFramePrompt 多帧提示词
type MultiFramePrompt struct {
	Layout string              `json:"layout"` // horizontal_3, grid_2x2 等
	Frames []SingleFramePrompt `json:"frames"`
}

// GenerateFramePrompt 生成指定类型的帧提示词并保存到frame_prompts表
func (s *FramePromptService) GenerateFramePrompt(req GenerateFramePromptRequest) (*FramePromptResponse, error) {
	// 查询分镜信息
	var storyboard models.Storyboard
	if err := s.db.Preload("Characters").First(&storyboard, req.StoryboardID).Error; err != nil {
		return nil, fmt.Errorf("storyboard not found: %w", err)
	}

	// 获取场景信息
	var scene *models.Scene
	if storyboard.SceneID != nil {
		scene = &models.Scene{}
		if err := s.db.First(scene, *storyboard.SceneID).Error; err != nil {
			s.log.Warnw("Scene not found", "scene_id", *storyboard.SceneID)
			scene = nil
		}
	}

	response := &FramePromptResponse{
		FrameType: req.FrameType,
	}

	// 生成提示词
	switch req.FrameType {
	case FrameTypeFirst:
		response.SingleFrame = s.generateFirstFrame(storyboard, scene)
		// 保存单帧提示词
		s.saveFramePrompt(req.StoryboardID, string(req.FrameType), response.SingleFrame.Prompt, response.SingleFrame.Description, "")
	case FrameTypeKey:
		response.SingleFrame = s.generateKeyFrame(storyboard, scene)
		s.saveFramePrompt(req.StoryboardID, string(req.FrameType), response.SingleFrame.Prompt, response.SingleFrame.Description, "")
	case FrameTypeLast:
		response.SingleFrame = s.generateLastFrame(storyboard, scene)
		s.saveFramePrompt(req.StoryboardID, string(req.FrameType), response.SingleFrame.Prompt, response.SingleFrame.Description, "")
	case FrameTypePanel:
		count := req.PanelCount
		if count == 0 {
			count = 3
		}
		response.MultiFrame = s.generatePanelFrames(storyboard, scene, count)
		// 保存多帧提示词（合并为一条记录）
		var prompts []string
		for _, frame := range response.MultiFrame.Frames {
			prompts = append(prompts, frame.Prompt)
		}
		combinedPrompt := strings.Join(prompts, "\n---\n")
		s.saveFramePrompt(req.StoryboardID, string(req.FrameType), combinedPrompt, "分镜板组合提示词", response.MultiFrame.Layout)
	case FrameTypeAction:
		response.MultiFrame = s.generateActionSequence(storyboard, scene)
		var prompts []string
		for _, frame := range response.MultiFrame.Frames {
			prompts = append(prompts, frame.Prompt)
		}
		combinedPrompt := strings.Join(prompts, "\n---\n")
		s.saveFramePrompt(req.StoryboardID, string(req.FrameType), combinedPrompt, "动作序列组合提示词", response.MultiFrame.Layout)
	default:
		return nil, fmt.Errorf("unsupported frame type: %s", req.FrameType)
	}

	return response, nil
}

// saveFramePrompt 保存帧提示词到数据库
func (s *FramePromptService) saveFramePrompt(storyboardID, frameType, prompt, description, layout string) {
	framePrompt := models.FramePrompt{
		StoryboardID: uint(mustParseUint(storyboardID)),
		FrameType:    frameType,
		Prompt:       prompt,
	}

	if description != "" {
		framePrompt.Description = &description
	}
	if layout != "" {
		framePrompt.Layout = &layout
	}

	// 先删除同类型的旧记录（保持最新）
	s.db.Where("storyboard_id = ? AND frame_type = ?", storyboardID, frameType).Delete(&models.FramePrompt{})

	// 插入新记录
	if err := s.db.Create(&framePrompt).Error; err != nil {
		s.log.Warnw("Failed to save frame prompt", "error", err, "storyboard_id", storyboardID, "frame_type", frameType)
	}
}

// mustParseUint 辅助函数
func mustParseUint(s string) uint64 {
	var result uint64
	fmt.Sscanf(s, "%d", &result)
	return result
}

// generateFirstFrame 生成首帧提示词
func (s *FramePromptService) generateFirstFrame(sb models.Storyboard, scene *models.Scene) *SingleFramePrompt {
	// 构建上下文信息
	contextInfo := s.buildStoryboardContext(sb, scene)

	// 构建AI提示词
	systemPrompt := `你是一个专业的图像生成提示词专家。请根据提供的镜头信息，生成适合用于AI图像生成的提示词。

重要：这是镜头的首帧 - 一个完全静态的画面，展示动作发生之前的初始状态。

要求：
1. 直接输出提示词，不要任何解释说明
2. 可以使用中文或英文，用逗号分隔关键词
3. 只描述静态视觉元素：场景环境、角色姿态、表情、氛围、光线
4. 不要包含任何动作动词（如：猛然、弹起、坐直、抓住等）
5. 描述角色处于动作发生前的状态（如：躺在床上、站立、坐着等静态姿态）
6. 适合动画风格（anime style）

示例格式：
Anime style, 城市公寓卧室, 凌晨, 昏暗房间, 床上, 年轻男子躺着, 表情平静, 闭眼睡眠, 柔和光线, 静谧氛围, 中景, 平视`

	userPrompt := fmt.Sprintf(`镜头信息：
%s

请直接生成首帧的图像提示词，不要任何解释：`, contextInfo)

	// 调用AI生成
	prompt, err := s.aiService.GenerateText(userPrompt, systemPrompt)
	if err != nil {
		s.log.Warnw("AI generation failed, using fallback", "error", err)
		// 降级方案：使用简单拼接
		prompt = s.buildFallbackPrompt(sb, scene, "first frame, static shot")
	}

	// 如果AI返回空字符串，使用降级方案
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		s.log.Warnw("AI returned empty prompt, using fallback", "storyboard_id", sb.ID)
		prompt = s.buildFallbackPrompt(sb, scene, "first frame, static shot")
	}

	return &SingleFramePrompt{
		Prompt:      prompt,
		Description: "镜头开始的静态画面，展示初始状态",
	}
}

// generateKeyFrame 生成关键帧提示词
func (s *FramePromptService) generateKeyFrame(sb models.Storyboard, scene *models.Scene) *SingleFramePrompt {
	// 构建上下文信息
	contextInfo := s.buildStoryboardContext(sb, scene)

	// 构建AI提示词
	systemPrompt := `你是一个专业的图像生成提示词专家。请根据提供的镜头信息，生成适合用于AI图像生成的提示词。

重要：这是镜头的关键帧 - 捕捉动作最激烈、最精彩的瞬间。

要求：
1. 直接输出提示词，不要任何解释说明
2. 可以使用中文或英文，用逗号分隔关键词
3. 重点描述动作的高潮瞬间：身体姿态、运动轨迹、力量感
4. 包含动态元素：动作模糊、速度线、冲击感
5. 强调表情和情绪的极致状态
6. 适合动画风格（anime style）

示例格式：
Anime style, 城市街道, 白天, 男子全力冲刺, 身体前倾, 动作模糊, 速度线, 汗水飞溅, 表情坚毅, 紧张氛围, 动态镜头, 中景`

	userPrompt := fmt.Sprintf(`镜头信息：
%s

请直接生成关键帧的图像提示词，不要任何解释：`, contextInfo)

	// 调用AI生成
	prompt, err := s.aiService.GenerateText(userPrompt, systemPrompt)
	if err != nil {
		s.log.Warnw("AI generation failed, using fallback", "error", err)
		prompt = s.buildFallbackPrompt(sb, scene, "key frame, dynamic action")
	}

	// 如果AI返回空字符串，使用降级方案
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		s.log.Warnw("AI returned empty prompt, using fallback", "storyboard_id", sb.ID)
		prompt = s.buildFallbackPrompt(sb, scene, "key frame, dynamic action")
	}

	return &SingleFramePrompt{
		Prompt:      prompt,
		Description: "动作高潮瞬间，展示关键动作",
	}
}

// generateLastFrame 生成尾帧提示词
func (s *FramePromptService) generateLastFrame(sb models.Storyboard, scene *models.Scene) *SingleFramePrompt {
	// 构建上下文信息
	contextInfo := s.buildStoryboardContext(sb, scene)

	// 构建AI提示词
	systemPrompt := `你是一个专业的图像生成提示词专家。请根据提供的镜头信息，生成适合用于AI图像生成的提示词。

重要：这是镜头的尾帧 - 一个静态画面，展示动作结束后的最终状态和结果。

要求：
1. 直接输出提示词，不要任何解释说明
2. 可以使用中文或英文，用逗号分隔关键词
3. 只描述静态的最终状态：角色姿态、表情、环境变化
4. 不要包含动作过程，只展示动作的结果和余韵
5. 强调情绪的余波和氛围的沉淀
6. 适合动画风格（anime style）

示例格式：
Anime style, 房间内, 黄昏, 男子坐在椅子上, 身体放松, 表情疲惫, 长出一口气, 汗水滴落, 平静氛围, 静态镜头, 中景`

	userPrompt := fmt.Sprintf(`镜头信息：
%s

请直接生成尾帧的图像提示词，不要任何解释：`, contextInfo)

	// 调用AI生成
	prompt, err := s.aiService.GenerateText(userPrompt, systemPrompt)
	if err != nil {
		s.log.Warnw("AI generation failed, using fallback", "error", err)
		prompt = s.buildFallbackPrompt(sb, scene, "last frame, final state")
	}

	// 如果AI返回空字符串，使用降级方案
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		s.log.Warnw("AI returned empty prompt, using fallback", "storyboard_id", sb.ID)
		prompt = s.buildFallbackPrompt(sb, scene, "last frame, final state")
	}

	return &SingleFramePrompt{
		Prompt:      prompt,
		Description: "镜头结束画面，展示最终状态和结果",
	}
}

// generatePanelFrames 生成分镜板（多格组合）
func (s *FramePromptService) generatePanelFrames(sb models.Storyboard, scene *models.Scene, count int) *MultiFramePrompt {
	layout := fmt.Sprintf("horizontal_%d", count)

	frames := make([]SingleFramePrompt, count)

	// 固定生成：首帧 -> 关键帧 -> 尾帧
	if count == 3 {
		frames[0] = *s.generateFirstFrame(sb, scene)
		frames[0].Description = "第1格：初始状态"

		frames[1] = *s.generateKeyFrame(sb, scene)
		frames[1].Description = "第2格：动作高潮"

		frames[2] = *s.generateLastFrame(sb, scene)
		frames[2].Description = "第3格：最终状态"
	} else if count == 4 {
		// 4格：首帧 -> 中间帧1 -> 中间帧2 -> 尾帧
		frames[0] = *s.generateFirstFrame(sb, scene)
		frames[1] = *s.generateKeyFrame(sb, scene)
		frames[2] = *s.generateKeyFrame(sb, scene)
		frames[3] = *s.generateLastFrame(sb, scene)
	}

	return &MultiFramePrompt{
		Layout: layout,
		Frames: frames,
	}
}

// generateActionSequence 生成动作序列（5-8格）
func (s *FramePromptService) generateActionSequence(sb models.Storyboard, scene *models.Scene) *MultiFramePrompt {
	// 将动作分解为5个步骤
	frames := make([]SingleFramePrompt, 5)

	// 简化实现：均匀分布从首帧到尾帧
	frames[0] = *s.generateFirstFrame(sb, scene)
	frames[1] = *s.generateKeyFrame(sb, scene)
	frames[2] = *s.generateKeyFrame(sb, scene)
	frames[3] = *s.generateKeyFrame(sb, scene)
	frames[4] = *s.generateLastFrame(sb, scene)

	return &MultiFramePrompt{
		Layout: "horizontal_5",
		Frames: frames,
	}
}

// buildStoryboardContext 构建镜头上下文信息
func (s *FramePromptService) buildStoryboardContext(sb models.Storyboard, scene *models.Scene) string {
	var parts []string

	// 镜头描述（最重要）
	if sb.Description != nil && *sb.Description != "" {
		parts = append(parts, fmt.Sprintf("镜头描述: %s", *sb.Description))
	}

	// 场景信息
	if scene != nil {
		parts = append(parts, fmt.Sprintf("场景: %s, %s", scene.Location, scene.Time))
	} else if sb.Location != nil && sb.Time != nil {
		parts = append(parts, fmt.Sprintf("场景: %s, %s", *sb.Location, *sb.Time))
	}

	// 角色
	if len(sb.Characters) > 0 {
		var charNames []string
		for _, char := range sb.Characters {
			charNames = append(charNames, char.Name)
		}
		parts = append(parts, fmt.Sprintf("角色: %s", strings.Join(charNames, ", ")))
	}

	// 动作
	if sb.Action != nil && *sb.Action != "" {
		parts = append(parts, fmt.Sprintf("动作: %s", *sb.Action))
	}

	// 结果
	if sb.Result != nil && *sb.Result != "" {
		parts = append(parts, fmt.Sprintf("结果: %s", *sb.Result))
	}

	// 对白
	if sb.Dialogue != nil && *sb.Dialogue != "" {
		parts = append(parts, fmt.Sprintf("对白: %s", *sb.Dialogue))
	}

	// 氛围
	if sb.Atmosphere != nil && *sb.Atmosphere != "" {
		parts = append(parts, fmt.Sprintf("氛围: %s", *sb.Atmosphere))
	}

	// 镜头参数
	if sb.ShotType != nil {
		parts = append(parts, fmt.Sprintf("景别: %s", *sb.ShotType))
	}
	if sb.Angle != nil {
		parts = append(parts, fmt.Sprintf("角度: %s", *sb.Angle))
	}
	if sb.Movement != nil {
		parts = append(parts, fmt.Sprintf("运镜: %s", *sb.Movement))
	}

	return strings.Join(parts, "\n")
}

// buildFallbackPrompt 构建降级提示词（AI失败时使用）
func (s *FramePromptService) buildFallbackPrompt(sb models.Storyboard, scene *models.Scene, suffix string) string {
	var parts []string

	// 场景
	if scene != nil {
		parts = append(parts, fmt.Sprintf("%s, %s", scene.Location, scene.Time))
	}

	// 角色
	if len(sb.Characters) > 0 {
		for _, char := range sb.Characters {
			parts = append(parts, char.Name)
		}
	}

	// 氛围
	if sb.Atmosphere != nil {
		parts = append(parts, *sb.Atmosphere)
	}

	parts = append(parts, "anime style", suffix)
	return strings.Join(parts, ", ")
}
