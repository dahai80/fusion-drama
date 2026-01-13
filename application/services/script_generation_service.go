package services

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/drama-generator/backend/domain/models"
	"github.com/drama-generator/backend/pkg/ai"
	"github.com/drama-generator/backend/pkg/logger"
	"github.com/drama-generator/backend/pkg/utils"
	"gorm.io/gorm"
)

type ScriptGenerationService struct {
	db        *gorm.DB
	aiService *AIService
	log       *logger.Logger
}

func NewScriptGenerationService(db *gorm.DB, log *logger.Logger) *ScriptGenerationService {
	return &ScriptGenerationService{
		db:        db,
		aiService: NewAIService(db, log),
		log:       log,
	}
}

type GenerateOutlineRequest struct {
	DramaID     string  `json:"drama_id" binding:"required"`
	Theme       string  `json:"theme" binding:"required,min=2,max=500"`
	Genre       string  `json:"genre"`
	Style       string  `json:"style"`
	Length      int     `json:"length"`
	Temperature float64 `json:"temperature"`
}

type GenerateCharactersRequest struct {
	DramaID     string  `json:"drama_id" binding:"required"`
	Outline     string  `json:"outline"`
	Count       int     `json:"count"`
	Temperature float64 `json:"temperature"`
}

type GenerateEpisodesRequest struct {
	DramaID      string  `json:"drama_id" binding:"required"`
	Outline      string  `json:"outline"`
	EpisodeCount int     `json:"episode_count" binding:"required,min=1,max=100"`
	Temperature  float64 `json:"temperature"`
}

type OutlineResult struct {
	Title      string             `json:"title"`
	Summary    string             `json:"summary"`
	Genre      string             `json:"genre"`
	Tags       []string           `json:"tags"`
	Characters []CharacterOutline `json:"characters"`
	Episodes   []EpisodeOutline   `json:"episodes"`
	KeyScenes  []string           `json:"key_scenes"`
}

type CharacterOutline struct {
	Name        string `json:"name"`
	Role        string `json:"role"`
	Description string `json:"description"`
	Personality string `json:"personality"`
	Appearance  string `json:"appearance"`
}

type EpisodeOutline struct {
	EpisodeNumber int      `json:"episode_number"`
	Title         string   `json:"title"`
	Summary       string   `json:"summary"`
	Scenes        []string `json:"scenes"`
	Duration      int      `json:"duration"`
}

func (s *ScriptGenerationService) GenerateOutline(req *GenerateOutlineRequest) (*OutlineResult, error) {
	var drama models.Drama
	if err := s.db.Where("id = ?", req.DramaID).First(&drama).Error; err != nil {
		return nil, fmt.Errorf("drama not found")
	}

	systemPrompt := `你是专业短剧编剧。根据主题和剧集数量，创作完整的短剧大纲，规划好每一集的剧情走向。

要求：
1. 剧情紧凑，矛盾冲突强烈，节奏快
2. 必须规划好每一集的核心剧情
3. 每集有明确冲突和转折点，集与集之间有连贯性和悬念

**重要：必须输出完整有效的JSON，确保所有字段完整，特别是episodes数组必须完整闭合！**

JSON格式（紧凑，summary和episodes字段必须完整）：
{"title":"剧名","summary":"200-250字剧情概述，包含故事背景、主要矛盾、核心冲突、完整走向","genre":"类型","tags":["标签1","标签2","标签3"],"episodes":[{"episode_number":1,"title":"标题","summary":"80字剧情概要"},{"episode_number":2,"title":"标题","summary":"80字剧情概要"}],"key_scenes":["场景1","场景2","场景3"]}

关键要求：
- summary控制在200-250字，简洁清晰
- episodes必须生成用户要求的完整集数
- 每集summary控制在80字左右
- 确保JSON完整闭合，不要截断
- 不要添加任何JSON外的文字说明`

	userPrompt := fmt.Sprintf(`请为以下主题创作短剧大纲：

主题：%s`, req.Theme)

	if req.Genre != "" {
		userPrompt += fmt.Sprintf("\n类型偏好：%s", req.Genre)
	}

	if req.Style != "" {
		userPrompt += fmt.Sprintf("\n风格要求：%s", req.Style)
	}

	length := req.Length
	if length == 0 {
		length = 5
	}
	userPrompt += fmt.Sprintf("\n剧集数量：%d集", length)
	userPrompt += fmt.Sprintf("\n\n**重要：必须在episodes数组中规划完整的%d集剧情，每集都要有明确的故事内容！**", length)

	temperature := req.Temperature
	if temperature == 0 {
		temperature = 0.8
	}

	// 调整token限制：基础2000 + 每集约150 tokens（包含80-100字概要）
	maxTokens := 2000 + (length * 150)
	if maxTokens > 8000 {
		maxTokens = 8000
	}

	s.log.Infow("Generating outline with episodes",
		"episode_count", length,
		"max_tokens", maxTokens)

	text, err := s.aiService.GenerateText(
		userPrompt,
		systemPrompt,
		ai.WithTemperature(temperature),
		ai.WithMaxTokens(maxTokens),
	)

	if err != nil {
		s.log.Errorw("Failed to generate outline", "error", err)
		return nil, fmt.Errorf("生成失败: %w", err)
	}

	s.log.Infow("AI response received", "length", len(text), "preview", text[:minInt(200, len(text))])

	var result OutlineResult
	if err := utils.SafeParseAIJSON(text, &result); err != nil {
		s.log.Errorw("Failed to parse outline JSON", "error", err, "raw_response", text[:minInt(500, len(text))])
		return nil, fmt.Errorf("解析 AI 返回结果失败: %w", err)
	}

	// 将Tags转换为JSON格式存储
	tagsJSON, err := json.Marshal(result.Tags)
	if err != nil {
		s.log.Errorw("Failed to marshal tags", "error", err)
		tagsJSON = []byte("[]")
	}

	if err := s.db.Model(&drama).Updates(map[string]interface{}{
		"title":       result.Title,
		"description": result.Summary,
		"genre":       result.Genre,
		"tags":        tagsJSON,
	}).Error; err != nil {
		s.log.Errorw("Failed to update drama", "error", err)
	}

	s.log.Infow("Outline generated", "drama_id", req.DramaID)
	return &result, nil
}

