/**
 * Video dialogue dubbing (TTS) — fixes LTX-2.5 joint A/V producing only ambient
 * noise with no clear dialogue
 *
 * Flow: extract "character name: line" dialogue from the storyboard video_prompt →
 * synthesize each line via fusion-mlx /v1/audio/speech (Kokoro / Qwen3-TTS) →
 * concatenate in order into one audio track → mux with the original video
 * (original track ducked to keep ambience, TTS track placed in front).
 *
 * Any failing step returns the original video path and never blocks the task main flow.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { eq } from 'drizzle-orm'
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite } from './ffmpeg.js'
import { logTaskProgress, logTaskWarn } from './task-logger.js'
import { db, schema } from '../db/index.js'

/** Reads the TTS upstream (base_url + api_key) from AI service config; returns null when missing */
async function getTtsEndpoint(): Promise<{ baseUrl: string; apiKey: string } | null> {
  try {
    const { getActiveConfig } = await import('../services/ai.js')
    // TTS has no dedicated service type; falls back to the text service config (same-origin fusion-mlx).
    // fusion-gateway v0.9.190+ already proxies /v1/audio/speech (gateway#698),
    // so text configs pointing at gateway :11432 work too — unified through the gateway, no more direct-connection detour.
    const cfg = await getActiveConfig('text')
    if (cfg?.baseUrl && cfg?.apiKey) {
      return { baseUrl: cfg.baseUrl.replace(/\/+$/, ''), apiKey: cfg.apiKey }
    }
  } catch { /* falls back to defaults when no config */ }
  return null
}

const TTS_MODEL = process.env.FUSION_TTS_MODEL || 'mlx-community--Kokoro-82M-bf16'
// Multi-speaker voice rotation pool: selected by current TTS model family — different characters get different voices, avoiding a single voice across the whole film.
const isQwen3Tts = /qwen3.*tts/i.test(TTS_MODEL)
// Kokoro built-in multi-voices (E2E verified zm_yunjian/zm_yunyang/zm_yunxia all synthesize and are distinct)
const KOKORO_TTS_VOICES = (process.env.FUSION_TTS_VOICES || 'zm_yunjian,zm_yunyang,zm_yunxia')
  .split(',').map(s => s.trim()).filter(Boolean)
