---
name: image-prompt-generator
description: 图片生成提示词工程指南
---

# 图片提示词生成指南

## 提示词结构

一个好的图片提示词包含：
1. **主体描述**：人物/场景的核心内容
2. **风格指定**：artistic style, cinematic, anime, etc.
3. **构图说明**：景别、视角、画面布局
4. **光影氛围**：光线方向、色温、氛围
5. **质量标签**：high quality, detailed, masterpiece

## 三种提示词类型

### 角色图片提示词
使用 `gen_character_image_prompt`，重点描述：
- 外貌特征（面部、体型、发型）
- 服装细节
- 表情和姿势
- 纯角色立绘，简洁背景

### 场景图片提示词
使用 `gen_scene_image_prompt`，重点描述：
- 环境细节（建筑、植被、天气）
- 光线和色调
- **不包含人物**
- 氛围和情绪

### 镜头画面提示词
使用 `gen_shot_image_prompt`，重点描述：
- 画面构图（景别 + 角度）
- 人物动作和表情
- 环境与人物的关系
- 情绪氛围

## 注意事项

- 所有提示词使用**英文**
- 避免抽象描述，使用具体视觉语言
- 包含负面提示词的关键排除项（如 no text, no watermark）
