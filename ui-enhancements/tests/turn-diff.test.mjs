import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const settings = 'settings.general.item'
const tail = 'conversation.chat.turnTail'
const field = 'showTurnCodeDiff'

function form(value, overrides = {}) {
  let snapshot = { status: 'ready', value, user: overrides.user, writable: true, revision: 3 }
  const listeners = new Set(), writes = []
  function publish(next) {
    snapshot = { ...snapshot, value: next, revision: snapshot.revision + 1 }
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish, listeners, writes,
    async mutate([{ path, value }], expected) {
      writes.push([path[0], value, expected])
      if (overrides.mutate) return overrides.mutate(publish)
      if (expected !== snapshot.revision) return false
      publish({ [path[0]]: value })
      return true
    },
    async set(key, value) {
      writes.push([key, value])
      if (overrides.refuse) return false
      publish({ [key]: value })
      return true
    },
  }
}

function fixture(enabled, saved, { mismatchedTail = false, mutation, refuse = false, previousUserValue } = {}) {
  const legacy = form(enabled === undefined ? undefined : { enabled })
  const diff = form(saved === undefined ? {} : { [field]: saved }, {
    mutate: mutation, refuse, user: previousUserValue === undefined ? undefined : { [field]: previousUserValue },
  })
  const nativeCard = () => {}
  const nativeRow = () => {}
  const native = {
    options: { id: 'developer-tools', order: 15 }, locale: 'settings', component: nativeRow,
    inject: () => ({ hooks: { developerTools: legacy }, setEnabled: enabled => legacy.set('enabled', enabled) }),
  }
  const nativeTail = {
    options: { id: '@deepseek-ai/dsh-client-ui-deliverables' }, component: nativeCard,
    children: mismatchedTail ? {} : { 'deliverables.file.actions': { kind: 'list', scope: 'session' } },
  }
  const cleanups = [], warnings = [], rows = new Map([[settings, [native]], [tail, [nativeTail]]]), dictionaries = new Map()
  const ctx = {
    inject(names, fn) { if (names.every(name => ctx[name])) fn(ctx) },
    effect(fn) { const off = fn(); if (off) cleanups.push(off) },
    configForms: {
      get: ns => ns === 'ui-settings' ? legacy : diff,
      whileServed([ns], start) { if (ns === 'ui-enhancements') start(); return () => {} },
    },
    logger: { warn: (...args) => warnings.push(args) },
    locale: { register(ns, dict) { dictionaries.set(ns, dict.zh); return () => dictionaries.delete(ns) } },
    slots: {
      inject(name, fn) { const off = fn(); if (name === tail) cleanups.push(off); return off },
      entries: key => rows.get(key) ?? [],
      subscribe() { return () => {} },
      register({ name, inject, ...options }, component) {
        const entry = { options, component, inject, locale: options.locale }
        const registered = rows.get(name) ?? []
        rows.set(name, registered)
        registered.push(entry)
        const off = () => { if (registered.includes(entry)) registered.splice(registered.indexOf(entry), 1) }
        if (name !== settings) cleanups.push(off)
        return off
      },
    },
  }
  runInNewContext(source, { window: { __ModuleLoader__: { load: module => module.factory(() => ({
    createElement: (type, props) => ({ type, props }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  })).apply(ctx) } } })
  const entries = id => rows.get(settings).filter(entry => entry.options.id === id)
  const winner = id => entries(id).sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]
  const diffRow = () => winner('ui-enhancements.turn-diff')
  const advancedRow = () => winner('developer-tools')
  return {
    legacy, diff, nativeCard, nativeRow, nativeTail, warnings, entries, advancedRow, diffRow,
    tailEntries: () => rows.get(tail),
    read: () => diffRow().inject().hooks.developerTools.getSnapshot(),
    card: props => nativeTail.component(props),
    title(entry) {
      return entry.component({ t: key => dictionaries.get(entry.locale)[key] }).props.t('developerTools.title')
    },
    dispose() { for (const off of cleanups.reverse()) off() },
  }
}

