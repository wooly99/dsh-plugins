window.__ModuleLoader__.load({
  id: '@local/dsh-ui-enhancements-workspace-header',
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

    return { apply: ctx => ctx.inject(['slots', 'locale'], installWorkspaceHeader) }
  },
})
