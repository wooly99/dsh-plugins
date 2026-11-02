window.__ModuleLoader__.load({
  id: '@local/dsh-archive-cleanup',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'archive-cleanup'

    const zh = {
      'row.title': '归档清理',
      'row.description.empty': '没有已归档的会话。',
      'row.description.with': '已归档 {count} 个会话，占用 {size}。',
      'row.button': '清理',
      'row.button.busy': '清理中…',
      'row.done': '已永久删除 {count} 个归档会话，释放 {size}。',
      'row.done.skipped': '已删除 {count} 个，跳过 {skipped} 个正在使用中的会话。',
      'row.error': '清理失败，请稍后重试。',
      'row.loading': '正在读取归档…',
      'row.loadError': '读取归档失败：{message}',
      'row.retry': '重试',
      'dialog.title': '清理已归档会话？',
      'dialog.description': '将永久删除 {count} 个已归档会话（约 {size}），无法恢复。正在使用中的会话会跳过。',
      'dialog.cancel': '取消',
      'dialog.confirm': '永久删除',
      'dialog.busy': '删除中…',
    }

    const en = {
      'row.title': 'Archived cleanup',
      'row.description.empty': 'No archived conversations.',
      'row.description.with': '{count} archived conversations use {size}.',
      'row.button': 'Clean up',
      'row.button.busy': 'Cleaning…',
      'row.done': 'Permanently deleted {count} archived conversations and freed {size}.',
      'row.done.skipped': 'Deleted {count}; skipped {skipped} conversations still in use.',
      'row.error': 'Cleanup failed. Try again.',
      'row.loading': 'Loading archived conversations…',
      'row.loadError': 'Could not load archives: {message}',
      'row.retry': 'Retry',
      'dialog.title': 'Delete archived conversations?',
      'dialog.description': 'Permanently deletes {count} archived conversations (about {size}). This cannot be undone. Conversations in use are skipped.',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Delete permanently',
      'dialog.busy': 'Deleting…',
    }

    const CSS = `
.ac-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; }
.ac-row-text { flex: 1; min-width: 0; }
.ac-row-title { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary, #1b1b1b); }
.ac-row-desc { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #5c5c5c); }
.ac-button { height: 32px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.16)); border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-primary, #1b1b1b); font-size: 13px; cursor: pointer; }
.ac-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.ac-button:disabled { opacity: .5; cursor: not-allowed; }
.ac-button.danger { border-color: transparent; background: var(--dsw-alias-state-error-primary, #d33); color: #fff; }
.ac-dialog { width: min(420px, calc(100vw - 48px)); margin: auto; padding: 0; border: 0; border-radius: var(--dsw-radius-panel, 14px); background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1b1b1b); box-shadow: var(--dsw-elevation-prominent, 0 18px 48px rgba(0,0,0,.22)); }
.ac-dialog::backdrop { background: rgba(0,0,0,.32); }
.ac-dialog-body { display: flex; flex-direction: column; gap: 12px; padding: 22px 24px 20px; }
.ac-dialog-body h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.ac-dialog-body p { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #5c5c5c); }
.ac-dialog-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
`

    function createStore(initial) {
      let state = initial
      const listeners = new Set()
      return {
        getSnapshot: () => state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        set(next) { state = next; for (const listener of [...listeners]) listener() },
      }
    }

    const state = createStore({ loaded: false, archived: 0, bytes: 0, error: '', busy: false, notice: '', open: false })

    function useStore(store) {
      const [snapshot, setSnapshot] = React.useState(store.getSnapshot())
      React.useEffect(() => {
        setSnapshot(store.getSnapshot())
        return store.subscribe(() => setSnapshot(store.getSnapshot()))
      }, [store])
      return snapshot
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0
      if (value < 1024) return `${value} B`
      const units = ['KB', 'MB', 'GB', 'TB']
      let size = value / 1024
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
      return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`
    }

    async function request(path, init) {
      const response = await fetch(path, { cache: 'no-store', ...init })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.ok !== true) throw new Error(body?.error?.message || `HTTP ${response.status}`)
      return body
    }

    async function refresh() {
      state.set({ ...state.getSnapshot(), loaded: false, error: '' })
      try {
        const body = await request('api/archive-cleanup.status')
        if (!Number.isInteger(body.archived) || body.archived < 0) throw new Error('Invalid archive count')
        state.set({ ...state.getSnapshot(), loaded: true, error: '', archived: body.archived, bytes: body.bytes })
      } catch (error) {
        state.set({ ...state.getSnapshot(), loaded: false, error: error.message })
      }
    }

    async function purge(t) {
      state.set({ ...state.getSnapshot(), busy: true, notice: '', open: false })
      try {
        const body = await request('api/archive-cleanup.purge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        const skipped = body.skipped?.length ?? 0
        const notice = skipped > 0
          ? t('row.done.skipped', { count: body.deleted.length, skipped })
          : t('row.done', { count: body.deleted.length, size: formatBytes(body.bytes) })
        state.set({ ...state.getSnapshot(), busy: false, notice })
        await refresh()
      } catch {
        state.set({ ...state.getSnapshot(), busy: false, notice: t('row.error') })
      }
    }

    function Row(props) {
      const t = props.t
      const snapshot = useStore(state)
      React.useEffect(() => { refresh() }, [])
      const description = snapshot.error
        ? t('row.loadError', { message: snapshot.error })
        : !snapshot.loaded ? t('row.loading')
        : snapshot.archived === 0 ? t('row.description.empty')
        : t('row.description.with', { count: snapshot.archived, size: formatBytes(snapshot.bytes) })
      return h('div', { className: 'ac-row' },
        h('div', { className: 'ac-row-text' },
          h('div', { className: 'ac-row-title' }, t('row.title')),
          h('div', { className: 'ac-row-desc' }, snapshot.notice === '' ? description : `${description} ${snapshot.notice}`),
        ),
        h('button', {
          type: 'button',
          className: 'ac-button',
          disabled: snapshot.busy || (!snapshot.error && (!snapshot.loaded || snapshot.archived === 0)),
          onClick: () => snapshot.error ? refresh() : state.set({ ...state.getSnapshot(), open: true }),
        }, snapshot.busy ? t('row.button.busy') : t(snapshot.error ? 'row.retry' : 'row.button')),
      )
    }

    function Dialog(props) {
      const t = props.t
      const snapshot = useStore(state)
      const ref = React.useRef(null)
      React.useEffect(() => {
        const element = ref.current
        if (element === null) return
        if (snapshot.open && !element.open) {
          try { element.showModal() } catch { element.setAttribute('open', '') }
        } else if (!snapshot.open && element.open) {
          element.close()
        }
      }, [snapshot.open])
      return h('dialog', {
        ref,
        className: 'ac-dialog',
        onCancel: event => { event.preventDefault(); if (!snapshot.busy) state.set({ ...state.getSnapshot(), open: false }) },
      }, snapshot.open ? h('div', { className: 'ac-dialog-body' },
        h('h2', null, t('dialog.title')),
        h('p', null, t('dialog.description', { count: snapshot.archived, size: formatBytes(snapshot.bytes) })),
        h('div', { className: 'ac-dialog-footer' },
          h('button', { type: 'button', className: 'ac-button', disabled: snapshot.busy, onClick: () => state.set({ ...state.getSnapshot(), open: false }) }, t('dialog.cancel')),
          h('button', { type: 'button', className: 'ac-button danger', disabled: snapshot.busy, onClick: () => purge(t) }, snapshot.busy ? t('dialog.busy') : t('dialog.confirm')),
        ),
      ) : null)
    }

    function installStyles() {
      if (document.querySelector(`style[data-plugin-css="${NS}"]`) !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = '@local/dsh-archive-cleanup'
      tag.dataset.pluginCss = NS
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'archive-cleanup dictionaries')
        ctx.effect(() => installStyles(), 'archive-cleanup styles')
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'archive-cleanup',
          order: 95,
          locale: NS,
        }, Row))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'archive-cleanup.dialog',
          order: 100,
          locale: NS,
        }, Dialog))
      },
    }
  },
})
