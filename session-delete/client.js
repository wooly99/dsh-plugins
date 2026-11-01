window.__ModuleLoader__.load({
  id: '@local/dsh-session-delete',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace this browser half owns. */
    const NS = 'session-delete'

    /** Relative route; the browser resolves it against the document base. */
    const DELETE_ROUTE = 'api/session.delete'

    /** Menu row position: after the shipped session-id row (450). */
    const MENU_ORDER = 500

    const zh = {
      'menu.delete': '删除会话',
      'dialog.title': '删除会话？',
      'dialog.description': '将永久删除“{title}”的聊天记录，此操作无法撤销。',
      'dialog.untitled': '未命名会话',
      'dialog.cancel': '取消',
      'dialog.confirm': '删除',
      'dialog.deleting': '正在删除…',
      'dialog.close': '关闭',
      'error.running': '该会话正在运行，请先停止当前任务再删除。',
      'error.busy': '该会话仍在使用中，请先切换到其它会话，或停止正在运行的任务。',
      'error.notFound': '会话不存在，可能已经被删除。',
      'error.storage': '找不到该会话的存储位置，未删除任何内容。',
      'error.network': '无法连接 Harness，请稍后重试。',
      'error.withDetail': '删除失败：{message}',
      'error.generic': '删除失败，请稍后重试。',
    }

    const en = {
      'menu.delete': 'Delete conversation',
      'dialog.title': 'Delete conversation?',
      'dialog.description': 'The chat history of “{title}” will be permanently deleted. This cannot be undone.',
      'dialog.untitled': 'Untitled conversation',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Delete',
      'dialog.deleting': 'Deleting…',
      'dialog.close': 'Close',
      'error.running': 'This conversation is still running. Stop its work before deleting it.',
      'error.busy': 'This conversation is still in use. Switch to another conversation, or stop its running work.',
      'error.notFound': 'That conversation no longer exists.',
      'error.storage': 'The conversation’s storage could not be located, so nothing was deleted.',
      'error.network': 'Could not reach the Harness. Try again.',
      'error.withDetail': 'Delete failed: {message}',
      'error.generic': 'Delete failed. Try again.',
    }

    const CSS = `
.sd-menu-item-wrap { position: relative; width: 100%; }
.sd-menu-separator { height: 1px; margin: 6px 8px; background: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08)); }
.sd-menu-item { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 6px 8px; border: none; border-radius: var(--dsw-radius-md, 8px); background: transparent; cursor: pointer; font-size: 13px; line-height: 20px; text-align: left; color: var(--dsw-alias-label-primary, #1b1b1b); }
.sd-menu-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05)); }
.sd-menu-item:focus-visible:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05)); outline: none; }
.sd-menu-item.sd-danger { color: var(--dsw-alias-state-error-primary, #d33); }
.sd-menu-item.sd-danger:hover:not(:disabled), .sd-menu-item.sd-danger:focus-visible:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(211, 51, 51, 0.1)); }
.sd-menu-item svg { flex: none; }
.sd-menu-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-dialog { box-sizing: border-box; width: min(420px, calc(100vw - 48px)); margin: auto; padding: 0; border: 0; pointer-events: auto; border-radius: var(--dsw-radius-panel, 14px); background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1b1b1b); box-shadow: var(--dsw-elevation-prominent, 0 18px 48px rgba(0, 0, 0, 0.22)); }
.sd-dialog::backdrop { background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.32)); }
.sd-dialog-content { display: flex; flex-direction: column; gap: 12px; padding: 22px 24px 20px; }
.sd-dialog-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.sd-dialog-description { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #5c5c5c); }
.sd-dialog-error { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-state-error-primary, #d33); }
.sd-dialog-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.sd-button { height: 34px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.16)); border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-primary, #1b1b1b); font-size: 14px; line-height: 20px; cursor: pointer; }
.sd-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05)); }
.sd-button:disabled { opacity: 0.5; cursor: not-allowed; }
.sd-button.sd-danger { border-color: transparent; background: var(--dsw-alias-state-error-primary, #d33); color: var(--dsw-alias-label-primary-foreground, #fff); }
.sd-button.sd-danger:hover:not(:disabled) { background: var(--dsw-alias-state-error-primary, #d33); filter: brightness(0.94); }
`

    /**
     * Minimal selector-store compatible with the slot hook shape used by
     * shipped UI, so the menu row and the overlay share one dialog state.
     * @param {object} initial - First snapshot.
     */
    function createStore(initial) {
      let state = initial
      const listeners = new Set()
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set(next) {
          state = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /** Idle dialog snapshot. */
    function idleDialog() {
      return { open: false, sessionId: null, title: '', busy: false, error: '' }
    }

    /** Shared confirmation state; one dialog at a time. */
    const dialog = createStore(idleDialog())

    /**
     * Subscribe a component to a store.
     * @param {{ getSnapshot: () => any, subscribe: (fn: () => void) => () => void }} store
     */
    function useStore(store) {
      const [snapshot, setSnapshot] = React.useState(store.getSnapshot())
      React.useEffect(() => {
        setSnapshot(store.getSnapshot())
        return store.subscribe(() => setSnapshot(store.getSnapshot()))
      }, [store])
      return snapshot
    }

    /**
     * @param {number} ms - Delay.
     * @returns {Promise<void>} Resolution after the delay.
     */
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Open the dialog for one row.
     * @param {string} sessionId - Session to delete.
     * @param {string} title - Row display title.
     */
    function requestDelete(sessionId, title) {
      if (dialog.getSnapshot().busy) return
      dialog.set({ open: true, sessionId, title, busy: false, error: '' })
    }

    /** Close the dialog unless a deletion is in flight. */
    function cancelDelete() {
      if (dialog.getSnapshot().busy) return
      dialog.set(idleDialog())
    }

    /**
     * @param {string} code - Host failure code.
     * @param {string} detail - Host failure message.
     * @param {(key: string, params?: object) => string} t - Bound translator.
     * @returns {string} Localized explanation.
     */
    function failureText(code, detail, t) {
      switch (code) {
        case 'session_not_found':
          return t('error.notFound')
        case 'session_busy':
          return t('error.busy')
        case 'storage_unavailable':
          return t('error.storage')
        case 'delete_failed':
          return detail ? t('error.withDetail', { message: detail }) : t('error.generic')
        case 'invalid_request':
          return detail ? t('error.withDetail', { message: detail }) : t('error.generic')
        case 'network':
          return t('error.network')
        default:
          return detail ? t('error.withDetail', { message: detail }) : t('error.generic')
      }
    }

    /**
     * POST one deletion.
     * @param {string} sessionId - Session to delete.
     * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>} Outcome.
     */
    async function postDelete(sessionId) {
      let response
      try {
        response = await fetch(DELETE_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
      } catch (error) {
        return { ok: false, code: 'network', message: error instanceof Error ? error.message : String(error) }
      }
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (response.ok && body?.ok === true) return { ok: true }
      const code = typeof body?.error?.code === 'string' ? body.error.code : 'delete_failed'
      const reason = typeof body?.error?.reason === 'string' ? body.error.reason : undefined
      const message = typeof body?.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`
      return { ok: false, code, reason, message }
    }

    /**
     * Whether this Session is the conversation currently shown in the main view.
     * @param {string} sessionId - Row Session.
     * @returns {boolean} True when the main panel retains it.
     */
    function isMainView(ctx, sessionId) {
      const sessions = ctx.get('sessions')
      try {
        const info = sessions?.retainInfo?.(sessionId)?.getSnapshot?.()
        return (info?.retainedBy?.mainView ?? 0) > 0
      } catch {
        return false
      }
    }

    /**
     * Leave a conversation before deleting it: open the newest other
     * conversation of the same workspace, or start a fresh one there, so the
     * deleted log is no longer held by the main view.
     * @param {any} ctx - Browser context.
     * @param {string} sessionId - Session being deleted.
     * @returns {boolean} Whether a navigation was issued.
     */
    function leaveConversation(ctx, sessionId) {
      const uiWorkspace = ctx.get('uiWorkspace')
      if (uiWorkspace === undefined) return false
      const sessions = ctx.get('sessions')
      const workspaces = ctx.get('workspaces')
      const list = sessions?.list?.getSnapshot?.()
      const workspaceState = workspaces?.list?.getSnapshot?.()
      const workspace = workspaceState?.items?.find((item) => (item.sessionIds ?? []).map(String).includes(sessionId))
      const archived = new Set((workspaceState?.archivedSessionIds ?? []).map(String))
      const candidates = []
      const consider = (id) => {
        const key = String(id)
        if (key === sessionId || archived.has(key)) return
        const row = list?.byId?.[key]
        if (row === undefined || row.blank === true) return
        if (!candidates.includes(key)) candidates.push(key)
      }
      for (const id of workspace?.sessionIds ?? []) consider(id)
      if (candidates.length === 0) for (const id of list?.ids ?? []) consider(id)
      try {
        if (candidates.length > 0) {
          uiWorkspace.openSession(candidates[0])
          return true
        }
        if (workspace !== undefined) {
          uiWorkspace.startSession(workspace.workspaceId)
          return true
        }
        uiWorkspace.startSession()
        return true
      } catch (error) {
        console.warn('[session-delete] could not leave the conversation first:', error)
        return false
      }
    }

    /**
     * Delete one Session: leave it when it is the main view, then ask the Host
     * and retry while the detached Agent finishes closing.
     * @param {any} ctx - Browser context.
     * @param {string} sessionId - Session to delete.
     * @param {(key: string, params?: object) => string} t - Bound translator.
     * @returns {Promise<string>} Empty on success, otherwise the localized error.
     */
    async function deleteSession(ctx, sessionId, t) {
      const sessions = ctx.get('sessions')
      const row = sessions?.list?.getSnapshot?.()?.byId?.[sessionId]
      if (row?.running === true) return t('error.running')

      let left = false
      if (isMainView(ctx, sessionId)) {
        left = leaveConversation(ctx, sessionId)
        if (left) await delay(400)
      }

      let outcome = await postDelete(sessionId)
      for (let attempt = 0; left && attempt < 3 && !outcome.ok && outcome.code === 'session_busy'; attempt += 1) {
        await delay(400)
        outcome = await postDelete(sessionId)
      }
      if (outcome.ok) return ''
      if (outcome.code === 'session_busy') return outcome.reason === 'turn' ? t('error.running') : t('error.busy')
      return failureText(outcome.code, outcome.message, t)
    }

    /** Menu row: the destructive entry that raises the confirmation. */
    function SessionDeleteMenuItem(props) {
      const { sessionId, displayTitle, useMenuOpenState, t } = props
      const [, setMenuOpen] = useMenuOpenState()
      return h(
        'div',
        { className: 'sd-menu-item-wrap' },
        h('div', { className: 'sd-menu-separator', role: 'separator' }),
        h(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            className: 'sd-menu-item sd-danger',
            onClick: () => {
              setMenuOpen(false)
              requestDelete(String(sessionId), typeof displayTitle === 'string' ? displayTitle : '')
            },
          },
          h(
            'svg',
            {
              width: 14,
              height: 14,
              viewBox: '0 0 16 16',
              'aria-hidden': true,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
            h('path', { d: 'M2.5 4.5h11' }),
            h('path', { d: 'M6 4.5V3.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7v1.3' }),
            h('path', { d: 'M4.2 4.5l.6 8.1c0 .5.4.9.9.9h4.6c.5 0 .9-.4.9-.9l.6-8.1' }),
            h('path', { d: 'M6.8 7v4.2M9.2 7v4.2' }),
          ),
          h('span', { className: 'sd-menu-label' }, t('menu.delete')),
        ),
      )
    }

    /** Frame-wide confirmation dialog; the native element supplies focus trapping. */
    function SessionDeleteDialog(props) {
      const state = useStore(dialog)
      const t = props.t
      const dialogRef = React.useRef(null)

      React.useEffect(() => {
        const element = dialogRef.current
        if (element === null) return
        if (state.open) {
          if (!element.open) {
            try {
              element.showModal()
            } catch {
              element.setAttribute('open', '')
            }
          }
        } else if (element.open) {
          element.close()
        }
      }, [state.open])

      React.useEffect(() => {
        const element = dialogRef.current
        if (element === null) return
        const onCancel = (event) => {
          event.preventDefault()
          if (!dialog.getSnapshot().busy) dialog.set(idleDialog())
        }
        element.addEventListener('cancel', onCancel)
        return () => element.removeEventListener('cancel', onCancel)
      }, [])

      /**
       * @param {MouseEvent} event - Click inside the dialog.
       */
      function onDialogClick(event) {
        if (event.target !== dialogRef.current) return
        if (dialog.getSnapshot().busy) return
        dialog.set(idleDialog())
      }

      /**
       * @param {MouseEvent} event - Backdrop-adjacent click guard.
       */
      function onBackdropClick(event) {
        event.stopPropagation()
      }

      /** Confirm the pending deletion. */
      async function confirm() {
        const current = dialog.getSnapshot()
        if (current.sessionId === null || current.busy) return
        dialog.set({ ...current, busy: true, error: '' })
        const error = await deleteSession(props.ctx, current.sessionId, t)
        if (error === '') {
          dialog.set(idleDialog())
          return
        }
        dialog.set({ ...dialog.getSnapshot(), busy: false, error })
      }

      const title = state.title === '' ? t('dialog.untitled') : state.title
      return h(
        'dialog',
        {
          ref: dialogRef,
          className: 'sd-dialog',
          'aria-labelledby': 'sd-dialog-title',
          'aria-describedby': 'sd-dialog-description',
          onClick: onDialogClick,
        },
        state.open
          ? h(
              'div',
              { className: 'sd-dialog-content', onClick: onBackdropClick },
              h('h2', { id: 'sd-dialog-title', className: 'sd-dialog-title' }, t('dialog.title')),
              h('p', { id: 'sd-dialog-description', className: 'sd-dialog-description' }, t('dialog.description', { title })),
              state.error === '' ? null : h('p', { className: 'sd-dialog-error', role: 'alert' }, state.error),
              h(
                'div',
                { className: 'sd-dialog-footer' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'sd-button',
                    autoFocus: true,
                    disabled: state.busy,
                    onClick: () => dialog.set(idleDialog()),
                  },
                  t('dialog.cancel'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'sd-button sd-danger',
                    disabled: state.busy,
                    onClick: confirm,
                  },
                  state.busy ? t('dialog.deleting') : t('dialog.confirm'),
                ),
              ),
            )
          : null,
      )
    }

    /**
     * Install the package stylesheet once for this page.
     * @returns {() => void} Remover.
     */
    function installStyles() {
      const existing = document.querySelector('style[data-plugin-css="' + NS + '"]')
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = '@local/dsh-session-delete'
      tag.dataset.pluginCss = NS
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        tag.remove()
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-delete: dictionaries')
        ctx.effect(() => installStyles(), 'session-delete: styles')

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'session-delete',
              order: MENU_ORDER,
              locale: NS,
            },
            SessionDeleteMenuItem,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'session-delete.dialog',
              order: 100,
              locale: NS,
            },
            function SessionDeleteOverlay(props) {
              return h(SessionDeleteDialog, { ...props, ctx })
            },
          ),
        )
      },
    }
  },
})
