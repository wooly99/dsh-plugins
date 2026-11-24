window.__ModuleLoader__.load({
  id: '@local/dsh-ui-enhancements-turn-diff',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // Component 3: split the native turn-tail preference without replacing the
    // card, its review sidebar, or the file-action child slot it owns.
    const DIFF_NS = 'ui-enhancements.turn-diff'
    const SETTINGS_SLOT = 'settings.general.item'
    const TAIL_SLOT = 'conversation.chat.turnTail'
    const DIFF_FIELD = 'showTurnCodeDiff'

    function installTurnDiff(ctx) {
      const legacy = ctx.configForms.get('ui-settings')
      const diff = ctx.configForms.get('ui-enhancements')
      const legacyValue = () => legacy.getSnapshot().value?.enabled
      const diffValue = () => diff.getSnapshot().value?.[DIFF_FIELD]
      const initialValue = () => {
        // The row id stays the same. DSH's form still exposes the saved user
        // layer even if a 1.3.0 override asserted the old module name.
        const saved = diff.getSnapshot().user?.[DIFF_FIELD]
        return typeof saved === 'boolean' ? saved : legacyValue()
      }
      let migrating

      function migrate() {
        if (typeof diffValue() === 'boolean') return Promise.resolve()
        if (migrating) return migrating
        const { status, writable, revision } = diff.getSnapshot()
        const enabled = initialValue()
        if (status !== 'ready' || !writable || typeof enabled !== 'boolean') {
          return Promise.reject(new Error('Turn diff settings are not writable'))
        }
        // Only initialize missing values. A second client may have saved its
        // own choice after this read; never overwrite that choice during migration.
        migrating = diff.mutate([{ op: 'set', path: [DIFF_FIELD], value: enabled }], revision)
          .then(ok => {
            if (!ok && typeof diffValue() !== 'boolean') throw new Error('Turn diff migration was not saved')
          }).finally(() => { migrating = undefined })
        return migrating
      }

      ctx.effect(() => ctx.locale.register(DIFF_NS, {
        zh: {
          'advanced.title': '显示高级代码工作视图',
          'advanced.description': '显示轨迹，并提供完整的 Agent 预设选项。',
          'diff.title': '显示本轮代码差异',
          'diff.description': '在每轮回复结束后显示变更文件，点击文件可查看差异。',
          'developerTools.error': '保存失败，请重试',
        },
        en: {
          'advanced.title': 'Show advanced coding view',
          'advanced.description': 'Show the trajectory and the full list of Agent presets.',
          'diff.title': 'Show code changes for each turn',
          'diff.description': 'Show changed files after a turn. Select a file to review its diff.',
          'developerTools.error': 'Could not save. Please try again.',
        },
      }), 'ui-enhancements: turn diff dictionaries')

      ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.inject(TAIL_SLOT, () => {
        let installed
        let attemptedMigration = false
        const maybeMigrate = () => {
          if (!installed || attemptedMigration || diffValue() !== undefined || typeof initialValue() !== 'boolean') return
          const { status, writable } = diff.getSnapshot()
          if (status !== 'ready' || !writable) return
          attemptedMigration = true
          void migrate().catch(error => ctx.logger.warn('Could not preserve the turn diff preference: %s', error))
        }
        const refresh = () => {
          const row = ctx.slots.entries(SETTINGS_SLOT).find(entry =>
            entry.options.id === 'developer-tools' && entry.locale === 'settings' && typeof entry.inject === 'function')
          const tail = ctx.slots.entries(TAIL_SLOT).find(entry =>
            entry.options.id === '@deepseek-ai/dsh-client-ui-deliverables' && entry.children?.['deliverables.file.actions'])
          if (installed?.row === row && installed?.tail === tail) return
          installed?.dispose()
          installed = undefined
          if (!row || !tail || !Object.getOwnPropertyDescriptor(tail, 'component')?.writable) return
          installed = { row, tail, dispose: split(row, tail) }
          maybeMigrate()
        }
        const stop = [ctx.slots.subscribe(SETTINGS_SLOT, refresh), ctx.slots.subscribe(TAIL_SLOT, refresh),
          legacy.subscribe(maybeMigrate), diff.subscribe(maybeMigrate)]
        refresh()
        return () => {
          stop.forEach(dispose => dispose())
          installed?.dispose()
        }
      }))

      function split(row, tail) {
        const NativeRow = row.component
        const NativeTail = tail.component
        let active = true
        const listeners = new Set()
        const source = {
          getSnapshot: () => (active ? diffValue() ?? initialValue() : legacyValue()) === true,
          subscribe(listener) {
            const offLegacy = legacy.subscribe(listener)
            const offDiff = diff.subscribe(listener)
            listeners.add(listener)
            return () => { offLegacy(); offDiff(); listeners.delete(listener) }
          },
        }
        // DSH rc.5 exposes no filter for this one hook. Adapt only the built-in
        // entry's component, not its declaration, so the renderer still hands
        // it the authorized renderSlot and all original callbacks.
        const useShowCodeDiff = selector => selector(React.useSyncExternalStore(source.subscribe, source.getSnapshot))
        const SplitTail = props => h(NativeTail, { ...props, useShowCodeDiff })
        const registerRow = (kind, id, order, inject) => ctx.slots.register({
          name: SETTINGS_SLOT, id, order, priority: -100, locale: DIFF_NS, inject,
        }, props => h(NativeRow, {
          ...props,
          t: (key, ...args) => props.t(key.replace(/^developerTools\.(title|description)$/, `${kind}.$1`), ...args),
        }))
        const offAdvanced = registerRow('advanced', 'developer-tools', row.options.order, () => {
          const native = row.inject()
          return { ...native, setEnabled: async enabled => { await migrate(); await native.setEnabled(enabled) } }
        })
        const offDiff = registerRow('diff', 'ui-enhancements.turn-diff', (row.options.order ?? 15) + 1, () => ({
          hooks: { developerTools: source },
          setEnabled: async enabled => {
            await migrating?.catch(() => {})
            if (!await diff.set(DIFF_FIELD, enabled)) throw new Error('Turn diff preference was not saved')
          },
        }))
        tail.component = SplitTail
        // Notify the renderer on hot enable/disable, including already rendered
        // turns. This fallback occupies the same cell behind the native entry;
        // it doesn't render a second card or declare any child slots.
        const offRefresh = ctx.slots.register({
          name: TAIL_SLOT, id: tail.options.id, order: tail.options.order, priority: 1000,
        }, () => null)
        return () => {
          active = false
          if (tail.component === SplitTail) tail.component = NativeTail
          for (const listener of [...listeners]) listener()
          offRefresh()
          offDiff()
          offAdvanced()
        }
      }
    }

    return { apply: ctx => ctx.inject(['slots', 'locale', 'configForms'], installTurnDiff) }
  },
})
