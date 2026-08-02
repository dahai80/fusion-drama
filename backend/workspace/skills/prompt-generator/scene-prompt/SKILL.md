---
name: scene-prompt
description: 场景最终提示词规范 — 固定视角 + 前景/中景/后景分层构图
---

# 场景最终提示词（固定视角 · 前中后景）

生成的是一张固定机位广角场景图（establishing shot），明确前景、中景、后景三层空间纵深。

## 必备要素

```
fixed camera wide shot, layered composition with foreground, midground and background
```

## 生成规则

- 以 `location`（地点）+ `time`（时间段）为基础，`prompt` 交代陈设与年代质感
- `lighting` 决定光影氛围，明确前、中、后景三层空间纵深
- 无人物纯场景
- 单段连贯英文，包含 `cinematic quality`
- 避免出现文字、签名、水印
- 保存工具：`save_scene_final_prompt`（prompt 参数不含风格词）
