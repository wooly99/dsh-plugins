window.__ModuleLoader__.load({
  id: '@local/dsh-turn-diff-only',
  factory() {
    const REGISTRANT = '@local/dsh-turn-diff-only';
    const BASIC_MODES = Object.freeze({
      getSnapshot: () => false,
      subscribe: () => () => {},
    });

    /** Preserve the native picker/settings components and their controllers.
     * Only their render-only developerTools hook sees the basic-mode filter.
     * The two target entries have no child declarations; never clone a
     * children-owning entry (SlotCore disallows duplicate child declarations).
     */
    function basicPresetSurface(ctx, name, id) {
      return ctx.slots.inject(name, () => {
        let original;
        let remove;
        let disposed = false;
        function sync() {
          if (disposed) return;
          const next = ctx.slots.entries(name).find(entry =>
            entry.registrant !== REGISTRANT && entry.options.id === id);
          if (next === original) return;
          remove?.();
          remove = undefined;
          original = next;
          if (!next) return;
          if (next.children || typeof next.inject !== 'function') {
            ctx.logger.error(new Error(`Turn Diff Only: unsupported preset slot contract: ${name}`));
            return;
          }
          remove = ctx.slots.register({
            ...next.options,
            name,
            registrant: REGISTRANT,
            // SlotCore: lowest priority wins a cell.
            priority: (next.options.priority ?? 0) - 1,
            ...(next.locale === undefined ? {} : { locale: next.locale }),
            ...(next.store === undefined ? {} : { store: next.store }),
            inject: (...args) => {
              const face = next.inject(...args);
              return {
                ...face,
                hooks: { ...face.hooks, developerTools: BASIC_MODES },
              };
            },
          }, next.component);
        }
        const unsubscribe = ctx.slots.subscribe(name, sync);
        sync();
        return () => {
          disposed = true;
          unsubscribe();
          remove?.();
        };
      });
    }

    return {
      inject: ['configForms', 'slots'],
      apply(ctx) {
        basicPresetSurface(ctx, 'conversation.hero.agentPreset', undefined);
        basicPresetSurface(ctx, 'settings.section', 'agent-presets');
        ctx.effect(() => {
          let disposed = false;
          const form = ctx.configForms.get('ui-settings');
          const initialize = async () => {
            // Keep the original diff card and review tab, without cloning them.
            await ctx.configForms.describe().ensure();
            if (disposed) return;
            const snapshot = form.getSnapshot();
            if (snapshot.status !== 'ready') {
              throw new Error('Turn Diff Only: UI settings could not be loaded.');
            }
            if (snapshot.value.enabled === true) return;
            if (!snapshot.writable) {
              throw new Error('Turn Diff Only: UI settings are not writable.');
            }
            const accepted = await form.mutate([
              { op: 'set', path: ['enabled'], value: true },
            ], snapshot.revision);
            if (!accepted) throw new Error('Turn Diff Only: enabling code differences was refused; enable Coding Tools in General Settings.');
          };
          void initialize().catch(error => {
            if (!disposed) ctx.logger.error(error);
          });
          return () => { disposed = true; };
        });
      },
    };
  },
});
