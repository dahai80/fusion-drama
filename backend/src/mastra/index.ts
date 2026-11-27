/**
 * Mastra central instance — mount point for the agent registry
 * No Mastra logger (the project already has pino + task-logger)
 */
import { Mastra } from '@mastra/core/mastra'
import { agentRegistry } from '../agents/index.js'

export const mastra = new Mastra({
  agents: agentRegistry,
  logger: false,
})
