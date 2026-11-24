import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  // No default: the Client initializes a missing value from the old switch.
  showTurnCodeDiff: Schema.boolean().volatile(),
})

export function apply(ctx) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
