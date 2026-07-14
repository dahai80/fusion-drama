import 'dotenv/config'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema.js'
import { initMySqlSchema } from './mysql-schema.js'

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const host = process.env.MYSQL_HOST || '127.0.0.1'
  const port = process.env.MYSQL_PORT || '3306'
  const user = encodeURIComponent(process.env.MYSQL_USER || 'huobao')
  const password = encodeURIComponent(process.env.MYSQL_PASSWORD || 'huobao')
  const database = process.env.MYSQL_DATABASE || 'huobao_drama'
  return `mysql://${user}:${password}@${host}:${port}/${database}`
}

export const pool = mysql.createPool({
  uri: databaseUrl(),
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
})

export async function initDb() {
  await initMySqlSchema(pool)
}

export function getInsertId(result: unknown) {
  const packet = Array.isArray(result) ? result[0] : result
  const insertId = (packet as { insertId?: number | string } | undefined)?.insertId
  if (insertId === undefined || insertId === null) {
    throw new Error('MySQL insert did not return an insertId')
  }
  return Number(insertId)
}

await initDb()

export const db = drizzle(pool, { schema, mode: 'default' })
export { schema }
export type DB = typeof db
