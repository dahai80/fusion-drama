import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...sourceFiles(full))
    if (stat.isFile() && full.endsWith('.ts')) out.push(full)
  }
  return out
}

test('backend database runtime uses mysql2 and not sqlite', () => {
  const pkg = JSON.parse(read('package.json'))
  const dbIndex = read('src/db/index.ts')

  assert.match(pkg.dependencies.mysql2, /^\^3\./)
  assert.equal(pkg.devDependencies['better-sqlite3'], undefined)
  assert.equal(pkg.devDependencies['@types/better-sqlite3'], undefined)
  assert.equal(pkg.dependencies['better-sqlite3'], undefined)
  assert.match(dbIndex, /mysql2\/promise/)
  assert.match(dbIndex, /drizzle-orm\/mysql2/)
  assert.match(dbIndex, /DATABASE_URL/)
  assert.doesNotMatch(dbIndex, /better-sqlite3/)
  assert.doesNotMatch(dbIndex, /journal_mode|WAL|DB_PATH/)
})

test('drizzle schema uses mysql core builders', () => {
  const schema = read('src/db/schema.ts')

  assert.match(schema, /drizzle-orm\/mysql-core/)
  assert.match(schema, /mysqlTable/)
  assert.match(schema, /autoincrement\(\)/)
  assert.match(schema, /styling:\s*text\('styling'\)/)
  assert.match(schema, /lighting:\s*text\('lighting'\)/)
  assert.doesNotMatch(schema, /sqliteTable/)
  assert.doesNotMatch(schema, /drizzle-orm\/sqlite-core/)
})

test('backend source does not use sqlite-only query APIs', () => {
  const files = sourceFiles(new URL('src', root).pathname)
  const offenders = []

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (/\.all\(\)|\.run\(\)|lastInsertRowid|better-sqlite3|sqliteTable|sqlite-core/.test(source)) {
      offenders.push(file.replace(new URL('.', root).pathname, ''))
    }
  }

  assert.deepEqual(offenders, [])
})

test('mysql startup schema is present and sqlite migration artifacts are removed', () => {
  const mysqlSchema = read('src/db/mysql-schema.ts')
  const pkg = JSON.parse(read('package.json'))

  assert.match(mysqlSchema, /CREATE TABLE IF NOT EXISTS dramas/)
  assert.match(mysqlSchema, /AUTO_INCREMENT/)
  assert.match(mysqlSchema, /utf8mb4/)
  assert.match(mysqlSchema, /styling TEXT/)
  assert.match(mysqlSchema, /lighting TEXT/)
  assert.match(mysqlSchema, /ensureMySqlColumn/)
  assert.match(mysqlSchema, /ALTER TABLE `characters` ADD COLUMN `styling` TEXT/)
  assert.match(mysqlSchema, /ALTER TABLE `scenes` ADD COLUMN `lighting` TEXT/)
  // 项目级画面比例：创建时固定，视频生成统一使用
  assert.match(mysqlSchema, /aspect_ratio VARCHAR\(16\) DEFAULT '16:9'/)
  assert.match(mysqlSchema, /ALTER TABLE `dramas` ADD COLUMN `aspect_ratio` VARCHAR\(16\) DEFAULT '16:9'/)
  // 集级视频分辨率：创建集时固定（480p/720p），视频生成统一使用
  assert.match(mysqlSchema, /resolution VARCHAR\(16\) DEFAULT '720p'/)
  assert.match(mysqlSchema, /ALTER TABLE `episodes` ADD COLUMN `resolution` VARCHAR\(16\) DEFAULT '720p'/)
  assert.equal(pkg.scripts['db:migrate:sqlite-to-mysql'], undefined)
  assert.equal(existsSync(new URL('scripts/migrate-sqlite-to-mysql.ts', root)), false)
})

test('style_presets table and idempotent seed statements are present', () => {
  const mysqlSchema = read('src/db/mysql-schema.ts')
  const schema = read('src/db/schema.ts')

  assert.match(schema, /stylePresets = mysqlTable\('style_presets'/)
  assert.match(mysqlSchema, /CREATE TABLE IF NOT EXISTS style_presets/)
  assert.match(mysqlSchema, /UNIQUE KEY uk_style_presets_value/)
  assert.match(mysqlSchema, /mysqlDataSeedStatements/)
  assert.match(mysqlSchema, /INSERT INTO `style_presets`/)
  assert.match(mysqlSchema, /WHERE NOT EXISTS \(SELECT 1 FROM `style_presets` WHERE `value` = \?\)/)
  assert.match(mysqlSchema, /stylePresetSeeds/)
  // 六种内置风格
  for (const v of ['3d', 'anime', 'realistic', 'ghibli', 'watercolor', 'comic']) {
    assert.match(mysqlSchema, new RegExp(`value: '${v}'`))
  }
  // seed 在 init 中执行
  assert.match(mysqlSchema, /for \(const seed of mysqlDataSeedStatements\)/)
})