for (const enabled of [false, true]) {
  test(`upgrade preserves the old ${enabled ? 'on' : 'off'} value and isolates the two switches`, async () => {
    const ui = fixture(enabled)
    assert.equal(ui.read(), enabled)
    assert.deepEqual(ui.diff.writes, [[field, enabled, 3]])
    const advanced = ui.advancedRow(), independent = ui.diffRow()
    assert.equal(ui.title(advanced), '显示高级代码工作视图')
    assert.equal(ui.title(independent), '显示本轮代码差异')
    assert.equal(independent.options.order, advanced.options.order + 1)
    await advanced.inject().setEnabled(!enabled)
    assert.equal(ui.read(), enabled)
    assert.equal(ui.legacy.getSnapshot().value.enabled, !enabled)
    await independent.inject().setEnabled(!enabled)
    assert.equal(ui.read(), !enabled)
    await advanced.inject().setEnabled(enabled)
    assert.equal(ui.read(), !enabled)
    ui.dispose()
  })
}

test('stored false is not migrated and only the card hook is adapted, preserving native capabilities', () => {
  const ui = fixture(true, false)
  const original = { renderSlot() {}, openChangesReview() {}, openPresented() {}, useShowCodeDiff: () => true }
  const rendered = ui.card(original)
  assert.equal(rendered.type, ui.nativeCard)
  for (const key of ['renderSlot', 'openChangesReview', 'openPresented']) assert.equal(rendered.props[key], original[key])
  assert.equal(rendered.props.useShowCodeDiff(Boolean), false)
  assert.deepEqual(ui.diff.writes, [])
  ui.dispose()
  assert.equal(ui.nativeTail.component, ui.nativeCard)
  assert.equal(rendered.props.useShowCodeDiff(Boolean), true)
  assert.equal(ui.entries('developer-tools').length, 1)
  assert.equal(ui.diffRow(), undefined)
  assert.equal(ui.diff.listeners.size, 0)
  assert.equal(ui.legacy.listeners.size, 0)
})

for (const previousUserValue of [false, true]) {
  test(`1.3.0 name-qualified preference ${previousUserValue} takes precedence over the opposite native value`, async () => {
    const ui = fixture(!previousUserValue, undefined, { previousUserValue })
    assert.equal(ui.read(), previousUserValue)
    assert.deepEqual(ui.diff.writes, [[field, previousUserValue, 3]])
    await ui.advancedRow().inject().setEnabled(previousUserValue)
    assert.equal(ui.diff.getSnapshot().value[field], previousUserValue)
    ui.dispose()
  })
}

test('hot disabling removes only the diff fallback registration and restores the native cell', () => {
  const ui = fixture(false, true)
  assert.equal(ui.tailEntries().length, 2)
  const [native, refresher] = ui.tailEntries()
  assert.equal(refresher.options.id, native.options.id)
  assert.ok(refresher.options.priority > (native.options.priority ?? 0))
  assert.equal(refresher.component(), null)
  ui.dispose()
  assert.deepEqual(ui.tailEntries(), [ui.nativeTail])
  assert.equal(ui.diff.getSnapshot().value[field], true)
})

test('waiting for Host settings does not save a provisional false value', async () => {
  const ui = fixture(undefined)
  assert.deepEqual(ui.diff.writes, [])
  ui.legacy.publish({ enabled: true })
  await ui.advancedRow().inject().setEnabled(false)
  assert.equal(ui.read(), true)
  assert.deepEqual(ui.diff.writes, [[field, true, 3]])
  ui.dispose()
})

test('a concurrent saved choice wins the initialization revision conflict', async () => {
  const ui = fixture(true, undefined, { mutation(publish) { publish({ [field]: false }); return false } })
  await ui.advancedRow().inject().setEnabled(false)
  assert.equal(ui.read(), false)
  assert.deepEqual(ui.diff.writes, [[field, true, 3]])
  assert.deepEqual(ui.warnings, [])
  ui.dispose()
})

test('a refused write keeps the accepted value and surfaces the native row error', async () => {
  const ui = fixture(false, true, { refuse: true })
  await assert.rejects(ui.diffRow().inject().setEnabled(false), /was not saved/)
  assert.equal(ui.read(), true)
  ui.dispose()
})

test('an incompatible native card leaves the original settings and state untouched', () => {
  const ui = fixture(true, undefined, { mismatchedTail: true })
  assert.equal(ui.diffRow(), undefined)
  assert.equal(ui.advancedRow().component, ui.nativeRow)
  assert.equal(ui.nativeTail.component, ui.nativeCard)
  assert.deepEqual(ui.diff.writes, [])
  ui.dispose()
})
