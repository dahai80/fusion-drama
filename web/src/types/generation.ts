export interface GenerateOutlineRequest {
  drama_id: string
  theme: string
  genre?: string
  style?: string
  length?: number
  temperature?: number
}

export interface GenerateCharactersRequest {
  drama_id: string
  outline?: string
  count?: number
  temperature?: number
}

export interface GenerateEpisodesRequest {
  drama_id: string
  outline?: string
  episode_count: number
  temperature?: number
}

export interface OutlineResult {
  title: string
  summary: string
  genre: string
  tags: string[]
  characters: CharacterOutline[]
  episodes: EpisodeOutline[]
  key_scenes: string[]
}

export interface CharacterOutline {
  name: string
  role: string
  description: string
  personality: string
  appearance: string
}

export interface EpisodeOutline {
  episode_number: number
  title: string
  summary: string
  scenes: string[]
  duration: number
}

export interface ParseScriptRequest {
  drama_id: string
  script_content: string
  auto_split?: boolean
}

export interface ParseScriptResult {
  episodes: ParsedEpisode[]
  characters: ParsedCharacter[]
  summary: string
}

export interface ParsedCharacter {
  name: string
  role: string
  description: string
  personality: string
}

export interface ParsedEpisode {
  episode_number: number
  title: string
  description: string
  script_content: string
  duration: number
  chapter_start?: number
  chapter_end?: number
  start_marker?: string
  end_marker?: string
}
