---
name: character-prompt
description: 角色最终提示词规范 — 三视图（character turnaround：正面/侧面/背面）
---

# 角色最终提示词（三视图）

生成的是一张角色三视图（character turnaround）图片：同一角色的正面、侧面、背面三个全身视图并排排列，外观完全一致。

## 必备要素

```
character turnaround sheet, three views of the same character: front view, side view and back view,
full body, white background
```

## 生成规则

- 以 `appearance`（样貌）与 `styling`（妆造）为核心：年龄感、五官、体态、发型、服装、配饰
- 三个视图外观必须完全一致，并排排列
- 单段连贯英文，包含 `cinematic quality`
- 避免出现文字、签名、水印
- 保存工具：`save_character_final_prompt`（prompt 参数不含风格词）