func (s *ScriptGenerationService) GenerateCharacters(req *GenerateCharactersRequest) ([]models.Character, error) {
	var drama models.Drama
	if err := s.db.Where("id = ? ", req.DramaID).First(&drama).Error; err != nil {
		return nil, fmt.Errorf("drama not found")
	}

	count := req.Count
	if count == 0 {
		count = 5
	}

	systemPrompt := `你是一个专业的角色分析师，擅长从剧本中提取和分析角色信息。

你的任务是根据提供的剧本内容，提取并整理剧中出现的所有角色的详细设定。

要求：
1. 仔细阅读剧本，识别所有出现的角色
2. 根据剧本中的对话、行为和描述，总结角色的性格特点
3. 提取角色在剧本中的关键信息：背景、动机、目标、关系等
4. 角色之间的关系必须基于剧本中的实际描述
5. 外貌描述必须极其详细，如果剧本中有描述则使用，如果没有则根据角色设定合理推断，便于AI绘画生成角色形象
6. 优先提取主要角色和重要配角，次要角色可以简略

请严格按照以下 JSON 格式输出，不要添加任何其他文字：

{
  "characters": [
    {
      "name": "角色名",
      "role": "主角/重要配角/配角",
      "description": "角色背景和简介（200-300字，包括：出身背景、成长经历、核心动机、与其他角色的关系、在故事中的作用）",
      "personality": "性格特点（详细描述，100-150字，包括：主要性格特征、行为习惯、价值观、优点缺点、情绪表达方式、对待他人的态度等）",
      "appearance": "外貌描述（极其详细，150-200字，必须包括：确切年龄、精确身高、体型身材、肤色质感、发型发色发长、眼睛颜色形状、面部特征（如眉毛、鼻子、嘴唇）、着装风格、服装颜色材质、配饰细节、标志性特征、整体气质风格等，描述要具体到可以直接用于AI绘画）",
      "voice_style": "说话风格和语气特点（详细描述，50-80字，包括：语速语调、用词习惯、口头禅、说话时的情绪特征等）"
    }
  ]
}

注意：
- 必须基于剧本内容提取角色，不要凭空创作
- 优先提取主要角色和重要配角，数量根据剧本实际情况确定
- description、personality、appearance、voice_style都必须详细描述，字数要充足
- appearance外貌描述是重中之重，必须极其详细具体，要能让AI准确生成角色形象
- 如果剧本中角色信息不完整，可以根据角色设定合理补充，但要符合剧本整体风格`

	outlineText := req.Outline
	if outlineText == "" {
		outlineText = fmt.Sprintf("剧名：%s\n简介：%s\n类型：%s", drama.Title, drama.Description, drama.Genre)
	}

	userPrompt := fmt.Sprintf(`剧本内容：
%s

请从剧本中提取并整理最多 %d 个主要角色的详细设定。`, outlineText, count)

	temperature := req.Temperature
	if temperature == 0 {
		temperature = 0.7
	}

	text, err := s.aiService.GenerateText(
		userPrompt,
		systemPrompt,
		ai.WithTemperature(temperature),
		ai.WithMaxTokens(3000),
	)

	if err != nil {
		s.log.Errorw("Failed to generate characters", "error", err)
		return nil, fmt.Errorf("生成失败: %w", err)
	}

	s.log.Infow("AI response received", "length", len(text), "preview", text[:minInt(200, len(text))])

	var result struct {
		Characters []struct {
			Name        string `json:"name"`
			Role        string `json:"role"`
			Description string `json:"description"`
			Personality string `json:"personality"`
			Appearance  string `json:"appearance"`
			VoiceStyle  string `json:"voice_style"`
		} `json:"characters"`
	}

	if err := utils.SafeParseAIJSON(text, &result); err != nil {
		s.log.Errorw("Failed to parse characters JSON", "error", err, "raw_response", text[:minInt(500, len(text))])
		return nil, fmt.Errorf("解析 AI 返回结果失败: %w", err)
	}

	var characters []models.Character
	for _, char := range result.Characters {
		// 检查角色是否已存在
		var existingChar models.Character
		err := s.db.Where("drama_id = ? AND name = ?", req.DramaID, char.Name).First(&existingChar).Error
		if err == nil {
			// 角色已存在，直接使用已存在的角色，不覆盖
			s.log.Infow("Character already exists, skipping", "drama_id", req.DramaID, "name", char.Name)
			characters = append(characters, existingChar)
			continue
		}

		// 角色不存在，创建新角色
		dramaID, _ := strconv.ParseUint(req.DramaID, 10, 32)
		character := models.Character{
			DramaID:     uint(dramaID),
			Name:        char.Name,
			Role:        &char.Role,
			Description: &char.Description,
			Personality: &char.Personality,
			Appearance:  &char.Appearance,
			VoiceStyle:  &char.VoiceStyle,
		}

		if err := s.db.Create(&character).Error; err != nil {
			s.log.Errorw("Failed to create character", "error", err)
			continue
		}

		characters = append(characters, character)
	}

	s.log.Infow("Characters generated", "drama_id", req.DramaID, "total_count", len(characters), "new_count", len(characters))
	return characters, nil
}

