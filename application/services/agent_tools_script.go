package services

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	models "github.com/drama-generator/backend/domain/models"
)

// --- 剧本改写 Agent Tools ---

func (s *AgentService) getScriptRewriterTools() []tool.BaseTool {
	readTool, _ := utils.InferTool(
		"read_episode_script",
		"Read the script content of an episode. Returns the raw script/novel text.",
		func(ctx context.Context, params *ReadEpisodeParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			if episodeID == 0 {
				return "", fmt.Errorf("episode_id is required")
			}
			var episode models.Episode
			if err := s.db.First(&episode, episodeID).Error; err != nil {
				return "", fmt.Errorf("episode not found")
			}
			if episode.ScriptContent == nil || *episode.ScriptContent == "" {
				return "", fmt.Errorf("episode has no script content")
			}
			return *episode.ScriptContent, nil
		},
	)

	rewriteTool, _ := utils.InferTool(
		"rewrite_to_screenplay",
		"Use AI to rewrite novel text into short drama screenplay format. The AI will transform the narrative into dialogue-driven screenplay with scene descriptions.",
		func(ctx context.Context, params *RewriteParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			var episode models.Episode
			if err := s.db.Preload("Drama").First(&episode, episodeID).Error; err != nil {
				return "", fmt.Errorf("episode not found")
			}
			if episode.ScriptContent == nil || *episode.ScriptContent == "" {
				return "", fmt.Errorf("episode has no script content")
			}

			prompt := fmt.Sprintf(`将以下小说内容改写为短剧剧本格式。
要求：
1. 保持情节核心不变
2. 增加画面感描写和角色对白
3. 使用标准剧本格式（场景标题、动作描写、对话）
4. 适合短视频拍摄（每场戏控制在30-60秒）
%s

【原始内容】
%s`, params.Instructions, *episode.ScriptContent)

			result, err := s.aiService.GenerateText(prompt, "你是专业编剧，擅长将小说改编为短剧剧本。")
			if err != nil {
				return "", fmt.Errorf("AI rewrite failed: %w", err)
			}
			return result, nil
		},
	)

	saveTool, _ := utils.InferTool(
		"save_script",
		"Save the rewritten script content to an episode in the database.",
		func(ctx context.Context, params *SaveScriptParams) (string, error) {
			episodeID := params.EpisodeID
			if episodeID == 0 {
				episodeID = getEpisodeIDFromCtx(ctx)
			}
			if episodeID == 0 {
				return "", fmt.Errorf("episode_id is required")
			}
			if err := s.db.Model(&models.Episode{}).Where("id = ?", episodeID).
				Update("script_content", params.Content).Error; err != nil {
				return "", fmt.Errorf("failed to save script: %w", err)
			}
			return fmt.Sprintf("Script saved to episode %d", episodeID), nil
		},
	)

	return []tool.BaseTool{readTool, rewriteTool, saveTool}
}

type ReadEpisodeParams struct {
	EpisodeID uint `json:"episode_id,omitempty" jsonschema:"description=Episode ID to read. If omitted uses context."`
}

type RewriteParams struct {
	EpisodeID    uint   `json:"episode_id,omitempty" jsonschema:"description=Episode ID to rewrite"`
	Instructions string `json:"instructions,omitempty" jsonschema:"description=Additional instructions for the rewrite"`
}

type SaveScriptParams struct {
	EpisodeID uint   `json:"episode_id,omitempty" jsonschema:"description=Episode ID to save to"`
	Content   string `json:"content" jsonschema:"description=The screenplay content to save"`
}
