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
				return "", fmt.Errorf("episode not found (id=%d)", episodeID)
			}
			// 优先返回原始内容（Content），用于改写
			// 如果没有原始内容，回退到格式化剧本（ScriptContent）
			if episode.Content != nil && *episode.Content != "" {
				return *episode.Content, nil
			}
			if episode.ScriptContent != nil && *episode.ScriptContent != "" {
				return *episode.ScriptContent, nil
			}
			return "", fmt.Errorf("episode has no content (id=%d)", episodeID)
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
				return "", fmt.Errorf("episode not found (id=%d)", episodeID)
			}
			// 优先使用原始内容（Content）作为改写输入
			var sourceContent string
			if episode.Content != nil && *episode.Content != "" {
				sourceContent = *episode.Content
			} else if episode.ScriptContent != nil && *episode.ScriptContent != "" {
				sourceContent = *episode.ScriptContent
			} else {
				return "", fmt.Errorf("episode has no content to rewrite (id=%d)", episodeID)
			}

			prompt := fmt.Sprintf(`将以下内容改写为格式化剧本。

要求：
1. 保持情节核心不变
2. 增强画面感描写和角色对白
3. 严格按以下格式输出，不要输出任何镜头语言（景别、角度、运镜等属于分镜拆解步骤）
4. 每个场景 30-60 秒内容，适合短视频

格式规范：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落
- 对白：角色名：（状态/表情）台词内容

示例：
## S01 | 内景 · 咖啡厅 | 黄昏

黄昏的光线透过落地窗洒进咖啡厅，吧台上咖啡杯热气升腾。

小明独自坐在角落卡座，低头看手机，神情有些焦虑。

门铃响起，小红推门而入。她看到小明，微笑着走过去。

小红：（微笑）等很久了吗？
小明：（抬头）还好，刚到。

## S02 | 外景 · 街道 | 夜晚

路灯映着两人的身影，秋风吹落几片树叶。

小红裹紧围巾，脚步慢了下来。

小红：（低头）其实我今天来，是想跟你说一件事。

%s

【原始内容】
%s`, params.Instructions, sourceContent)

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
