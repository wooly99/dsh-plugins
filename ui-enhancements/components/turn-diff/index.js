import Schema from '@deepseek-ai/schemastery'
import { exposeSettings } from '../presence.js'

export const Config = Schema.object({
  // A missing value inherits the old preference on first client activation.
  showTurnCodeDiff: Schema.boolean().volatile(),
})

export function apply(ctx) { exposeSettings(ctx) }
