package services

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"

	models "github.com/drama-generator/backend/domain/models"
)

// --- 提示词生成 Agent Tools ---

func (s *AgentService) getPromptGeneratorTools() []tool.BaseTool {
	charPromptTool, _ := utils.InferTool(
		"gen_character_image_prompt",
		"Generate an image generation prompt for a character based on their appearance and description.",
		func(ctx context.Context, params *CharPromptParams) (string, error) {
			var char models.Character
			if err := s.db.Preload("Episodes.Drama").First(&char, params.CharacterID).Error; err != nil {
				return "", fmt.Errorf("character not found")
			}
			appearance := ""
			if char.Appearance != nil {
				appearance = *char.Appearance
			}
			desc := ""
			if char.Description != nil {
				desc = *char.Description
			}

			prompt := fmt.Sprintf(`为以下角色生成一个高质量的AI图片生成提示词（英文）。
角色名：%s
外貌描述：%s
角色描述：%s

要求：
- 使用英文
- 包含外貌特征、服装、表情、姿势
- 适合AI绘画（如DALL-E、Stable Diffusion）
- 风格：高质量、电影感`, char.Name, appearance, desc)

			result, err := s.aiService.GenerateText(prompt, "你是AI绘画提示词专家。")
			if err != nil {
				return "", fmt.Errorf("prompt generation failed: %w", err)
			}
			return result, nil
		},
	)

	scenePromptTool, _ := utils.InferTool(
		"gen_scene_image_prompt",
		"Generate an image generation prompt for a background scene.",
		func(ctx context.Context, params *ScenePromptParams) (string, error) {
			var scene models.Scene
			if err := s.db.First(&scene, params.SceneID).Error; err != nil {
				return "", fmt.Errorf("scene not found")
			}

			prompt := fmt.Sprintf(`为以下场景生成一个高质量的纯背景图片AI生成提示词（英文）。
地点：%s
时间：%s
现有提示词：%s

要求：
- 使用英文
- 纯背景场景，不包含人物
- 包含光线、色调、氛围描述
- 适合AI绘画`, scene.Location, scene.Time, scene.Prompt)

			result, err := s.aiService.GenerateText(prompt, "你是AI绘画提示词专家。")
			if err != nil {
				return "", fmt.Errorf("prompt generation failed: %w", err)
			}
			return result, nil
		},
	)

	shotPromptTool, _ := utils.InferTool(
		"gen_shot_image_prompt",
		"Generate an image generation prompt for a storyboard shot/frame.",
		func(ctx context.Context, params *ShotPromptParams) (string, error) {
			var sb models.Storyboard
			if err := s.db.Preload("Characters").Preload("Background").First(&sb, params.StoryboardID).Error; err != nil {
				return "", fmt.Errorf("storyboard not found")
			}

			// 构建角色信息
			charInfo := ""
			for _, c := range sb.Characters {
				appearance := ""
				if c.Appearance != nil {
					appearance = *c.Appearance
				}
				charInfo += fmt.Sprintf("- %s: %s\n", c.Name, appearance)
			}

			action := ""
			if sb.Action != nil {
				action = *sb.Action
			}
			result := ""
			if sb.Result != nil {
				result = *sb.Result
			}
			atmosphere := ""
			if sb.Atmosphere != nil {
				atmosphere = *sb.Atmosphere
			}
			location := ""
			if sb.Location != nil {
				location = *sb.Location
			}

			prompt := fmt.Sprintf(`为以下分镜画面生成一个高质量的AI图片生成提示词（英文）。
景别：%s | 角度：%s | 运镜：%s
地点：%s
动作：%s
画面结果：%s
氛围：%s
角色信息：
%s

要求：
- 使用英文
- 描述具体画面构图
- 包含光线、色调、风格
- 适合AI绘画`,
				derefStr(sb.ShotType), derefStr(sb.Angle), derefStr(sb.Movement),
				location, action, result, atmosphere, charInfo)

			aiResult, err := s.aiService.GenerateText(prompt, "你是AI绘画提示词专家，擅长将分镜描述转化为精准的图片生成提示词。")
			if err != nil {
				return "", fmt.Errorf("prompt generation failed: %w", err)
			}
			// 保存到 storyboard
			s.db.Model(&sb).Update("image_prompt", aiResult)
			return aiResult, nil
		},
	)

	videoPromptTool, _ := utils.InferTool(
		"gen_video_prompt",
		"Generate a video generation prompt for a storyboard shot, describing motion, camera movement, and action sequence.",
		func(ctx context.Context, params *VideoPromptParams) (string, error) {
			var sb models.Storyboard
			if err := s.db.Preload("Characters").First(&sb, params.StoryboardID).Error; err != nil {
				return "", fmt.Errorf("storyboard not found")
			}

			action := ""
			if sb.Action != nil {
				action = *sb.Action
			}
			movement := ""
			if sb.Movement != nil {
				movement = *sb.Movement
			}

			prompt := fmt.Sprintf(`为以下分镜生成一个视频生成提示词（英文），描述运动、镜头移动和动作序列。
动作：%s
运镜：%s
时长：%d秒
景别：%s

要求：
- 使用英文
- 描述动态过程（开始→中间→结束）
- 包含镜头运动方向
- 适合AI视频生成（如Sora、Runway）`,
				action, movement, sb.Duration, derefStr(sb.ShotType))

			aiResult, err := s.aiService.GenerateText(prompt, "你是AI视频提示词专家，擅长将分镜描述转化为精准的视频生成提示词。")
			if err != nil {
				return "", fmt.Errorf("prompt generation failed: %w", err)
			}
			// 保存到 storyboard
			s.db.Model(&sb).Update("video_prompt", aiResult)
			return aiResult, nil
		},
	)

	savePromptsTool, _ := utils.InferTool(
		"save_prompts",
		"Save image_prompt and/or video_prompt to a storyboard.",
		func(ctx context.Context, params *SavePromptsParams) (string, error) {
			updates := map[string]interface{}{}
			if params.ImagePrompt != nil {
				updates["image_prompt"] = *params.ImagePrompt
			}
			if params.VideoPrompt != nil {
				updates["video_prompt"] = *params.VideoPrompt
			}
			if len(updates) == 0 {
				return "", fmt.Errorf("no prompts to save")
			}
			if err := s.db.Model(&models.Storyboard{}).Where("id = ?", params.StoryboardID).
				Updates(updates).Error; err != nil {
				return "", fmt.Errorf("failed to save prompts: %w", err)
			}
			return fmt.Sprintf("Prompts saved to storyboard %d", params.StoryboardID), nil
		},
	)

	return []tool.BaseTool{charPromptTool, scenePromptTool, shotPromptTool, videoPromptTool, savePromptsTool}
}

type CharPromptParams struct {
	CharacterID uint `json:"character_id" jsonschema:"description=Character ID to generate prompt for"`
}

type ScenePromptParams struct {
	SceneID uint `json:"scene_id" jsonschema:"description=Scene ID to generate prompt for"`
}

type ShotPromptParams struct {
	StoryboardID uint `json:"storyboard_id" jsonschema:"description=Storyboard ID to generate shot image prompt for"`
}

type VideoPromptParams struct {
	StoryboardID uint `json:"storyboard_id" jsonschema:"description=Storyboard ID to generate video prompt for"`
}

type SavePromptsParams struct {
	StoryboardID uint    `json:"storyboard_id" jsonschema:"description=Storyboard ID to save prompts to"`
	ImagePrompt  *string `json:"image_prompt,omitempty" jsonschema:"description=Image generation prompt"`
	VideoPrompt  *string `json:"video_prompt,omitempty" jsonschema:"description=Video generation prompt"`
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
