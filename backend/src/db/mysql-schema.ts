import type { Pool } from 'mysql2/promise'

export const mysqlSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS dramas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style VARCHAR(64) DEFAULT 'realistic',
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

  `CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INT NOT NULL,
    character_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, character_id),
    INDEX idx_storyboard_characters_character_id (character_id)
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

  `CREATE TABLE IF NOT EXISTS image_generations (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    storyboard_id INT,
    drama_id INT,
    scene_id INT,
    character_id INT,
    prop_id INT,
    image_type TEXT,
    frame_type TEXT,
    provider VARCHAR(64),
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style VARCHAR(64),
    steps INT,
    cfg_scale DOUBLE,
    seed INT,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status VARCHAR(64) DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INT,
    height INT,
    reference_images TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS video_generations (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    storyboard_id INT,
    drama_id INT,
    provider VARCHAR(64),
    prompt TEXT,
    model TEXT,
    image_gen_id INT,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls TEXT,
    duration INT,
    fps INT,
    resolution TEXT,
    aspect_ratio TEXT,
    style VARCHAR(64),
    motion_level INT,
    camera_motion TEXT,
    seed INT,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status VARCHAR(64) DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INT,
    height INT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64),
    deleted_at VARCHAR(64)
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
  { table: 'characters', column: 'styling', sql: 'ALTER TABLE `characters` ADD COLUMN `styling` TEXT' },
  { table: 'scenes', column: 'lighting', sql: 'ALTER TABLE `scenes` ADD COLUMN `lighting` TEXT' },
]

export const mysqlDataCleanupStatements = [
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` = ? AND c.`service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` = ? AND c.`service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
  {
    sql: 'DELETE FROM `ai_service_configs` WHERE `provider` = ? AND `service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
  {
    sql: 'DELETE FROM `ai_service_providers` WHERE `provider` = ? AND `service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
]

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
  for (const cleanup of mysqlDataCleanupStatements) {
    await pool.query(cleanup.sql, cleanup.params)
  }
}
