import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, stat } from 'node:fs/promises';
import { apply } from '../index.js';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const PICKER = 'conversation.hero.agentPreset';
const SECTION = 'settings.section';
function nativeEntry(id) {
  const enabled = { getSnapshot: () => true, subscribe: () => () => {} };
  const face = { hooks: { developerTools: enabled, roster: {} }, select() {}, load() {} };
  return {
    options: { ...(id ? { id } : {}), priority: 0, order: 20 },
    registrant: 'native', component() {}, locale: 'settings.agentPreset',
    inject: sessionId => ({ ...face, sessionId }),
  };
}
function setup({ enabled = false, ready = true, writable = true, accepted = true, ensure = Promise.resolve() } = {}) {
  let definition;
  const cleanups = [], writes = [], errors = [];
  const natives = new Map([[PICKER, [nativeEntry()]], [SECTION, [nativeEntry('agent-presets')]]]);
  const shadows = new Map(), listeners = new Map();
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: entry => { definition = entry; } } } });
  const plugin = definition.factory();
  const form = {
    getSnapshot: () => ({ status: ready ? 'ready' : 'unavailable', value: { enabled }, writable, revision: 7 }),
    mutate: async (...args) => { writes.push(JSON.parse(JSON.stringify(args))); return accepted; },
  };
  const ctx = {
    effect: callback => { cleanups.push(callback()); },
    logger: { error: error => errors.push(error.message) },
    slots: {
      inject: (name, callback) => { const off = callback(); cleanups.push(off); return off; },
      entries: name => [...(shadows.get(name) ?? []), ...(natives.get(name) ?? [])],
      subscribe: (name, callback) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
        return () => listeners.get(name).delete(callback);
      },
      register: (options, component) => {
        const entry = { ...options, options, component };
        if (!shadows.has(options.name)) shadows.set(options.name, []);
        shadows.get(options.name).push(entry);
        return () => { shadows.set(options.name, shadows.get(options.name).filter(row => row !== entry)); };
      },
    },
    configForms: {
      get: ns => { assert.equal(ns, 'ui-settings'); return form; },
      describe: () => ({ ensure: () => ensure }),
    },
  };
  plugin.apply(ctx);
  return {
    definition, plugin, writes, errors, natives, shadows,
    notify: name => { for (const callback of listeners.get(name) ?? []) callback(); },
    dispose: () => { for (const off of cleanups.reverse()) off(); },
  };
}
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('Host does not mutate settings inside installation transactions', () => apply({}));
test('native picker and settings components retain actions, locale, identity and only filter advanced choices', async () => {
  const state = setup({ enabled: true });
  await settle();
  for (const name of [PICKER, SECTION]) {
    const native = state.natives.get(name)[0];
    const shadow = state.shadows.get(name)[0];
    assert.equal(shadow.component, native.component);
    assert.equal(shadow.locale, native.locale);
    assert.equal(shadow.options.id, native.options.id);
    assert.equal(shadow.options.priority, -1);
    const before = native.inject('session');
    const after = shadow.inject('session');
    assert.equal(after.select, before.select);
    assert.equal(after.load, before.load);
    assert.equal(after.sessionId, 'session');
    assert.equal(after.hooks.roster, before.hooks.roster);
    assert.equal(after.hooks.developerTools.getSnapshot(), false);
    assert.equal(before.hooks.developerTools.getSnapshot(), true, 'original registration must not mutate');
    assert.equal(shadow.children, undefined);
  }
  assert.deepEqual(state.writes, []);
});
test('replacement follows original registration lifetime without loops and restores on disposal', async () => {
  const state = setup({ enabled: true });
  await settle();
  const previous = state.shadows.get(PICKER)[0];
  state.notify(PICKER);
  assert.equal(state.shadows.get(PICKER)[0], previous);
  const replacement = nativeEntry();
  state.natives.set(PICKER, [replacement]);
  state.notify(PICKER);
  assert.equal(state.shadows.get(PICKER).length, 1);
  assert.equal(state.shadows.get(PICKER)[0].component, replacement.component);
  state.natives.set(PICKER, []);
  state.notify(PICKER);
  assert.equal(state.shadows.get(PICKER).length, 0);
  state.dispose();
  assert.equal(state.shadows.get(SECTION).length, 0);
});
test('Client enables only the exact UI preference with revision protection', async () => {
  const state = setup();
  await settle();
  assert.equal(state.definition.id, '@local/dsh-turn-diff-only');
  assert.deepEqual(Array.from(state.plugin.inject), ['configForms', 'slots']);
  assert.deepEqual(state.writes, [[[ { op: 'set', path: ['enabled'], value: true } ], 7]]);
  assert.deepEqual(state.errors, []);
});
test('already enabled preference is not rewritten', async () => {
  const state = setup({ enabled: true });
  await settle();
  assert.deepEqual(state.writes, []);
});
test('disposal before settings finish loading prevents writes', async () => {
  let resolve;
  const state = setup({ ensure: new Promise(done => { resolve = done; }) });
  state.dispose(); resolve(); await settle();
  assert.deepEqual(state.writes, []);
});
test('missing settings and readonly settings fail without writes', async () => {
  for (const options of [{ ready: false }, { writable: false }]) {
    const state = setup(options); await settle();
    assert.deepEqual(state.writes, []);
    assert.equal(state.errors.length, 1);
  }
});
test('refused writes are logged, not retried or forced', async () => {
  const state = setup({ accepted: false }); await settle();
  assert.equal(state.writes.length, 1);
  assert.match(state.errors[0], /refused/);
});
test('load errors are logged without unhandled rejections', async () => {
  const state = setup({ ensure: Promise.reject(new Error('offline')) }); await settle();
  assert.deepEqual(state.errors, ['offline']);
  assert.deepEqual(state.writes, []);
});
test('patch ONLY disables Trajectory, never Agent preset UI or definitions', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  const ids = [...patch.matchAll(/^\s*- id: (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(ids, ['ui-trajectory', 'turn-diff-only']);
  assert.equal((patch.match(/disabled: true/g) ?? []).length, 1);
  assert.doesNotMatch(patch, /name:.*ui-agent-preset|agent-preset-registry|id: preset-/);
});
test('manifest and translated metadata preserve the documented standard/creator scope', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, '@local/dsh-turn-diff-only');
  assert.equal(manifest.version, '1.1.0');
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-agent-preset'));
  assert.equal(manifest.dependencies, undefined);
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(await readFile(new URL(`../locale/${lang}.json`, import.meta.url), 'utf8'));
    assert.ok(locale.meta.title);
    assert.match(locale.meta.description, lang === 'en' ? /Standard, Creator/ : /标准模式、创造模式/);
  }
  for (const resource of Object.values(manifest.exports)) {
    if (!resource.includes('*')) assert.ok((await stat(new URL(`../${resource}`, import.meta.url))).isFile());
  }
});
