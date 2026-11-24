window.__ModuleLoader__.load({
  id: '@local/dsh-ui-enhancements',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'ui-enhancements'
    const HEADER_SLOT = 'conversation.session.header.actions'

    // Component 1: a passive header label. Use the slot's session, not a global
    // selection or the agent process cwd (which can refer to a different session).
    function WorkspaceHeader({ sessionId, useSessions, useWorkspaces, t }) {
      const cwd = useSessions(state => state.byId[sessionId]?.cwd)
      const workspace = useWorkspaces(state => state.items.find(item => item.sessionIds.includes(sessionId)))
      const path = workspace?.path || cwd
      if (typeof path !== 'string' || path === '') return null
      const basename = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || path
      const label = workspace?.title === 'default-workspace'
        ? t('workspace.defaultName')
        : workspace?.title || basename
      const hint = `${t('workspace.label')}: ${label}\n${path}`
      return h('span', {
        'data-ui-enhancements': 'session-workspace',
        title: hint,
        'aria-label': hint,
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 5,
          minWidth: 0, maxWidth: 'min(240px, 25vw)', flex: '0 1 auto',
          color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px',
        },
      },
      h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false, style: { flexShrink: 0 },
      }, h('path', { d: 'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z' })),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label))
    }

    function installWorkspaceHeader(ctx) {
      ctx.effect(() => ctx.locale.register(NS, {
        zh: { 'workspace.label': '工作区', 'workspace.defaultName': '默认工作区' },
        en: { 'workspace.label': 'Workspace', 'workspace.defaultName': 'Default workspace' },
      }), 'ui-enhancements: workspace dictionaries')
      ctx.slots.inject(HEADER_SLOT, () => ctx.slots.register({
        name: HEADER_SLOT,
        id: 'ui-enhancements.session-workspace',
        order: 1000, // Trail the left title/action group, before the right utilities.
        locale: NS,
      }, WorkspaceHeader))
    }

    // Component 2: collapsed workspace summaries. Workspace headers currently
    // have no extension slot. Only append our own leaf to existing row markers;
    // never replace React-owned rows, controls, classes, or expansion state.
    const WORKSPACE_ROW = '[role="treeitem"][data-row-key^="workspace:"][aria-expanded]'
    const STATUS_MARKER = 'collapsed-workspace-status'
    const STATUS_NS = 'ui-enhancements.workspace-status'
    // Mirror native StateDot markup, tokens and animation without importing an
    // unstable Harness Client module or depending on its generated CSS classes.
    const STATUS_CSS = `
[data-ui-enhancements="collapsed-workspace-status"] { display:inline-flex; flex:none; align-items:center; justify-content:center; width:16px; height:20px; }
[data-ui-enhancements="collapsed-workspace-status"]::before { content:""; display:block; flex:none; box-sizing:border-box; width:6px; height:6px; border-radius:50%; corner-shape:round; background:var(--dsw-alias-state-success-primary); }
[data-ui-enhancements="collapsed-workspace-status"][data-status="running"]::before { display:none; }
[data-ui-enhancements="collapsed-workspace-status"][data-status="waiting"]::before { background:var(--dsw-alias-state-warn-primary); }
[data-ui-enhancements="collapsed-workspace-status"] > .uie-workspace-spinner { display:none; flex:none; color:var(--dsw-alias-label-tertiary); }
[data-ui-enhancements="collapsed-workspace-status"][data-status="running"] > .uie-workspace-spinner { display:block; }
.uie-workspace-spinner-motion { transform-origin:center; animation:uie-workspace-spin 1.5s linear infinite; }
.uie-workspace-spinner-track, .uie-workspace-spinner-arc { fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
.uie-workspace-spinner-track { opacity:.25; }
.uie-workspace-spinner-arc { stroke-dasharray:12 150; animation:uie-workspace-dash 1.5s ease-in-out infinite; }
@keyframes uie-workspace-spin { to { transform:rotate(360deg); } }
@keyframes uie-workspace-dash { 0% { stroke-dasharray:12 150; stroke-dashoffset:0; } 50% { stroke-dasharray:24 150; stroke-dashoffset:-6; } to { stroke-dasharray:12 150; stroke-dashoffset:0; } }
@media (prefers-reduced-motion:reduce) { .uie-workspace-spinner-motion, .uie-workspace-spinner-arc { animation:none; } .uie-workspace-spinner-arc { stroke-dasharray:18 150; stroke-dashoffset:-3; } }
`

    function createWorkspaceSpinner() {
      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg')
      for (const [key, value] of Object.entries({
        class: 'uie-workspace-spinner', width: 14, height: 14,
        viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
      })) svg.setAttribute(key, value)
      const motion = document.createElementNS(svgNS, 'g')
      motion.setAttribute('class', 'uie-workspace-spinner-motion')
      for (const part of ['track', 'arc']) {
        const circle = document.createElementNS(svgNS, 'circle')
        for (const [key, value] of Object.entries({
          class: `uie-workspace-spinner-${part}`, cx: 12, cy: 12, r: 9.5,
        })) circle.setAttribute(key, value)
        motion.appendChild(circle)
      }
      svg.appendChild(motion)
      return svg
    }

    function workspaceStatuses(list, workspaces, statuses) {
      const archived = new Set(workspaces.archivedSessionIds)
      const result = new Map()
      for (const workspace of workspaces.items) {
        const running = new Set(), waiting = new Set(), completed = new Set()
        for (const id of new Set(workspace.sessionIds)) {
          const summary = list.byId[id]
          if (!summary || summary.blank || summary.origin === 'subagent' || archived.has(id)) continue
          const status = statuses.get(id)
          const pending = ['approval', 'plan-review', 'question'].includes(status?.pendingInteraction?.kind)
          if (pending) waiting.add(id)
          else if ((status?.running ?? summary.running) === true) running.add(id)
          else if (status?.completionUnread === true) completed.add(id)
          // Match the native row's running-child catalog; child completion is
          // NOT a parent completion. Do not infer membership from path prefixes.
          for (const child of list.projectionsBySession?.[id]?.values.subagentCatalog ?? []) {
            if (!archived.has(child.id) && (statuses.get(child.id)?.running ?? list.byId[child.id]?.running) === true) running.add(child.id)
          }
        }
        const state = running.size ? 'running' : waiting.size ? 'waiting' : completed.size ? 'done' : undefined
        if (state) result.set(workspace.workspaceId, { state, running: running.size, waiting: waiting.size, done: completed.size })
      }
      return result
    }

    function installCollapsedWorkspaceStatus(ctx) {
      ctx.effect(() => ctx.locale.register(STATUS_NS, {
        zh: {
          running: '{count} 个会话正在运行', waiting: '{count} 个会话等待审批或回答',
          done: '{count} 个会话有完成结果待查看',
        },
        en: {
          running: '{count} running sessions', waiting: '{count} sessions awaiting approval or an answer',
          done: '{count} sessions with unread completion results',
        },
      }), 'ui-enhancements: collapsed workspace dictionaries')
      const t = ctx.locale.bind(STATUS_NS)
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.uiEnhancements = 'workspace-status-styles'
        style.textContent = STATUS_CSS
        document.head.appendChild(style)
        const markers = new Map()
        let states = new Map()
        let disposed = false

        function syncRows() {
          if (disposed) return
          const keep = new Set()
          for (const row of document.querySelectorAll(WORKSPACE_ROW)) {
            if (row.getAttribute('aria-expanded') !== 'false') continue
            const key = row.getAttribute('data-row-key').slice('workspace:'.length)
            const status = states.get(key)
            if (!status) continue
            keep.add(row)
            let marker = markers.get(row)
            if (!marker) {
              marker = document.createElement('span')
              marker.dataset.uiEnhancements = STATUS_MARKER
              marker.setAttribute('role', 'img')
              marker.appendChild(createWorkspaceSpinner())
              markers.set(row, marker)
            }
            // Appending after the action group reserves a separate trailing cell,
            // so hover menus/new-session controls remain usable and unobscured.
            if (marker.parentNode !== row) row.appendChild(marker)
            const hint = ['running', 'waiting', 'done']
              .filter(kind => status[kind] > 0)
              .map(kind => t(kind, { count: status[kind] })).join('\n')
            if (marker.dataset.status !== status.state) marker.dataset.status = status.state
            if (marker.title !== hint) {
              marker.title = hint
              marker.setAttribute('aria-label', hint)
            }
          }
          for (const [row, marker] of markers) {
            if (keep.has(row)) continue
            marker.remove()
            markers.delete(row)
          }
        }

        function refresh() {
          states = workspaceStatuses(ctx.sessions.list.getSnapshot(), ctx.workspaces.list.getSnapshot(), ctx.uiSession.sessionStatus.getSnapshot())
          syncRows()
        }
        // Watch only row structure/expansion changes, not chat text streaming.
        // Ignore our own attribute updates and make leaf insertion idempotent.
        const observer = new MutationObserver(records => {
          const hasRow = node => node.nodeType === 1 && (node.matches(WORKSPACE_ROW) || node.querySelector(WORKSPACE_ROW) !== null)
          if (records.some(record => record.type === 'attributes'
            ? record.target.matches(WORKSPACE_ROW) || markers.has(record.target)
            : record.target.closest?.(WORKSPACE_ROW) || [...record.addedNodes, ...record.removedNodes].some(hasRow))) syncRows()
        })
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded', 'data-row-key'] })
        const unsubscribes = [
          ctx.sessions.list.subscribe(refresh),
          ctx.workspaces.list.subscribe(refresh),
          ctx.uiSession.sessionStatus.subscribe(refresh),
          ctx.locale.subscribe(syncRows),
        ]
        refresh()
        return () => {
          disposed = true
          observer.disconnect()
          for (const unsubscribe of unsubscribes) unsubscribe()
          for (const marker of markers.values()) marker.remove()
          markers.clear()
          style.remove()
        }
      }, 'ui-enhancements: collapsed workspace status')
    }

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

    return {
      apply(ctx) {
        // A single browser module follows the three Host entries. A namespace
        // disappears when its component is disabled, so only that effect ends.
        const mount = (namespace, needs, install) => ctx.inject(['configForms', ...needs], child => {
          child.effect(() => child.configForms.whileServed([namespace], () => {
            const stop = child.effect(() => { install(child) }, `ui-enhancements: ${namespace} active`)
            return () => { void stop() }
          }), `ui-enhancements: watch ${namespace}`)
        })
        mount('ui-enhancements-workspace-header', ['slots', 'locale'], installWorkspaceHeader)
        mount('ui-enhancements-workspace-status', ['sessions', 'workspaces', 'uiSession', 'locale'], installCollapsedWorkspaceStatus)
        mount('ui-enhancements', ['slots', 'locale'], installTurnDiff)
      },
    }
  },
})
