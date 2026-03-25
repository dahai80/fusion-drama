package services

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	models "github.com/drama-generator/backend/domain/models"
)

// --- 风格分析 Agent Tools ---

func (s *AgentService) getStyleAnalyzerTools() []tool.BaseTool {
	readTool, _ := utils.InferTool(
		"read_episode_content",
		"Read the script content and metadata of an episode for style analysis.",
		func(ctx context.Context, params *StyleAnalysisParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			var episode models.Episode
			if err := s.db.Preload("Drama").First(&episode, episodeID).Error; err != nil {
				return "", fmt.Errorf("episode not found")
			}
			content := ""
			if episode.ScriptContent != nil {
				content = *episode.ScriptContent
			}
			// 截断过长内容
			if len(content) > 5000 {
				content = content[:5000] + "...[truncated]"
			}
			return toJSON(map[string]interface{}{
				"episode_id":    episode.ID,
				"title":         episode.Title,
				"current_style": episode.Drama.Style,
				"genre":         episode.Drama.Genre,
				"script":        content,
			}), nil
		},
	)

	updateStyleTool, _ := utils.InferTool(
		"update_drama_style",
		"Update the visual style of a drama. Valid styles: realistic, ghibli, anime, watercolor, comic, cinematic, noir, fantasy.",
		func(ctx context.Context, params *UpdateStyleParams) (string, error) {
			dramaID := params.DramaID
			if dramaID == 0 {
				dramaID = getDramaIDFromCtx(ctx)
			}
			if err := s.db.Model(&models.Drama{}).Where("id = ?", dramaID).
				Update("style", params.Style).Error; err != nil {
				return "", fmt.Errorf("failed to update style: %w", err)
			}
			return fmt.Sprintf("Drama %d style updated to '%s'", dramaID, params.Style), nil
		},
	)

	return []tool.BaseTool{readTool, updateStyleTool}
}

// --- 角色音色分配 Agent Tools ---

func (s *AgentService) getVoiceAssignerTools() []tool.BaseTool {
	getCharsTool, _ := utils.InferTool(
		"get_characters",
		"Get all characters of a drama with their current information including voice_style.",
		func(ctx context.Context, params *VoiceCharParams) (string, error) {
			dramaID := params.DramaID
			if dramaID == 0 {
				dramaID = getDramaIDFromCtx(ctx)
			}
			var characters []models.Character
			if err := s.db.Where("drama_id = ?", dramaID).Find(&characters).Error; err != nil {
				return "", fmt.Errorf("failed to get characters")
			}
			var result []map[string]interface{}
			for _, c := range characters {
				item := map[string]interface{}{
					"id":   c.ID,
					"name": c.Name,
				}
				if c.Role != nil {
					item["role"] = *c.Role
				}
				if c.Personality != nil {
					item["personality"] = *c.Personality
				}
				if c.Description != nil {
					item["description"] = *c.Description
				}
				if c.VoiceStyle != nil {
					item["voice_style"] = *c.VoiceStyle
				}
				result = append(result, item)
			}
			return toJSON(result), nil
		},
	)

	assignTool, _ := utils.InferTool(
		"assign_voice",
		"Assign a voice style to a character. The voice_style should describe the voice characteristics.",
		func(ctx context.Context, params *AssignVoiceParams) (string, error) {
			if params.CharacterID == 0 {
				return "", fmt.Errorf("character_id is required")
			}
			if err := s.db.Model(&models.Character{}).Where("id = ?", params.CharacterID).
				Update("voice_style", params.VoiceStyle).Error; err != nil {
				return "", fmt.Errorf("failed to assign voice: %w", err)
			}
			return fmt.Sprintf("Voice style '%s' assigned to character %d", params.VoiceStyle, params.CharacterID), nil
		},
	)

	listVoicesTool, _ := utils.InferTool(
		"list_voices",
		"List available voice styles/types that can be assigned to characters.",
		func(ctx context.Context, params *EmptyParams) (string, error) {
			voices := []map[string]string{
				{"id": "male_youth", "name": "少年音", "description": "年轻男性，清亮有活力"},
				{"id": "male_adult", "name": "青年男音", "description": "成熟男性，稳重有磁性"},
				{"id": "male_deep", "name": "低沉男音", "description": "中年男性，深沉浑厚"},
				{"id": "male_elder", "name": "老年男音", "description": "年迈男性，沧桑沉稳"},
				{"id": "female_loli", "name": "萝莉音", "description": "年幼女性，甜美可爱"},
				{"id": "female_youth", "name": "少女音", "description": "年轻女性，清新甜美"},
				{"id": "female_adult", "name": "御姐音", "description": "成熟女性，知性优雅"},
				{"id": "female_elder", "name": "老年女音", "description": "年迈女性，慈祥温和"},
				{"id": "narrator", "name": "旁白音", "description": "中性旁白，清晰沉稳"},
			}
			return toJSON(voices), nil
		},
	)

	return []tool.BaseTool{getCharsTool, assignTool, listVoicesTool}
}

type StyleAnalysisParams struct {
	EpisodeID uint `json:"episode_id,omitempty" jsonschema:"description=Episode ID to analyze"`
}

type UpdateStyleParams struct {
	DramaID uint   `json:"drama_id,omitempty" jsonschema:"description=Drama ID to update"`
	Style   string `json:"style" jsonschema:"description=Visual style to set (realistic/ghibli/anime/watercolor/comic/cinematic/noir/fantasy)"`
}

type VoiceCharParams struct {
	DramaID uint `json:"drama_id,omitempty" jsonschema:"description=Drama ID to get characters from"`
}

type AssignVoiceParams struct {
	CharacterID uint   `json:"character_id" jsonschema:"description=Character ID to assign voice to"`
	VoiceStyle  string `json:"voice_style" jsonschema:"description=Voice style description or ID"`
}

type EmptyParams struct{}
