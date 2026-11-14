import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const SLOT = 'conversation.session.header.utilities'

function browser({ slots = true } = {}) {
  const events = new Map(), rows = new Map(), dictionaries = {}, closes = [], cleanups = [], injections = []
  const ctx = {
    effect(callback) { const cleanup = callback(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
    sidebarRight: { close: id => closes.push(id) },
    ...(slots ? {
      locale: { register(_namespace, values) { Object.assign(dictionaries, values.zh); return () => { for (const key of Object.keys(dictionaries)) delete dictionaries[key] } } },
      slots: {
        inject(name, callback) { assert.equal(name, SLOT); const cleanup = callback(); cleanups.push(cleanup) },
        register(spec, component) {
          rows.set(spec.name, { spec, component })
          return () => rows.delete(spec.name)
        },
      },
    } : {}),
    inject(services, callback) {
      injections.push(Array.from(services))
      if (services.every(name => ctx[name])) callback(ctx)
    },
  }
  let definition
  runInNewContext(source, {
    console,
    document: {
      addEventListener(name, callback, capture) { assert.equal(capture, true); events.set(name, callback) },
      removeEventListener(name, callback, capture) {
        assert.equal(capture, true); assert.equal(events.get(name), callback); events.delete(name)
      },
    },
    window: { __ModuleLoader__: { load(module) {
      assert.equal(module.id, '@local/dsh-ui-enhancements')
      definition = module.factory(name => {
        assert.equal(name, 'react')
        return { createElement: (type, props, ...children) => ({ type, props, children }) }
      })
    } } },
  })
  definition.apply(ctx)
  const t = key => dictionaries[key]
  return {
    events, rows, closes, injections,
    render(sessionId, sessions, workspaces = []) {
      return rows.get(SLOT).component({ sessionId, t,
        useSessions: selector => selector({ byId: sessions }),
        useWorkspaces: selector => selector({ items: workspaces }),
      })
    },
    dispose() { for (const cleanup of cleanups.reverse()) cleanup() },
  }
}
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('')

test('workspace components do not inject the sidebar or register mouse listeners', () => {
  const ui = browser()
  assert.deepEqual(ui.injections, [['slots', 'locale'], ['sessions', 'workspaces', 'uiSession', 'locale']])
  assert.equal(ui.events.size, 0)
  assert.deepEqual(ui.closes, [])
  assert.equal(ui.rows.get(SLOT).spec.order, -1000)
  assert.equal(ui.rows.get(SLOT).spec.locale, 'ui-enhancements')
  ui.dispose()
  assert.equal(ui.events.size, 0)
  assert.equal(ui.rows.size, 0)
  const noSlots = browser({ slots: false })
  assert.equal(noSlots.events.size, 0)
  assert.equal(noSlots.rows.size, 0)
  noSlots.dispose()
})

test('workspace name and root belong to the rendered session, not another selected session or cwd', () => {
  const ui = browser()
  const sessions = { a: { cwd: 'D:\\repo\\subdir' }, b: { cwd: '/tmp/other' } }
  const workspaces = [
    { title: '另一个项目', path: '/tmp/other', sessionIds: ['b'] },
    { title: '我的项目', path: 'D:\\repo', sessionIds: ['a'] },
  ]
  const a = ui.render('a', sessions, workspaces)
  assert.equal(text(a), '我的项目')
  assert.equal(a.props.title, '工作区: 我的项目\nD:\\repo')
  assert.equal(a.props['aria-label'], a.props.title)
  assert.equal(text(ui.render('b', sessions, workspaces)), '另一个项目')
  // Rerender from updated selectors: rename, reassignment, and cwd changes.
  workspaces[1].title = '重命名'
  assert.equal(text(ui.render('a', sessions, workspaces)), '重命名')
  workspaces[1].sessionIds = []
  assert.equal(text(ui.render('a', sessions, workspaces)), 'subdir')
  sessions.a.cwd = '/changed/work'
  assert.equal(text(ui.render('a', sessions, workspaces)), 'work')
  ui.dispose()
})

test('directory fallback handles Windows, UNC, POSIX, trailing separators, and roots', () => {
  const ui = browser()
  for (const [cwd, label] of [
    ['D:\\projects\\dsh-plugins', 'dsh-plugins'],
    ['\\\\server\\share\\folder\\', 'folder'],
    ['/home/user/repo/', 'repo'], ['/', '/'], ['C:\\', 'C:'],
  ]) {
    const node = ui.render('a', { a: { cwd } })
    assert.equal(text(node), label)
    assert.ok(node.props.title.endsWith(cwd))
  }
  ui.dispose()
})

test('default workspace is localized and missing paths stay hidden', () => {
  const ui = browser()
  assert.equal(text(ui.render('a', {}, [{ title: 'default-workspace', path: '/home/default-workspace', sessionIds: ['a'] }])), '默认工作区')
  assert.equal(ui.render('missing', {}), null)
  assert.equal(ui.render('a', { a: { cwd: '' } }), null)
  ui.dispose()
})

test('long names are bounded with ellipsis but preserve the full path in accessible text', () => {
  const ui = browser(), path = 'D:\\' + 'long-name'.repeat(60)
  const node = ui.render('a', { a: { cwd: path } })
  assert.equal(node.props.style.maxWidth, 'min(240px, 25vw)')
  assert.equal(node.children[1].props.style.textOverflow, 'ellipsis')
  assert.ok(node.props.title.includes(path))
  assert.equal(node.children[0].props['aria-hidden'], true)
  assert.equal(node.props.onClick, undefined)
  ui.dispose()
})

test('bundle uses the UI enhancements identity and declares the Desktop renderer dependencies', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.equal(pkg.name, '@local/dsh-ui-enhancements')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(!pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-workspace'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
  assert.match(patch, /name: '@local\/dsh-ui-enhancements'/)
  for (const lang of ['zh', 'en']) {
    const locale = JSON.parse(await readFile(new URL(`../locale/${lang}.json`, import.meta.url), 'utf8'))
    assert.equal(locale.meta.title, lang === 'zh' ? '界面小增强' : 'UI Enhancements')
  }
})
