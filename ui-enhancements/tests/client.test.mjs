import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const SLOT = 'conversation.session.header.actions'

function browser({ slots = true } = {}) {
  const events = new Map(), rows = new Map(), dictionaries = {}, closes = [], cleanups = [], injections = []
  const ctx = {
    configForms: { whileServed([ns], start) { if (ns === 'ui-enhancements-workspace-header') start(); return () => {} } },
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

test('the workspace label activates only its own dependency scope', () => {
  const ui = browser()
  assert.deepEqual(ui.injections[0], ['configForms', 'slots', 'locale'])
  assert.equal(ui.events.size, 0)
  assert.deepEqual(ui.closes, [])
  assert.equal(ui.rows.get(SLOT).spec.order, 1000)
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

test('the client starts and stops just the effect for the changed Host row', () => {
  const watches = new Map(), active = new Set(), stopped = []
  const ctx = {
    inject(_names, callback) { callback(ctx) },
    effect(callback, label) {
      if (label.endsWith(' active')) {
        active.add(label)
        return () => { active.delete(label); stopped.push(label) }
      }
      return callback()
    },
    configForms: { whileServed([ns], start) { watches.set(ns, start); return () => watches.delete(ns) } },
  }
  runInNewContext(source, { window: { __ModuleLoader__: { load: module => module.factory(() => ({})).apply(ctx) } } })
  const namespaces = ['ui-enhancements-workspace-header', 'ui-enhancements-workspace-status', 'ui-enhancements']
  assert.deepEqual([...watches.keys()], namespaces)
  const unload = namespaces.map(ns => watches.get(ns)())
  const labels = namespaces.map(ns => `ui-enhancements: ${ns} active`)
  assert.deepEqual([...active], labels)
  unload[1]()
  assert.deepEqual([...active], [labels[0], labels[2]])
  assert.deepEqual(stopped, [labels[1]])
  const stopAgain = watches.get(namespaces[1])()
  assert.equal(active.size, 3)
  unload[0](); unload[2](); stopAgain()
  assert.equal(active.size, 0)
})

test('the single bundle declares three separate native rows and preserves the diff settings namespace', async () => {
  const load = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'))
  const pkg = await load('package.json')
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.equal(pkg.name, '@local/dsh-ui-enhancements')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './client.js')
  assert.match(patch, /name: '@local\/dsh-ui-enhancements'\s+group: true\s+config:/)
  assert.deepEqual([...patch.matchAll(/^ {8}- id: ([\w-]+)\s+name: '([^']+)'/gm)].map(([, id, name]) => [id, name]), [
    ['ui-enhancements-workspace-header', '@local/dsh-ui-enhancements/workspace-header'],
    ['ui-enhancements-workspace-status', '@local/dsh-ui-enhancements/workspace-status'],
    ['ui-enhancements', '@local/dsh-ui-enhancements/turn-diff'],
  ])
  for (const [dir, zh] of [['workspace-header', '会话工作区标记'], ['workspace-status', '折叠工作区状态'], ['turn-diff', '显示本轮代码差异']]) {
    const base = `components/${dir}`
    assert.equal(pkg.exports[`./${dir}`], `./${base}/index.js`)
    assert.equal(pkg.exports[`./${dir}/locale/*.json`], `./${base}/locale/*.json`)
    assert.equal(pkg.exports[`./${dir}/icon`], `./${base}/icon.svg`)
    assert.equal((await load(`${base}/locale/zh.json`)).meta.title, zh)
    assert.ok((await load(`${base}/locale/en.json`)).meta.title)
  }
  assert.equal((await load('locale/zh.json')).meta.title, '界面小增强')
})
