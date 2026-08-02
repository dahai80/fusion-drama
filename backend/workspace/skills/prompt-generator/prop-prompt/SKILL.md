---
name: prop-prompt
description: 道具最终提示词规范 — 白底单品静物（single product shot on pure white background）
---

# 道具最终提示词（白底单品静物）

生成的是一张白底单品图（product shot）：画面中只有道具本身，孤立放置在纯白背景上，**不掺杂任何其他元素**——没有其他物品、没有人物、没有场景环境、没有手部持握。

## 必备要素

```
single product photo, isolated on a pure white background,
no other objects, no people, no scenery, soft even studio lighting
```

## 生成规则

- 以道具 `name`（名称）与 `description`（物品外貌）为核心：材质、颜色、形状、大小、新旧程度、磨损痕迹等物理细节
- 单品居中完整呈现，不要裁切道具主体
- 柔和均匀的影棚光，阴影轻淡，高细节
- 只描写物品本身，不要提及剧情、角色或用途
- 单段连贯英文，不包含 `cinematic quality` 等电影感词汇（道具图是产品图不是剧照）
- 避免出现文字、签名、水印
- 保存工具：`save_prop_final_prompt`（prompt 参数不含风格词）
