---
name: video-prompt-generator
description: 视频生成提示词工程指南
---

# 视频提示词生成指南

## 视频提示词结构

视频提示词需要描述**动态过程**：
1. **起始状态**：画面开始时的样子
2. **运动过程**：发生了什么变化
3. **结束状态**：画面结束时的样子
4. **镜头运动**：摄像机如何移动

## 使用 `gen_video_prompt`

基于分镜信息生成，重点描述：
- 角色的动作序列（起始→动作→结果）
- 镜头运动方向和速度
- 环境变化（光线、天气等）
- 时长适配（3-8秒的动作量）

## 提示词示例

```
A young woman slowly turns around in a dimly lit corridor.
Camera: slow dolly forward.
She gasps as she sees a shadow moving behind the glass door.
The corridor light flickers once. Duration: 5 seconds.
```

## 注意事项

- 动作描述要具体，避免模糊（"走过来" → "从画面左侧缓步走向中央"）
- 镜头运动要与动作配合
- 控制单个镜头的动作量（5秒内最多1-2个主要动作）