func (s *ScriptGenerationService) GenerateEpisodes(req *GenerateEpisodesRequest) ([]models.Episode, error) {
	var drama models.Drama
	if err := s.db.Where("id = ? ", req.DramaID).First(&drama).Error; err != nil {
		return nil, fmt.Errorf("drama not found")
	}

	// 获取角色信息
	var characters []models.Character
	s.db.Where("drama_id = ?", req.DramaID).Find(&characters)

	var characterList string
	if len(characters) > 0 {
		characterList = "\n角色设定：\n"
		for _, char := range characters {
			characterList += fmt.Sprintf("- %s", char.Name)
			if char.Role != nil {
				characterList += fmt.Sprintf("（%s）", *char.Role)
			}
			if char.Description != nil {
				characterList += fmt.Sprintf("：%s", *char.Description)
			}
			if char.Personality != nil {
				characterList += fmt.Sprintf(" | 性格：%s", *char.Personality)
			}
			characterList += "\n"
		}
	} else {
		characterList = "\n（注意：尚未设定角色，请根据大纲创作合理的角色出场）\n"
	}

	systemPrompt := `你是一个专业的短剧编剧。你擅长根据分集规划创作详细的剧情内容。

你的任务是根据大纲中的分集规划，将每一集的概要扩展为详细的剧情叙述。每集约180秒（3分钟），需要充实的内容。

工作流程：
1. 大纲中已提供每集的剧情规划（80-100字概要）
2. 你需要将每集概要扩展为400-500字的详细剧情叙述
3. 严格按照分集规划的数量和走向展开，不能遗漏任何一集

详细要求：
1. script_content用400-500字详细叙述，包括：
   - 具体场景和环境描写
   - 角色的行动、对话要点、情绪变化
   - 冲突的产生过程和激化细节
   - 关键情节点和转折
   - 为下一集埋下的伏笔
2. 每集有明确的冲突和转折点
3. 集与集之间有连贯性和悬念
4. 充分展现角色性格和关系演变
5. 内容详实，足以支撑180秒时长

JSON格式（紧凑）：
{"episodes":[{"episode_number":1,"title":"标题","description":"简短梗概","script_content":"400-500字详细剧情叙述","duration":210}]}

格式说明：
1. script_content为叙述文，不是场景对话格式
2. 每集包含开场铺垫、冲突发展、高潮转折、结局悬念
3. duration根据剧情复杂度设置在150-300秒

关键要求：
- 大纲规划了几集就必须生成几集
- 严格按照分集规划的故事线展开
- 每一集都要有完整的400-500字详细内容
- 绝对不能遗漏任何一集`

	outlineText := req.Outline
	if outlineText == "" {
		outlineText = fmt.Sprintf("剧名：%s\n简介：%s\n类型：%s", drama.Title, drama.Description, drama.Genre)
	}

	userPrompt := fmt.Sprintf(`剧本大纲：
%s
%s
请基于以上大纲和角色，创作 %d 集的详细剧本。

**重要要求：**
- 必须生成完整的 %d 集，从第1集到第%d集，不能遗漏
- 每集约3-5分钟（150-300秒）
- 每集的duration字段要根据剧本内容长度合理设置，不要都设置为同一个值
- 返回的JSON中episodes数组必须包含 %d 个元素`, outlineText, characterList, req.EpisodeCount, req.EpisodeCount, req.EpisodeCount, req.EpisodeCount)

	temperature := req.Temperature
	if temperature == 0 {
		temperature = 0.7
	}

	// 根据剧集数量调整token限制
	// 模型支持128k上下文，每集400-500字约需800-1000 tokens（包含JSON结构）
	baseTokens := 3000      // 基础（系统提示+角色列表+大纲）
	perEpisodeTokens := 900 // 每集约900 tokens（支持400-500字详细内容）
	maxTokens := baseTokens + (req.EpisodeCount * perEpisodeTokens)

	// 128k上下文，可以设置较大的token限制
	// 10集约12000 tokens，20集约21000 tokens，都在安全范围内
	if maxTokens > 32000 {
		maxTokens = 32000 // 保守限制在32k，留足够空间
	}

	s.log.Infow("Generating episodes with token limit",
		"episode_count", req.EpisodeCount,
		"max_tokens", maxTokens,
		"estimated_per_episode", perEpisodeTokens)

	text, err := s.aiService.GenerateText(
		userPrompt,
		systemPrompt,
		ai.WithTemperature(0.8),
		ai.WithMaxTokens(maxTokens),
	)

	if err != nil {
		s.log.Errorw("Failed to generate episodes", "error", err)
		return nil, fmt.Errorf("生成失败: %w", err)
	}

	s.log.Infow("AI response received", "length", len(text), "preview", text[:minInt(200, len(text))])

	var result struct {
		Episodes []struct {
			EpisodeNumber int    `json:"episode_number"`
			Title         string `json:"title"`
			Description   string `json:"description"`
			ScriptContent string `json:"script_content"`
			Duration      int    `json:"duration"`
		} `json:"episodes"`
	}

	if err := utils.SafeParseAIJSON(text, &result); err != nil {
		s.log.Errorw("Failed to parse episodes JSON", "error", err, "raw_response", text[:minInt(500, len(text))])
		return nil, fmt.Errorf("解析 AI 返回结果失败: %w", err)
	}

	// 检查生成的集数是否符合要求
	if len(result.Episodes) < req.EpisodeCount {
		s.log.Warnw("AI generated fewer episodes than requested",
			"requested", req.EpisodeCount,
			"generated", len(result.Episodes))
	}

	// 记录每集的详细信息
	for i, ep := range result.Episodes {
		s.log.Infow("Episode parsed from AI",
			"index", i,
			"episode_number", ep.EpisodeNumber,
			"title", ep.Title,
			"description_length", len(ep.Description),
			"script_content_length", len(ep.ScriptContent),
			"duration", ep.Duration)
	}

	var episodes []models.Episode
	for _, ep := range result.Episodes {
		duration := ep.Duration
		if duration == 0 {
			// AI未返回时长时使用默认值
			duration = 180
			s.log.Warnw("Episode duration not provided by AI, using default",
				"episode_number", ep.EpisodeNumber,
				"default_duration", 180)
		} else {
			s.log.Infow("Episode duration from AI",
				"episode_number", ep.EpisodeNumber,
				"duration", duration)
		}

		// 记录即将保存的数据
		s.log.Infow("Creating episode in database",
			"episode_number", ep.EpisodeNumber,
			"title", ep.Title,
			"script_content_length", len(ep.ScriptContent),
			"script_content_empty", ep.ScriptContent == "")

		dramaID, err := strconv.ParseUint(req.DramaID, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("invalid drama ID")
		}

		episode := models.Episode{
			DramaID:       uint(dramaID),
			EpisodeNum:    ep.EpisodeNumber,
			Title:         ep.Title,
			Description:   &ep.Description,
			ScriptContent: &ep.ScriptContent,
			Duration:      duration,
			Status:        "draft",
		}

		if err := s.db.Create(&episode).Error; err != nil {
			s.log.Errorw("Failed to create episode", "error", err)
			continue
		}

		episodes = append(episodes, episode)
	}

	s.log.Infow("Episodes generated", "drama_id", req.DramaID, "count", len(episodes))
	return episodes, nil
}

// GenerateScenesForEpisode 已废弃，使用 StoryboardService.GenerateStoryboard 替代
// ParseScript 已废弃，使用 GenerateCharacters 替代

// minInt 返回两个整数中较小的一个
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
