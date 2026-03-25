package services

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	models "github.com/drama-generator/backend/domain/models"
)

// --- 角色场景提取 Agent Tools ---

func (s *AgentService) getExtractorTools() []tool.BaseTool {
	charTool, _ := utils.InferTool(
		"extract_characters",
		"Extract characters from an episode's script using AI. Saves extracted characters to the database and returns the list.",
		func(ctx context.Context, params *ExtractParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			characters, err := s.characterLibraryService.ExtractCharactersDirect(episodeID)
			if err != nil {
				return "", fmt.Errorf("character extraction failed: %w", err)
			}
			return toJSON(map[string]interface{}{
				"count":      len(characters),
				"characters": formatCharacters(characters),
			}), nil
		},
	)

	sceneTool, _ := utils.InferTool(
		"extract_scenes",
		"Extract background scenes from an episode's script using AI. Saves scenes to the database and returns the list.",
		func(ctx context.Context, params *ExtractParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			// 获取 drama style
			var episode models.Episode
			if err := s.db.Preload("Drama").First(&episode, episodeID).Error; err != nil {
				return "", fmt.Errorf("episode not found")
			}
			scenes, err := s.imageGenService.ExtractScenesDirect(episodeID, episode.Drama.Style)
			if err != nil {
				return "", fmt.Errorf("scene extraction failed: %w", err)
			}
			return toJSON(map[string]interface{}{
				"count":  len(scenes),
				"scenes": scenes,
			}), nil
		},
	)

	propTool, _ := utils.InferTool(
		"extract_props",
		"Extract props/objects from an episode's script using AI. Saves props to the database and returns the list.",
		func(ctx context.Context, params *ExtractParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			props, err := s.propService.ExtractPropsDirect(episodeID)
			if err != nil {
				return "", fmt.Errorf("prop extraction failed: %w", err)
			}
			return toJSON(map[string]interface{}{
				"count": len(props),
				"props": formatProps(props),
			}), nil
		},
	)

	return []tool.BaseTool{charTool, sceneTool, propTool}
}

type ExtractParams struct {
	EpisodeID uint `json:"episode_id,omitempty" jsonschema:"description=Episode ID to extract from. If omitted uses context."`
}

func formatCharacters(chars []models.Character) []map[string]interface{} {
	var result []map[string]interface{}
	for _, c := range chars {
		item := map[string]interface{}{
			"id":   c.ID,
			"name": c.Name,
		}
		if c.Role != nil {
			item["role"] = *c.Role
		}
		if c.Description != nil {
			item["description"] = *c.Description
		}
		result = append(result, item)
	}
	return result
}

func formatProps(props []models.Prop) []map[string]interface{} {
	var result []map[string]interface{}
	for _, p := range props {
		item := map[string]interface{}{
			"id":   p.ID,
			"name": p.Name,
		}
		if p.Type != nil {
			item["type"] = *p.Type
		}
		if p.Description != nil {
			item["description"] = *p.Description
		}
		result = append(result, item)
	}
	return result
}
