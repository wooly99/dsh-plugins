import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  // A missing value inherits the old preference on first client activation.
  showTurnCodeDiff: Schema.boolean().volatile(),
})

export function apply(ctx) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
