import { exposeSettings } from '../presence.js'
export { Config } from '../presence.js'

export function apply(ctx) { exposeSettings(ctx) }