// Qwen3-TTS Base has no built-in preset voices (E2E observed 400: "Base models have no built-in
// preset voices"), so voices use ICL cloning. Two-tier sources:
//   1. fusion-mlx server-side voice bundles (#1383, v0.10.16+): ~/.fusion-mlx/voices/<name>/,
//      just pass the voice name in the request, no per-request base64 (E2E measured 1.3s vs slower base64)
//   2. Local fallback workspace/voices/<name>.wav + same-named .txt (ref text), uploaded per request
const VOICES_DIR = path.join(
  process.env.WORKSPACE_PATH
    ? path.resolve(process.env.WORKSPACE_PATH)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workspace'),
  'voices',
)
/** Server-side voice bundle name set (lazy cache; empty set falls back to local when the server is unreachable) */
let serverVoiceBundles: string[] | null = null
async function listServerVoiceBundles(baseUrl: string, apiKey: string): Promise<string[]> {
  if (serverVoiceBundles) return serverVoiceBundles
  let names: string[] = []
  try {
    const res = await fetch(`${baseUrl}/v1/audio/voices`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    names = (data?.voice_bundles || []).map((v: any) => v.name).filter(Boolean)
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-server-voices-unavailable', { error: (err as Error).message })
  }
  serverVoiceBundles = names
  return names
}
/** Lists usable local clone voice names under workspace/voices (counted only when both .wav and same-named .txt exist) */
function listLocalRefVoices(): string[] {
  try {
    return fs.readdirSync(VOICES_DIR)
      .filter(f => f.endsWith('.wav'))
      .map(f => f.slice(0, -4))
      .filter(name => fs.existsSync(path.join(VOICES_DIR, `${name}.txt`)))
  } catch { return [] }
}
/** Reads one local clone voice's ref_audio(base64)+ref_text; returns null and warns when missing */
function loadRefVoice(voice: string): { ref_audio: string; ref_text: string } | null {
  try {
    const wav = fs.readFileSync(path.join(VOICES_DIR, `${voice}.wav`))
    const refText = fs.readFileSync(path.join(VOICES_DIR, `${voice}.txt`), 'utf8').trim()
    if (!refText) return null
    return { ref_audio: wav.toString('base64'), ref_text: refText }
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-ref-voice-load-failed', { voice, error: (err as Error).message })
    return null
  }
}
/** Voice pool for the current TTS model (locally synced view); models that do not understand the voice parameter return [] (voice not sent) */
function ttsVoicePool(): string[] {
  if (isQwen3Tts) return listLocalRefVoices()
  if (/kokoro/i.test(TTS_MODEL)) return KOKORO_TTS_VOICES
  return []
}
/**
 * Speaker → voice: characters.voice (explicitly specified, stable across shots/episodes)
 * takes priority; otherwise rotates the voice pool by character-name hash — the hash
 * guarantees the same character gets the same voice in different storyboards/episodes
 * (replaces the old "order of first appearance" per-shot assignment, which made the
 * same character change voice across shots). The pool can be injected by callers
 * (merged with server-side voice bundles for qwen3).
 */
export function voiceForSpeaker(speaker: string, characterVoices: Map<string, string>, poolOverride?: string[]): string {
  const explicit = characterVoices.get(speaker)
  if (explicit) return explicit
  const pool = poolOverride ?? ttsVoicePool()
  if (!pool.length) return ''
  let h = 0
  for (let i = 0; i < speaker.length; i++) h = ((h << 5) - h + speaker.charCodeAt(i)) | 0
  return pool[Math.abs(h) % pool.length]
}
// When FUSION_TTS_VOICE is explicitly set, the whole film uses one voice (overrides rotation, keeps legacy behavior)
const TTS_VOICE = process.env.FUSION_TTS_VOICE || ''

export interface DialogueLine {
  speaker: string
  text: string
}

/**
 * Extracts dialogue (speaker + line) from the storyboard prompt.
 * The anchor is 说：「line」 (Chinese "says:" + quoted line) — i18n: user-facing (anchor
 * terms are verbatim LLM-output text, see the example below) — the LLM commonly generates
 * `@孙悟空跪在祖师面前，连连叩头，说：「台词」` // i18n: user-facing (verbatim LLM output example)
 * with action descriptions between the name and the dialogue marker, so the name is not required to
 * immediately precede it. Speaker resolution order:
 *   1. If knownSpeakers (storyboard-bound character names) is provided, look backwards
 *      for the nearest @known-character (matched by descending name length to avoid
 *      the short name truncating the long one) — multiple lines of the same character with
 *      different interleaved actions still map stably to the same speaker → same voice (bug2).
 *   2. Fallback: legacy format `@?角色名说` (name immediately before the marker, no action in between). // i18n: user-facing
 *   3. Final fallback speaker=「角色」 (generic "character"). // i18n: user-facing
 * Per-line cap of 60 chars; returns a deduplicated line list in order of appearance (max 3).
 */
export function extractDialogue(
  videoPrompt: string | null | undefined,
  knownSpeakers: string[] = [],
): DialogueLine[] {
  if (!videoPrompt) return []
  const out: DialogueLine[] = []
  const seen = new Set<string>()
  const speakers = [...knownSpeakers].filter(Boolean).sort((a, b) => b.length - a.length)
  // Anchor: 说[：:]「line」 / 说："line" / 说：'line' (line 2-60 chars) // i18n: user-facing
  // i18n: user-facing (regex parses Chinese dialogue generated by the LLM)
  const lineRe = /说[：:]\s*[「"']([^」"']{2,60})[」"']/g
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(videoPrompt)) !== null) {
    const text = m[1].trim()
    if (!text || seen.has(text)) continue
    // Search for @character-name only within the current line containing the dialogue marker — a cross-line
    // lastIndexOf would mismatch an @character-name from the previous line to the current
    // line's dialogue (@Puti-Zushi appears in the previous line's medium-shot description
    // while the current line is actually @Wukong speaking).
    const lineStart = videoPrompt.lastIndexOf('\n', m.index) + 1
    const lineSeg = videoPrompt.slice(lineStart, m.index)
    let speaker = ''
    if (speakers.length) {
      // Match by descending name length (avoids the short name truncating the long one); lastIndexOf picks the nearest one on the line
      for (const sp of speakers) {
        if (lineSeg.lastIndexOf('@' + sp) >= 0) { speaker = sp; break }
      }
    }
    if (!speaker) {
      // Fallback: legacy format @?character-name immediately before the dialogue marker (no action description in between)
      // i18n: user-facing (regex matches Chinese character names in LLM output)
      const direct = lineSeg.match(/(@?[一-鿿\w·]{1,12})\s*$/)
      if (direct) speaker = direct[1].replace(/^@/, '').trim()
    }
    if (!speaker) speaker = '角色' // i18n: user-facing (fallback speaker label in Chinese prompts)
    seen.add(text)
    out.push({ speaker, text })
    if (out.length >= 3) break
  }

  // Pattern 2: "speaker: (action) line" — no dialogue marker + quote-bracket wrapping; a common format from direct LLM storyboard breakdown
  // Matches "Wukong: (frowning) we shall wait here...", not "3s scene: dusk..." (no brackets)
  if (out.length < 3) {
    // i18n: user-facing (regex parses Chinese storyboard lines generated by the LLM)
    const lineRe2 = /([一-鿿·]{1,12})[：:]\s*[（(]([^）)]*)[）)]\s*([^\n]{2,80})/g
    while ((m = lineRe2.exec(videoPrompt)) !== null) {
      const speaker = m[1].trim()
      const text = m[3].trim()
      if (!text || seen.has(text)) continue
      // i18n: user-facing (regex filters Chinese narrator/time/location pseudo-speakers in LLM output)
      if (/秒.*画面|旁白|时间|地点/.test(speaker)) continue
      // Exact known-character-name match takes priority (avoids the short name truncating the long one)
      let matchedSpeaker = speaker
      if (speakers.length) {
        for (const sp of speakers) {
          if (sp.endsWith(speaker) || speaker.endsWith(sp)) { matchedSpeaker = sp; break }
        }
      }
      seen.add(text)
      out.push({ speaker: matchedSpeaker, text })
      if (out.length >= 3) break
    }
  }

  return out
}

