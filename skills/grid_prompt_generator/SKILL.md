---
name: image-prompt-generator
description: 图片提示词生成指南 — 角色、场景两类提示词规范
---

# 图片提示词生成指南

本 SKILL 对应 `grid_prompt_generator` Agent，支持生成两类图片提示词：

1. **角色图片提示词** — 角色外貌与气质
2. **场景图片提示词** — 场景氛围与光线

详细模板见 `reference/` 目录。

---

## 角色图片提示词

参考：`reference/character-prompt.md`

### 模板结构
```
[appearance], [personality/temperament], [role], [cinematic portrait], [high quality], [consistent art style], [no text, no watermark]
```

### 生成规则
- 以 `appearance`（外貌描述）为核心
- `personality` 决定气质基调（内敛/张扬/神秘等）
- `role` 决定服装和道具风格
- 必须包含 `cinematic portrait` + `consistent art style`
- 避免出现文字、签名、水印

---

## 场景图片提示词

参考：`reference/scene-prompt.md`

### 模板结构
```
[location], [time period], [lighting atmosphere], [scene description], [cinematic scene], [high quality], [consistent art style], [no text, no watermark]
```

### 生成规则
- 以 `location`（地点）为基础
- `time` 决定光线色调（白天/夜晚/黄昏）
- 场景氛围词：atmospheric, moody, warm, cold 等
- 必须包含 `cinematic scene` + `consistent art style`
- 避免出现文字、签名、水印
