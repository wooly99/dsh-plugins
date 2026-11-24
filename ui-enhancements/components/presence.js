import Schema from '@deepseek-ai/schemastery'

// The browser uses the namespace's presence, not this value. A volatile
// field lets the existing Settings mirror announce component activation.
export const Config = Schema.object({ present: Schema.boolean().default(true).volatile() })

export function exposeSettings(ctx) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
