window.__ModuleLoader__.load({
  id: '@local/dsh-ui-enhancements-workspace-status',
  factory() {
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

    return { apply: ctx => ctx.inject(['sessions', 'workspaces', 'uiSession', 'locale'], installCollapsedWorkspaceStatus) }
  },
})