/** Looks up storyboard-bound characters (name + fixed voice), used for exact @character-name matching and cross-shot voice consistency. */
async function getStoryboardSpeakers(storyboardId?: number): Promise<{ names: string[]; voices: Map<string, string> }> {
  if (!storyboardId) return { names: [], voices: new Map() }
  try {
    const rows = await db
      .select({ name: schema.characters.name, voice: schema.characters.voice })
      .from(schema.storyboardCharacters)
      .innerJoin(
        schema.characters,
        eq(schema.characters.id, schema.storyboardCharacters.characterId),
      )
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    const names = rows.map(r => r.name).filter(Boolean)
    const voices = new Map<string, string>()
    for (const r of rows) {
      if (r.name && r.voice) voices.set(r.name, r.voice)
    }
    return { names, voices }
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-speakers-query-failed', { storyboardId, error: (err as Error).message })
    return { names: [], voices: new Map() }
  }
}

/** Probes file duration in seconds via ffprobe; returns 0 on failure */
async function probeDuration(absPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg(absPath).ffprobe((err, data) => {
      if (err || !data?.format?.duration) return resolve(0)
      resolve(Number(data.format.duration) || 0)
    })
  })
}

/** Calls TTS to synthesize one dialogue line; returns the temp wav file path */
async function synthesizeLine(text: string, idx: number, voice: string, serverVoices?: Set<string>): Promise<string | null> {
  const ep = await getTtsEndpoint()
  // API key env uses the canonical name (config-conventions §1); the legacy MLX key alias has been consolidated
  const baseUrl = ep?.baseUrl || process.env.FUSION_MLX_BASE_URL || 'http://127.0.0.1:11432'
  const apiKey = ep?.apiKey || process.env.FUSION_CLIENT_KEY || ''
  const attempt = async (): Promise<string | null> => {
    // Qwen3-TTS Base: on server-side voice bundle (#1383) hit → pass the voice name directly (no base64);
    // otherwise clone from local workspace/voices (ref_audio+ref_text uploaded with the request)
    const isServerVoice = isQwen3Tts && voice && serverVoices?.has(voice)
    const refVoice = isQwen3Tts && voice && !isServerVoice ? loadRefVoice(voice) : null
    if (isQwen3Tts && voice && !isServerVoice && !refVoice) {
      logTaskWarn('VideoTask', 'tts-ref-voice-missing', { idx, voice, voicesDir: VOICES_DIR })
    }
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        // voice is produced by voiceForSpeaker from the model's voice pool: Kokoro passes a built-in voice name;
        // Qwen3-TTS Base passes a server bundle voice name / ref params for local clones;
        // omitted when the pool is empty (models that do not understand voice)
        ...(refVoice ? { ref_audio: refVoice.ref_audio, ref_text: refVoice.ref_text }
          : voice && (!isQwen3Tts || isServerVoice) ? { voice } : {}),
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(280_000),
    })
    if (!res.ok) {
      logTaskWarn('VideoTask', 'tts-line-failed', { idx, status: res.status })
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fd-tts-')), `line-${idx}.wav`)
    fs.writeFileSync(tmp, buf)
    return tmp
  }
  try {
    // fusion-mlx recommends retrying once (the first request may hang due to model cold load / memory eviction)
    return await attempt() ?? await attempt()
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-line-error', { idx, error: (err as Error).message })
    return null
  }
}

