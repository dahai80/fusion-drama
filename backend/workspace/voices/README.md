# Voice Library（TTS 克隆音色库）

Qwen3-TTS（`FUSION_TTS_MODEL` 指向 `mlx-community--Qwen3-TTS-12Hz-1.7B-Base-8bit`）的 Base 模型
**没有内置预设音色**，音色通过 ICL 克隆实现：每个音色一对文件——

```text
voices/<name>.wav   # 参考音频（清晰人声，5-15 秒，<15MB）
voices/<name>.txt   # 参考音频的逐字文本（ref_text，必填）
````

角色分配音色：在「角色管理」中把角色的 voice 字段填为音色名（如 `yunjian`），
或在 `novel`/剧本对白里保持角色名一致——未显式指定的角色按名字 hash 自动轮换本目录下的音色。

新增音色：放入一对 `<name>.wav` + `<name>.txt` 即可，无需重启服务。

> Kokoro TTS（默认）不用此目录——它内置多音色（zm_yunjian/zm_yunyang/zm_yunxia 等），
> 可用 `FUSION_TTS_VOICES` 覆盖音色池。
