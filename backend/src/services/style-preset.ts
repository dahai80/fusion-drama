/**
 * Style preset service — resolves the drama-bound visual style into an English prompt fragment
 * dramas.style stores style_presets.value; returns '' when missing/disabled (callers fall back)
 */
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

/** Return the drama-bound style preset's English prompt fragment; '' when not found */
export async function getDramaStylePrompt(dramaId: number | null | undefined): Promise<string> {
  if (!dramaId) return ''
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama?.style) return ''
  const [preset] = await db.select().from(schema.stylePresets)
    .where(and(eq(schema.stylePresets.value, drama.style), eq(schema.stylePresets.isActive, true)))
  return preset?.prompt || ''
}
