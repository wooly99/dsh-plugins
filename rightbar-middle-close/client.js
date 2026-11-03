window.__ModuleLoader__.load({
  // Keep the original package identity so existing installations do not duplicate it.
  id: '@local/dsh-rightbar-middle-close',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'ui-enhancements'
    const HEADER_SLOT = 'conversation.session.header.actions'

    // Component 1: middle-click close. Only ARIA tab chips within a right sidebar
    // qualify; tab bodies carry the same data marker and must never qualify.
    const TAB_CHIP = '[role="tab"]'
    const TAB_MARKER = '[data-sidebar-right-tab]'
    const SESSION_ROOT = '[data-sidebar-right-session]'

    function tabIdAt(target) {
      if (!(target instanceof Element)) return undefined
      const chip = target.closest(TAB_CHIP)
      if (chip === null || chip.closest(SESSION_ROOT) === null) return undefined
      const marker = chip.matches(TAB_MARKER) ? chip : chip.querySelector(TAB_MARKER)
      const id = chip.dataset.sidebarRightTab ?? chip.dataset.dockkitTab ?? marker?.dataset.sidebarRightTab
      return typeof id === 'string' && id !== '' ? id : undefined
    }

    function installMiddleClick(ctx) {
      function onMouseDown(event) {
        if (event.button === 1 && tabIdAt(event.target) !== undefined) event.preventDefault()
      }
      function onAuxClick(event) {
        if (event.button !== 1) return
        const tabId = tabIdAt(event.target)
        if (tabId === undefined) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        try {
          // Same controller as ×: preserves close handlers and last-tab behavior.
          ctx.sidebarRight.close(tabId)
        } catch (error) {
          console.warn('[ui-enhancements] could not close the tab:', error)
        }
      }
      ctx.effect(() => {
        document.addEventListener('mousedown', onMouseDown, true)
        document.addEventListener('auxclick', onAuxClick, true)
        return () => {
          document.removeEventListener('mousedown', onMouseDown, true)
          document.removeEventListener('auxclick', onAuxClick, true)
        }
      }, 'ui-enhancements: middle-button tab close')
    }

    // Component 2: a passive header label. Use the slot's session, not a global
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
        order: 0, // Native mode label is -10; show immediately after it.
        locale: NS,
      }, WorkspaceHeader))
    }

    // Component 3: collapsed workspace summaries. Workspace headers currently
    // have no extension slot. Only append our own leaf to existing row markers;
    // never replace React-owned rows, controls, classes, or expansion state.
    const WORKSPACE_ROW = '[role="treeitem"][data-row-key^="workspace:"][aria-expanded]'
    const STATUS_MARKER = 'collapsed-workspace-status'
    const STATUS_NS = 'ui-enhancements.workspace-status'
    const STATUS_CSS = `
[data-ui-enhancements="collapsed-workspace-status"] { display:inline-flex; flex:none; align-items:center; justify-content:center; width:16px; height:20px; }
[data-ui-enhancements="collapsed-workspace-status"]::before { content:""; display:block; box-sizing:border-box; width:6px; height:6px; border-radius:50%; background:var(--dsw-alias-state-business-primary, #60a5fa); }
[data-ui-enhancements="collapsed-workspace-status"][data-status="running"]::before { width:13px; height:13px; background:none; border:1.5px solid var(--dsw-alias-label-secondary, #999); border-top-color:transparent; animation:uie-workspace-spin .85s linear infinite; }
[data-ui-enhancements="collapsed-workspace-status"][data-status="waiting"]::before { background:var(--dsw-alias-state-warning-primary, #e8ac40); }
@keyframes uie-workspace-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { [data-ui-enhancements="collapsed-workspace-status"]::before { animation:none !important; } }
`

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

    return {
      apply(ctx) {
        // Each component has its own dependency scope and unload lifecycle.
        ctx.inject(['sidebarRight'], installMiddleClick)
        ctx.inject(['slots', 'locale'], installWorkspaceHeader)
        ctx.inject(['sessions', 'workspaces', 'uiSession', 'locale'], installCollapsedWorkspaceStatus)
      },
    }
  },
})
