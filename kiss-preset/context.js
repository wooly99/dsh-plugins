export const name = 'kiss-context';
export const inject = ['systemPrompt', 'skills'];

const officeProvider = 'dsh-office';
const explicitOnly = skill => ({
  ...skill,
  invocation: { ...skill.invocation, modelInvocable: false },
});

export function apply(ctx, { hideWebSurface }) {
  if (hideWebSurface) {
    const hidden = { name: 'app:web-surface', text: '' };
    ctx.systemPrompt.section({ ...hidden, order: ctx.systemPrompt.getSectionOrder('WEB_SURFACE') });
    ctx.systemPrompt.context({ ...hidden, order: ctx.systemPrompt.getContextOrder('WEB_SURFACE') });
  }

  // Look up the host layer only, so this scoped provider never calls itself.
  ctx.skills.registerProvider(() => ({
    name: officeProvider,
    async list({ cwd, signal }) {
      const { skills, complete } = await ctx.skills.snapshot({ cwd, signal });
      const candidates = skills.filter(skill => skill.provider === officeProvider)
        .map(skill => ({ ...explicitOnly(skill), rank: 600, locator: skill.name }));
      return { candidates, complete };
    },
    async get({ locator }, { cwd, signal }) {
      const skill = await ctx.skills.get(locator, { cwd, signal });
      return skill?.provider === officeProvider ? explicitOnly(skill) : undefined;
    },
  }));
}
