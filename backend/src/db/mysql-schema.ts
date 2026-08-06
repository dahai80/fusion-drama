import type { Pool } from 'mysql2/promise'

export const mysqlSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS dramas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style VARCHAR(64) DEFAULT 'realistic',
    aspect_ratio VARCHAR(16) DEFAULT '16:9',
    total_episodes INT DEFAULT 1,
    total_duration INT DEFAULT 0,
    status VARCHAR(64) NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episodes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_number INT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    status VARCHAR(64) DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    image_config_id INT,
    video_config_id INT,
    resolution VARCHAR(16) DEFAULT '720p',
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS characters (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    styling TEXT,
    final_prompt TEXT,
    personality TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INT,
    local_path TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS scenes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_id INT,
    location TEXT NOT NULL,
    time VARCHAR(64) NOT NULL,
    prompt TEXT NOT NULL,
    lighting TEXT,
    final_prompt TEXT,
    storyboard_count INT DEFAULT 1,
    image_url TEXT,
    status VARCHAR(64) DEFAULT 'pending',
    local_path TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboards (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT,
    storyboard_number INT NOT NULL,
    title TEXT,
    location TEXT,
    time VARCHAR(64),
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    action TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    dialogue TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status VARCHAR(64) DEFAULT 'pending',
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_characters (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    character_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_characters_episode_id (episode_id),
    INDEX idx_episode_characters_character_id (character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_scenes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_scenes_episode_id (episode_id),
    INDEX idx_episode_scenes_scene_id (scene_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_props (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    prop_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_props_episode_id (episode_id),
    INDEX idx_episode_props_prop_id (prop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INT NOT NULL,
    character_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, character_id),
    INDEX idx_storyboard_characters_character_id (character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboard_props (
    storyboard_id INT NOT NULL,
    prop_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, prop_id),
    INDEX idx_storyboard_props_prop_id (prop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    service_type VARCHAR(64) NOT NULL,
    provider VARCHAR(64),
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INT DEFAULT 0,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    settings TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS style_presets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    value VARCHAR(64) NOT NULL,
    prompt TEXT NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    UNIQUE KEY uk_style_presets_value (value)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS agent_configs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    agent_type VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    temperature DOUBLE,
    max_tokens INT,
    max_iterations INT,
    is_active TINYINT(1) DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sys_task (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(16) NOT NULL,
    storyboard_id INT,
    drama_id INT,
    scene_id INT,
    character_id INT,
    prop_id INT,
    provider VARCHAR(64),
    prompt TEXT,
    model TEXT,
    params TEXT,
    task_id TEXT,
    result_url TEXT,
    local_path TEXT,
    status VARCHAR(64) DEFAULT 'processing',
    error_msg TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64),
    INDEX idx_sys_task_type (type),
    INDEX idx_sys_task_drama_id (drama_id),
    INDEX idx_sys_task_storyboard_id (storyboard_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS video_merges (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT,
    drama_id INT,
    title TEXT,
    provider VARCHAR(64) NOT NULL,
    model TEXT NOT NULL,
    status VARCHAR(64) DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INT,
    task_id TEXT,
    error_msg TEXT,
    created_at VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64),
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS props (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    final_prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT,
    episode_id INT,
    storyboard_id INT,
    storyboard_num INT,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INT,
    mime_type TEXT,
    width INT,
    height INT,
    duration INT,
    format TEXT,
    image_gen_id INT,
    video_gen_id INT,
    is_favorite TINYINT(1) DEFAULT 0,
    view_count INT DEFAULT 0,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

export const mysqlColumnBackfillStatements = [
  { table: 'dramas', column: 'aspect_ratio', sql: "ALTER TABLE `dramas` ADD COLUMN `aspect_ratio` VARCHAR(16) DEFAULT '16:9'" },
  { table: 'episodes', column: 'resolution', sql: "ALTER TABLE `episodes` ADD COLUMN `resolution` VARCHAR(16) DEFAULT '720p'" },
  { table: 'characters', column: 'styling', sql: 'ALTER TABLE `characters` ADD COLUMN `styling` TEXT' },
  { table: 'characters', column: 'final_prompt', sql: 'ALTER TABLE `characters` ADD COLUMN `final_prompt` TEXT' },
  { table: 'characters', column: 'personality', sql: 'ALTER TABLE `characters` ADD COLUMN `personality` TEXT' },
  { table: 'props', column: 'final_prompt', sql: 'ALTER TABLE `props` ADD COLUMN `final_prompt` TEXT' },
  { table: 'scenes', column: 'lighting', sql: 'ALTER TABLE `scenes` ADD COLUMN `lighting` TEXT' },
  { table: 'scenes', column: 'final_prompt', sql: 'ALTER TABLE `scenes` ADD COLUMN `final_prompt` TEXT' },
]

// 废弃表清理：image_generations / video_generations 已并入 sys_task（不迁移历史）；
// ai_voices 为 TTS 功能移除后的孤儿表
export const mysqlDropTableStatements = [
  'DROP TABLE IF EXISTS `image_generations`',
  'DROP TABLE IF EXISTS `video_generations`',
  'DROP TABLE IF EXISTS `ai_voices`',
]

export const mysqlDataCleanupStatements = [
  // 悬空配置引用清理：集锁定的 image/video 配置已被删除时置空，让生成回退到当前启用配置
  {
    sql: 'UPDATE `episodes` e LEFT JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE e.`image_config_id` IS NOT NULL AND c.`id` IS NULL',
    params: [],
  },
  {
    sql: 'UPDATE `episodes` e LEFT JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE e.`video_config_id` IS NOT NULL AND c.`id` IS NULL',
    params: [],
  },
  // 厂商收敛：彻底移除 minimax（含历史遗留的 audio 配置，按 provider 全量清理）
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` = ?',
    params: ['minimax'],
  },
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` = ?',
    params: ['minimax'],
  },
  {
    sql: 'DELETE FROM `ai_service_configs` WHERE `provider` = ?',
    params: ['minimax'],
  },
  {
    sql: 'DELETE FROM `ai_service_providers` WHERE `provider` = ?',
    params: ['minimax'],
  },
  // 厂商收敛：仅保留 openai / gemini / volcengine，移除 deepseek、ali、vidu
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` IN (?, ?)',
    params: ['ali', 'vidu'],
  },
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` IN (?, ?)',
    params: ['ali', 'vidu'],
  },
  {
    sql: 'DELETE FROM `ai_service_configs` WHERE `provider` IN (?, ?, ?)',
    params: ['deepseek', 'ali', 'vidu'],
  },
  {
    sql: 'DELETE FROM `ai_service_providers` WHERE `provider` IN (?, ?, ?)',
    params: ['deepseek', 'ali', 'vidu'],
  },
  // 旧硬编码风格值归并：cinematic 并入写实电影
  {
    sql: 'UPDATE `dramas` SET `style` = ? WHERE `style` = ?',
    params: ['realistic', 'cinematic'],
  },
  // 视频提示词格式收敛：旧的 <n> 时间段分隔符统一替换为换行
  {
    sql: "UPDATE `storyboards` SET `video_prompt` = REPLACE(`video_prompt`, '<n>', CHAR(10)) WHERE `video_prompt` LIKE '%<n>%'",
    params: [],
  },
  // Agent 重命名：grid_prompt_generator（宫格图时代遗留）→ image_prompt_generator
  {
    sql: 'UPDATE `agent_configs` SET `agent_type` = ? WHERE `agent_type` = ?',
    params: ['image_prompt_generator', 'grid_prompt_generator'],
  },
  // Agent 显示名收敛：图片提示词生成 → 提示词生成
  {
    sql: 'UPDATE `agent_configs` SET `name` = ? WHERE `agent_type` = ? AND `name` = ?',
    params: ['提示词生成', 'image_prompt_generator', '图片提示词生成'],
  },
  // Agent 重命名：image_prompt_generator → prompt_generator（职责扩展到视频提示词）
  {
    sql: 'UPDATE `agent_configs` SET `agent_type` = ? WHERE `agent_type` = ?',
    params: ['prompt_generator', 'image_prompt_generator'],
  },
  // Agent 显示名收敛：提示词生成 → 提示词
  {
    sql: 'UPDATE `agent_configs` SET `name` = ? WHERE `agent_type` = ? AND `name` = ?',
    params: ['提示词', 'prompt_generator', '提示词生成'],
  },
  // 视频模型收敛：Seedance 2.0 三个官方型号，默认 doubao-seedance-2-0-260128（数组首位即生效模型）
  {
    sql: 'UPDATE `ai_service_configs` SET `model` = ? WHERE `service_type` = ? AND `provider` = ? AND `model` NOT LIKE ?',
    params: [
      '["doubao-seedance-2-0-260128","doubao-seedance-2-0-fast-260128","doubao-seedance-2-0-mini-260615"]',
      'video',
      'volcengine',
      '%doubao-seedance-2-0%',
    ],
  },
]

/**
 * 风格预设种子数据 — value 存入 dramas.style，prompt 注入生图提示词
 */
export const stylePresetSeeds = [
  { name: '3D', value: '3d', sortOrder: 1, prompt: '3D render, Pixar-style animation, soft studio lighting, high detail, subsurface scattering', description: '三维渲染卡通质感，适合轻松明快的短剧' },
  { name: '动漫', value: 'anime', sortOrder: 2, prompt: 'anime style, cel shading, vibrant colors, clean line art, Japanese animation', description: '日式赛璐璐动画风格' },
  { name: '写实电影', value: 'realistic', sortOrder: 3, prompt: 'photorealistic, cinematic film still, 35mm, natural lighting, shallow depth of field, high detail', description: '电影级真人写实质感' },
  { name: '吉卜力', value: 'ghibli', sortOrder: 4, prompt: 'Studio Ghibli style, hand-painted, soft watercolor background, warm nostalgic tone', description: '吉卜力手绘治愈风' },
  { name: '水彩', value: 'watercolor', sortOrder: 5, prompt: 'watercolor illustration, soft washes, visible paper texture, delicate brush strokes', description: '水彩插画质感' },
  { name: '漫画', value: 'comic', sortOrder: 6, prompt: 'comic book style, bold outlines, halftone shading, dynamic colors, flat graphic look', description: '美式漫画粗线条风格' },
]

// INSERT ... SELECT WHERE NOT EXISTS → 幂等：只补缺失行，不覆盖用户编辑，
// 且不会像 INSERT IGNORE 那样在每次启动时白白消耗自增 id
export const mysqlDataSeedStatements = stylePresetSeeds.map((s) => ({
  sql: 'INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT ?, ?, ?, ?, ?, 1, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = ?)',
  params: [s.name, s.value, s.prompt, s.description, s.sortOrder, new Date().toISOString(), new Date().toISOString(), s.value],
}))

export async function ensureMySqlColumn(pool: Pool, table: string, column: string, alterSql: string) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]) as any[]
  if (Array.isArray(rows) && rows.length) return
  await pool.query(alterSql)
}

export async function initMySqlSchema(pool: Pool) {
  for (const statement of mysqlSchemaStatements) {
    await pool.query(statement)
  }
  for (const statement of mysqlColumnBackfillStatements) {
    await ensureMySqlColumn(pool, statement.table, statement.column, statement.sql)
  }
  for (const statement of mysqlDropTableStatements) {
    await pool.query(statement)
  }
  for (const cleanup of mysqlDataCleanupStatements) {
    await pool.query(cleanup.sql, cleanup.params)
  }
  for (const seed of mysqlDataSeedStatements) {
    await pool.query(seed.sql, seed.params)
  }
}
