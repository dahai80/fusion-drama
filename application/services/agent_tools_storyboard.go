package services

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	models "github.com/drama-generator/backend/domain/models"
)

// --- 分镜拆解 Agent Tools ---

func (s *AgentService) getStoryboardBreakerTools() []tool.BaseTool {
	generateTool, _ := utils.InferTool(
		"generate_storyboard",
		"Generate a storyboard (shot-by-shot breakdown) from an episode's script using AI. Saves storyboards to the database.",
		func(ctx context.Context, params *StoryboardGenParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			storyboards, err := s.storyboardService.GenerateStoryboardDirect(fmt.Sprintf("%d", episodeID))
			if err != nil {
				return "", fmt.Errorf("storyboard generation failed: %w", err)
			}
			totalDuration := 0
			for _, sb := range storyboards {
				totalDuration += sb.Duration
			}
			return toJSON(map[string]interface{}{
				"count":          len(storyboards),
				"total_duration": totalDuration,
				"storyboards":    formatStoryboardSummary(storyboards),
			}), nil
		},
	)

	updateTool, _ := utils.InferTool(
		"update_storyboard",
		"Update a specific field of a storyboard shot.",
		func(ctx context.Context, params *UpdateStoryboardParams) (string, error) {
			updates := map[string]interface{}{}
			if params.Title != nil {
				updates["title"] = *params.Title
			}
			if params.ShotType != nil {
				updates["shot_type"] = *params.ShotType
			}
			if params.Angle != nil {
				updates["angle"] = *params.Angle
			}
			if params.Movement != nil {
				updates["movement"] = *params.Movement
			}
			if params.Action != nil {
				updates["action"] = *params.Action
			}
			if params.Dialogue != nil {
				updates["dialogue"] = *params.Dialogue
			}
			if params.Duration != nil {
				updates["duration"] = *params.Duration
			}
			if len(updates) == 0 {
				return "", fmt.Errorf("no fields to update")
			}
			if err := s.db.Model(&models.Storyboard{}).Where("id = ?", params.StoryboardID).
				Updates(updates).Error; err != nil {
				return "", fmt.Errorf("failed to update storyboard: %w", err)
			}
			return fmt.Sprintf("Storyboard %d updated", params.StoryboardID), nil
		},
	)

	return []tool.BaseTool{generateTool, updateTool}
}

type StoryboardGenParams struct {
	EpisodeID uint `json:"episode_id,omitempty" jsonschema:"description=Episode ID to generate storyboard for"`
}

type UpdateStoryboardParams struct {
	StoryboardID uint    `json:"storyboard_id" jsonschema:"description=Storyboard ID to update"`
	Title        *string `json:"title,omitempty" jsonschema:"description=Shot title"`
	ShotType     *string `json:"shot_type,omitempty" jsonschema:"description=Shot type (close-up/medium/wide/etc)"`
	Angle        *string `json:"angle,omitempty" jsonschema:"description=Camera angle"`
	Movement     *string `json:"movement,omitempty" jsonschema:"description=Camera movement"`
	Action       *string `json:"action,omitempty" jsonschema:"description=Character action description"`
	Dialogue     *string `json:"dialogue,omitempty" jsonschema:"description=Dialogue content"`
	Duration     *int    `json:"duration,omitempty" jsonschema:"description=Shot duration in seconds"`
}

func formatStoryboardSummary(storyboards []Storyboard) []map[string]interface{} {
	var result []map[string]interface{}
	for _, sb := range storyboards {
		item := map[string]interface{}{
			"shot_number": sb.ShotNumber,
			"title":       sb.Title,
			"shot_type":   sb.ShotType,
			"duration":    sb.Duration,
		}
		if sb.Location != "" {
			item["location"] = sb.Location
		}
		if sb.Action != "" {
			item["action"] = sb.Action
		}
		result = append(result, item)
	}
	return result
}