/**
 * Dubs a video: synthesizes TTS when dialogue exists and replaces/mixes into the original track.
 * Returns the original relativePath on success (overwrites the processed file in place);
 * returns null when there is no dialogue or on failure.
 */
export async function dubVideoDialogue(
  relativePath: string,
  videoPrompt: string | null | undefined,
  taskId?: number,
  storyboardId?: number,
): Promise<string | null> {
  // B26: TTS temp dirs are collected centrally and cleaned in finally (no /tmp/fd-tts-* leaks on exception paths)
  const ttsDirs: string[] = []
  try {
    // Storyboard-bound character names resolve @character-name precisely (the LLM often
    // interleaves action descriptions between the name and 说; without known character // i18n: user-facing (说 below is a literal regex anchor matching LLM output)
    // names extractDialogue falls back to the word adjacent to 说, so multiple lines of
    // the same character can map to different speakers due to differing actions →
    // different voices, breaking same-character voice consistency bug2).
    const { names: knownSpeakers, voices: characterVoices } = await getStoryboardSpeakers(storyboardId)
    const lines = extractDialogue(videoPrompt, knownSpeakers)
    if (!lines.length) return null

    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    // Speaker → voice: characters.voice explicit assignment first, otherwise rotate the voice pool by character-name hash.
    // The hash is storyboard-independent → the same character gets the same voice across shots/episodes (the old
    // implementation assigned per-shot by order of first appearance, so the same character changed voice across shots).
    // With FUSION_TTS_VOICE explicitly set the whole film uses a single voice.
    // Qwen3-TTS: voice pool = server-side voice bundles (#1383, preferred, no base64) + local workspace/voices fallback.
    let poolOverride: string[] | undefined
    let serverSet: Set<string> | undefined
    if (isQwen3Tts && !TTS_VOICE) {
      const ep = await getTtsEndpoint()
      const baseUrl = ep?.baseUrl || process.env.FUSION_MLX_BASE_URL || 'http://127.0.0.1:11432'
      const apiKey = ep?.apiKey || process.env.FUSION_CLIENT_KEY || ''
      const serverBundles = await listServerVoiceBundles(baseUrl, apiKey)
      const serverBundleSet = new Set(serverBundles)
      const locals = listLocalRefVoices().filter(v => !serverBundleSet.has(v))
      serverSet = serverBundleSet
      poolOverride = [...serverBundles, ...locals]
      if (poolOverride.length) {
        logTaskProgress('VideoTask', 'tts-voice-pool', {
          taskId, server: serverBundles.length, local: locals.length,
        })
      }
    }
    const speakerVoices = new Map<string, string>()
    if (!TTS_VOICE) {
      for (const line of lines) {
        if (!speakerVoices.has(line.speaker)) {
          speakerVoices.set(line.speaker, voiceForSpeaker(line.speaker, characterVoices, poolOverride))
        }
      }
    }
    if (speakerVoices.size) {
      logTaskProgress('VideoTask', 'tts-voice-map', {
        taskId,
        storyboardId,
        voices: [...speakerVoices.entries()].map(([sp, v]) => `${sp}=${v}`).join(','),
      })
    }

    logTaskProgress('VideoTask', 'tts-dub-start', { taskId, storyboardId, lines: lines.length })

    // Synthesize line by line
    const wavs: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const voice = TTS_VOICE || speakerVoices.get(lines[i].speaker) || ''
      const wav = await synthesizeLine(lines[i].text, i, voice, serverSet)
      if (wav) {
        wavs.push(wav)
        ttsDirs.push(path.dirname(wav))
      }
    }
    if (!wavs.length) return null

    const srcAbs = getAbsolutePath(relativePath)
    const outAbs = srcAbs.replace(/\.mp4$/, '.dub.mp4')

    // Detect whether the original video has an audio track: in I2V first-frame mode with
    // audio degraded off the video has no audio track, and ffmpeg [0:a] reports
    // "matches no streams". Without an audio track only TTS is mixed in.
    const hasAudioTrack = await new Promise<boolean>((resolve) => {
      ffmpeg(srcAbs).ffprobe((err, data) => {
        if (err) return resolve(false)
        resolve((data.streams || []).some((s) => s.codec_type === 'audio'))
      })
    })

    // Duration-aware distribution: probe the video duration + each TTS line's duration, spread evenly along the story rhythm (not all crammed at the start).
    // Overflow handling: when total dialogue duration > video duration, slightly speed up for minor overruns (atempo ≤1.3);
    // for severe overruns keep the lines that fit in order and truncate the rest (avoids -shortest silently dropping the latter half of the dialogue).
    const videoDuration = await probeDuration(srcAbs)
    const lineDurations = await Promise.all(wavs.map(w => probeDuration(w)))
    const totalSpeech = lineDurations.reduce((a, b) => a + b, 0)
    const FIT_TEMPO_MAX = 1.3
    let effectiveWavs = wavs
    let effectiveDurs = lineDurations
    let tempo = 1.0
    if (videoDuration > 0 && totalSpeech > videoDuration) {
      const ratio = totalSpeech / videoDuration
      if (ratio <= FIT_TEMPO_MAX) {
        tempo = Math.min(FIT_TEMPO_MAX, Number((ratio / 0.85).toFixed(3)))
        logTaskProgress('VideoTask', 'tts-dub-speedup', { taskId, storyboardId, totalSpeech, videoDuration, tempo })
      } else {
        const budget = videoDuration * 0.9
        let acc = 0
        const keepIdx: number[] = []
        for (let i = 0; i < wavs.length; i++) {
          const d = lineDurations[i] / FIT_TEMPO_MAX
          if (acc + d > budget) break
          keepIdx.push(i)
          acc += d
        }
        if (!keepIdx.length) {
          logTaskWarn('VideoTask', 'tts-dub-skip', { taskId, storyboardId, reason: 'dialogue exceeds video duration even after max speedup', totalSpeech, videoDuration })
          return null
        }
        tempo = FIT_TEMPO_MAX
        effectiveWavs = keepIdx.map(i => wavs[i])
        effectiveDurs = keepIdx.map(i => lineDurations[i])
        logTaskWarn('VideoTask', 'tts-dub-truncated', { taskId, storyboardId, kept: keepIdx.length, total: wavs.length, totalSpeech, videoDuration })
      }
    }

    // Timeline distribution: gap = (videoDuration - effectiveSpeech) / (n+1), leaving even pauses.
    // Falls back to 0.3s inter-line silence when the video duration is unknown (legacy behavior).
    // After atempo=tempo compression each line lasts original / tempo, so effectiveSpeech = sum / tempo.
    const effectiveSpeech = effectiveDurs.reduce((a, b) => a + b, 0) / tempo
    const gap = videoDuration > 0 && effectiveSpeech < videoDuration
      ? (videoDuration - effectiveSpeech) / (effectiveWavs.length + 1)
      : 0.3

    // Filter graph: per-line atempo + adelay placement → amix → 48kHz stereo gain + limiter against clipping
    await new Promise<void>((resolve, reject) => {
      const parts: string[] = []
      const labels: string[] = []
      let cumulative = 0
      for (let i = 0; i < effectiveWavs.length; i++) {
        const inputIdx = i + 1
        const label = `d${i}`
        const offsetMs = Math.round(((i + 1) * gap + cumulative / tempo) * 1000)
        const tempoFilter = tempo > 1.0 ? `atempo=${tempo.toFixed(3)},` : ''
        parts.push(`[${inputIdx}:a]${tempoFilter}adelay=${offsetMs}|${offsetMs}[${label}]`)
        labels.push(`[${label}]`)
        cumulative += effectiveDurs[i]
      }
      const filters = [...parts]
      const ttsMix = `${labels.join('')}amix=inputs=${labels.length}:normalize=0,volume=2.0,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.95`
      if (hasAudioTrack) {
        // With an original track: mix the TTS track with the original (ducked as ambience), duration=first anchored on the original.
        // The trailing aformat upgrades to 48kHz stereo (otherwise amix inherits the original track's 24kHz mono).
        filters.push(`${ttsMix}[ttsv];[0:a]volume=0.12[env];[env][ttsv]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`)
      } else {
        // No original audio track: TTS fills the video duration (apad pads trailing silence), avoiding -shortest truncating the video
        const padDur = videoDuration > 0 ? videoDuration.toFixed(3) : '0'
        filters.push(`${ttsMix},apad=whole_dur=${padDur}[aout]`)
      }
      const cmd = ffmpeg(srcAbs)
      effectiveWavs.forEach((w) => cmd.input(w))
      cmd.complexFilter(filters)
        .outputOptions(['-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest'])
        .output(outAbs)
        .on('end', () => resolve())
        .on('error', reject)
      try { cmd.run() } catch (e) { reject(e) }
    })

    // B17: validate the artifact first (exists/non-empty/probeable) before the atomic swap with backup rollback —
    // a broken artifact (ffmpeg produced an empty file mid-run) must never overwrite the original video
    const outStat = fs.existsSync(outAbs) ? fs.statSync(outAbs) : null
    if (!outStat || outStat.size === 0) {
      logTaskWarn('VideoTask', 'tts-dub-output-invalid', { taskId, storyboardId, reason: 'missing-or-empty' })
      try { fs.rmSync(outAbs, { force: true }) } catch { /* ignore */ }
      return null
    }
    const outDur = await probeDuration(outAbs)
    if (!(outDur > 0)) {
      logTaskWarn('VideoTask', 'tts-dub-output-invalid', { taskId, storyboardId, reason: 'probe-zero-duration' })
      try { fs.rmSync(outAbs, { force: true }) } catch { /* ignore */ }
      return null
    }
    const bakAbs = `${srcAbs}.bak`
    fs.renameSync(srcAbs, bakAbs)
    try {
      fs.renameSync(outAbs, srcAbs)
    } catch (err) {
      fs.renameSync(bakAbs, srcAbs)
      throw err
    }
    fs.rmSync(bakAbs, { force: true })
    logTaskProgress('VideoTask', 'tts-dub-done', { taskId, storyboardId, lines: effectiveWavs.length, videoDuration, totalSpeech, tempo })
    return relativePath
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-dub-failed', { taskId, storyboardId, error: (err as Error).message })
    return null
  } finally {
    // B26: clean up TTS temp directories (including exception paths)
    for (const d of ttsDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}
