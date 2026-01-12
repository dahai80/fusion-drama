import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

export interface VideoTrimOptions {
  startTime: number
  endTime: number
}

export interface VideoMergeOptions {
  clips: Array<{
    url: string
    startTime?: number
    endTime?: number
  }>
}

export interface ProgressCallback {
  (progress: number): void
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message)
    })

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
    })

    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

export async function trimVideo(
  videoUrl: string,
  options: VideoTrimOptions,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await getFFmpeg()

  if (onProgress) onProgress(10)

  const inputFileName = 'input.mp4'
  const outputFileName = 'output.mp4'

  await ffmpeg.writeFile(inputFileName, await fetchFile(videoUrl))

  if (onProgress) onProgress(30)

  const args = [
    '-i', inputFileName,
    '-ss', options.startTime.toString(),
    '-to', options.endTime.toString(),
    '-c', 'copy',
    '-avoid_negative_ts', '1',
    outputFileName
  ]

  await ffmpeg.exec(args)

  if (onProgress) onProgress(80)

  const data = await ffmpeg.readFile(outputFileName) as Uint8Array

  await ffmpeg.deleteFile(inputFileName)
  await ffmpeg.deleteFile(outputFileName)

  if (onProgress) onProgress(100)

  return new Blob([new Uint8Array(data)], { type: 'video/mp4' })
}

export async function mergeVideos(
  options: VideoMergeOptions,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await getFFmpeg()

  if (onProgress) onProgress(5)

  const tempFiles: string[] = []
  
  for (let i = 0; i < options.clips.length; i++) {
    const clip = options.clips[i]
    const fileName = `clip_${i}.mp4`
    
    await ffmpeg.writeFile(fileName, await fetchFile(clip.url))
    tempFiles.push(fileName)
    
    if (onProgress) {
      onProgress(5 + (i + 1) / options.clips.length * 40)
    }
  }

  const listContent = tempFiles.map(file => `file '${file}'`).join('\n')
  await ffmpeg.writeFile('filelist.txt', new TextEncoder().encode(listContent))

  if (onProgress) onProgress(50)

  await ffmpeg.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'filelist.txt',
    '-c', 'copy',
    'output.mp4'
  ])

  if (onProgress) onProgress(90)

  const data = await ffmpeg.readFile('output.mp4') as Uint8Array

  for (const file of tempFiles) {
    await ffmpeg.deleteFile(file)
  }
  await ffmpeg.deleteFile('filelist.txt')
  await ffmpeg.deleteFile('output.mp4')

  if (onProgress) onProgress(100)

  return new Blob([new Uint8Array(data)], { type: 'video/mp4' })
}

export async function trimAndMergeVideos(
  clips: Array<{
    url: string
    startTime: number
    endTime: number
  }>,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await getFFmpeg()

  if (onProgress) onProgress(5)

  const trimmedFiles: string[] = []
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const inputName = `input_${i}.mp4`
    const outputName = `trimmed_${i}.mp4`
    
    await ffmpeg.writeFile(inputName, await fetchFile(clip.url))
    
    await ffmpeg.exec([
      '-i', inputName,
      '-ss', clip.startTime.toString(),
      '-to', clip.endTime.toString(),
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      outputName
    ])
    
    await ffmpeg.deleteFile(inputName)
    trimmedFiles.push(outputName)
    
    if (onProgress) {
      onProgress(5 + (i + 1) / clips.length * 60)
    }
  }

  const listContent = trimmedFiles.map(file => `file '${file}'`).join('\n')
  await ffmpeg.writeFile('filelist.txt', new TextEncoder().encode(listContent))

  if (onProgress) onProgress(70)

  await ffmpeg.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'filelist.txt',
    '-c', 'copy',
    'final.mp4'
  ])

  if (onProgress) onProgress(95)

  const data = await ffmpeg.readFile('final.mp4') as Uint8Array

  for (const file of trimmedFiles) {
    await ffmpeg.deleteFile(file)
  }
  await ffmpeg.deleteFile('filelist.txt')
  await ffmpeg.deleteFile('final.mp4')

  if (onProgress) onProgress(100)

  return new Blob([new Uint8Array(data)], { type: 'video/mp4' })
}

export async function isFFmpegLoaded(): Promise<boolean> {
  return ffmpegInstance !== null
}

export async function unloadFFmpeg(): Promise<void> {
  if (ffmpegInstance) {
    await ffmpegInstance.terminate()
    ffmpegInstance = null
    loadPromise = null
  }
}
