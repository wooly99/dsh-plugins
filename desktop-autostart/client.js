window.__ModuleLoader__.load({
  id: '@local/dsh-desktop-autostart',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')
    const ns = 'local-desktop-autostart'
    const copy = {
      zh: {
        title: '开机自启', hint: '登录 Windows 后自动打开 DeepSeek Harness。', loading: '正在读取…',
        adminHint: '登录 Windows 后通过计划任务以管理员身份启动。',
        repairHint: '旧启动项无法以管理员身份运行。打开开关即可迁移。',
        adminRequired: '请以管理员身份重新打开 DeepSeek Harness，再开启自启。',
        failed: '无法读取启动项。', retry: '重试', saving: '正在保存…', saveFailed: '未能确认修改，请重试。',
      },
      en: {
        title: 'Launch at login', hint: 'Open DeepSeek Harness automatically when you sign in to Windows.', loading: 'Checking…',
        adminHint: 'Use a scheduled task to launch as administrator at Windows sign-in.',
        repairHint: 'The old startup entry cannot run as administrator. Turn this on to migrate it.',
        adminRequired: 'Reopen DeepSeek Harness as administrator, then turn on launch at login.',
        failed: 'Could not read the startup entry.', retry: 'Retry', saving: 'Saving…', saveFailed: 'Could not confirm the change. Try again.',
      },
    }
    const route = 'api/local-desktop-autostart'

    async function request(enabled, signal) {
      const init = enabled === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }),
      }
      const response = await fetch(route, { ...init, cache: 'no-store', signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || `Startup request failed: ${response.status}`)
      return body
    }

    function Row({ t }) {
      const [state, setState] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [attempt, setAttempt] = useState(0)
      useEffect(() => {
        const controller = new AbortController()
        request(undefined, controller.signal).then(setState, () => {
          if (!controller.signal.aborted) setError('failed')
        })
        return () => controller.abort()
      }, [attempt])
      if (state?.supported === false) return null
      const enabled = state?.enabled === true
      const hint = !state ? 'loading' : state.needsRepair ? 'repairHint' : state.adminMode ? 'adminHint' : 'hint'
      async function toggle() {
        setError(null)
        setBusy(true)
        try { setState(await request(!enabled)) }
        catch (error) {
          setError(error.message === 'admin-required' ? 'adminRequired' : 'saveFailed')
          try { setState(await request()) } catch { setState(null) }
        } finally { setBusy(false) }
      }
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0' } },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' } }, t('title')),
          h('div', { style: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }, role: 'status' },
            t(busy ? 'saving' : error || hint))),
        state ? h('button', {
          type: 'button', role: 'switch', 'aria-label': t('title'), 'aria-checked': enabled,
          disabled: busy, onClick: toggle,
          style: { position: 'relative', flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 0, padding: 0,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1,
            background: enabled ? 'var(--dsw-alias-brand-primary, AccentColor)' : 'var(--dsw-alias-label-tertiary, GrayText)' },
        }, h('span', { 'aria-hidden': true, style: { position: 'absolute', top: 3, left: enabled ? 19 : 3, width: 14, height: 14,
          borderRadius: '50%', background: 'var(--dsw-alias-label-inverse, Canvas)' } }))
          : error && h('button', { type: 'button', onClick: () => { setError(null); setAttempt(attempt + 1) } }, t('retry')))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, copy))
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item', id: ns, order: 65, locale: ns,
        }, Row))
      },
    }
  },
})
