-- ============================================================================
-- Huobao Drama 初始化 SQL
-- 由 backend/scripts/export-init-sql.ts 从 backend/src/db/mysql-schema.ts 生成
-- 生成时间: 2026-08-08T14:35:02.119Z
--
-- 注意: 应用启动时会自动执行同等初始化(幂等),本文件不是部署必需,
--       仅供 DBA 审核或在应用外预建表使用
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. 建表(17 张)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dramas (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episodes (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS characters (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scenes (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storyboards (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episode_characters (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    character_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_characters_episode_id (episode_id),
    INDEX idx_episode_characters_character_id (character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episode_scenes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_scenes_episode_id (episode_id),
    INDEX idx_episode_scenes_scene_id (scene_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episode_props (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    prop_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_props_episode_id (episode_id),
    INDEX idx_episode_props_prop_id (prop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INT NOT NULL,
    character_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, character_id),
    INDEX idx_storyboard_characters_character_id (character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storyboard_props (
    storyboard_id INT NOT NULL,
    prop_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, prop_id),
    INDEX idx_storyboard_props_prop_id (prop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_service_configs (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_service_providers (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS style_presets (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_task (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_merges (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS props (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. 废弃表清理
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `image_generations`;
DROP TABLE IF EXISTS `video_generations`;
DROP TABLE IF EXISTS `ai_voices`;

-- ----------------------------------------------------------------------------
-- 3. 历史数据迁移清理(对全新数据库为 no-op,与应用启动行为保持一致)
-- ----------------------------------------------------------------------------
UPDATE `episodes` e LEFT JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE e.`image_config_id` IS NOT NULL AND c.`id` IS NULL;
UPDATE `episodes` e LEFT JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE e.`video_config_id` IS NOT NULL AND c.`id` IS NULL;
UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` = 'minimax';
UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` = 'minimax';
DELETE FROM `ai_service_configs` WHERE `provider` = 'minimax';
DELETE FROM `ai_service_providers` WHERE `provider` = 'minimax';
UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` IN ('ali', 'vidu');
UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` IN ('ali', 'vidu');
DELETE FROM `ai_service_configs` WHERE `provider` IN ('deepseek', 'ali', 'vidu');
DELETE FROM `ai_service_providers` WHERE `provider` IN ('deepseek', 'ali', 'vidu');
UPDATE `dramas` SET `style` = 'realistic' WHERE `style` = 'cinematic';
UPDATE `storyboards` SET `video_prompt` = REPLACE(`video_prompt`, '<n>', CHAR(10)) WHERE `video_prompt` LIKE '%<n>%';
DROP TABLE IF EXISTS `agent_configs`;
UPDATE `ai_service_configs` SET `model` = '["doubao-seedance-2-0-fast-260128","doubao-seedance-2-0-260128","doubao-seedance-2-0-mini-260615"]' WHERE `service_type` = 'video' AND `provider` = 'volcengine' AND `model` NOT LIKE '%doubao-seedance-2-0%';

-- ----------------------------------------------------------------------------
-- 4. 种子数据: 风格预设(幂等,只补缺失行)
-- ----------------------------------------------------------------------------
INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT '3D', '3d', '3D render, Pixar-style animation, soft studio lighting, high detail, subsurface scattering', '三维渲染卡通质感，适合轻松明快的短剧', 1, 1, '2026-08-08T14:35:02.118Z', '2026-08-08T14:35:02.119Z' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = '3d');
INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT '动漫', 'anime', 'anime style, cel shading, vibrant colors, clean line art, Japanese animation', '日式赛璐璐动画风格', 2, 1, '2026-08-08T14:35:02.119Z', '2026-08-08T14:35:02.119Z' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = 'anime');
INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT '写实电影', 'realistic', 'photorealistic, cinematic film still, 35mm, natural lighting, shallow depth of field, high detail', '电影级真人写实质感', 3, 1, '2026-08-08T14:35:02.119Z', '2026-08-08T14:35:02.119Z' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = 'realistic');
INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT '吉卜力', 'ghibli', 'Studio Ghibli style, hand-painted, soft watercolor background, warm nostalgic tone', '吉卜力手绘治愈风', 4, 1, '2026-08-08T14:35:02.119Z', '2026-08-08T14:35:02.119Z' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = 'ghibli');
INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT '水彩', 'watercolor', 'watercolor illustration, soft washes, visible paper texture, delicate brush strokes', '水彩插画质感', 5, 1, '2026-08-08T14:35:02.119Z', '2026-08-08T14:35:02.119Z' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = 'watercolor');
INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT '漫画', 'comic', 'comic book style, bold outlines, halftone shading, dynamic colors, flat graphic look', '美式漫画粗线条风格', 6, 1, '2026-08-08T14:35:02.119Z', '2026-08-08T14:35:02.119Z' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = 'comic');

-- ----------------------------------------------------------------------------
-- 附: 列补齐语句(仅用于老库升级;新建表已包含全部列,无需执行)
-- 代码中通过 SHOW COLUMNS 检查后按需执行,MySQL 不支持 ADD COLUMN IF NOT EXISTS
-- ----------------------------------------------------------------------------
-- ALTER TABLE `dramas` ADD COLUMN `aspect_ratio` VARCHAR(16) DEFAULT '16:9';
-- ALTER TABLE `episodes` ADD COLUMN `resolution` VARCHAR(16) DEFAULT '720p';
-- ALTER TABLE `characters` ADD COLUMN `styling` TEXT;
-- ALTER TABLE `characters` ADD COLUMN `final_prompt` TEXT;
-- ALTER TABLE `characters` ADD COLUMN `personality` TEXT;
-- ALTER TABLE `props` ADD COLUMN `final_prompt` TEXT;
-- ALTER TABLE `scenes` ADD COLUMN `lighting` TEXT;
-- ALTER TABLE `scenes` ADD COLUMN `final_prompt` TEXT;
