import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import path from 'path'

import dramas from './routes/dramas'
import episodes from './routes/episodes'
import storyboards from './routes/storyboards'
import scenes from './routes/scenes'
import aiConfigs, { aiProviders } from './routes/aiConfigs'
import agentConfigs from './routes/agentConfigs'

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: ['http://localhost:3012', 'http://localhost:5678'],
  credentials: true,
}))
app.use('*', logger())

// Health check
app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// API routes
const api = app.basePath('/api/v1')
api.route('/dramas', dramas)
api.route('/episodes', episodes)
api.route('/storyboards', storyboards)
api.route('/scenes', scenes)
api.route('/ai-configs', aiConfigs)
api.route('/ai-providers', aiProviders)
api.route('/agent-configs', agentConfigs)

// TODO: Phase 2 routes
// api.route('/images', images)
// api.route('/videos', videos)
// api.route('/video-merges', videoMerges)
// api.route('/agent', agent)
// api.route('/characters', characters)

// Serve frontend static files
app.use('/static/*', serveStatic({ root: './data' }))
app.use('*', serveStatic({ root: './web/dist' }))

// SPA fallback
app.get('*', serveStatic({ root: './web/dist', path: 'index.html' }))

const port = Number(process.env.PORT || 5679)
console.log(`🚀 Huobao Drama TS server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
