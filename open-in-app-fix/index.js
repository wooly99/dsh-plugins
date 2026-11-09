import { installSpawnGuard } from './spawn-guard.js'

export const name = 'open-in-app-fix'

export function apply(ctx) {
  ctx.effect(() => installSpawnGuard(), 'open-in-app-fix: VS Code child environment')
}
