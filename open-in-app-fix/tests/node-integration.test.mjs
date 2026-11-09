import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const moduleURL = new URL('../spawn-guard.js', import.meta.url).href

function run(source, args = []) {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source, ...args], { encoding: 'utf8', timeout: 15000 })
  assert.ifError(child.error)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  return JSON.parse(child.stdout.trim())
}

test('synchronizes an ESM spawn import that existed BEFORE plugin activation', () => {
  const outcome = run(`
    import childProcess, { spawn } from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { installSpawnGuard } from ${JSON.stringify(moduleURL)};
    const native = childProcess.spawn;
    childProcess.spawn = (command, args, options) => options;
    syncBuiltinESMExports();
    const options = { detached: true, stdio: 'ignore', env: { ELECTRON_RUN_AS_NODE: '1', KEEP: 'ok' } };
    const workspace = ${JSON.stringify('C:\\workspace')};
    const before = spawn('Code.exe', [workspace], options);
    const release = installSpawnGuard({ platform: 'win32', directory: () => true });
    const during = spawn('Code.exe', [workspace], options);
    release();
    const after = spawn('Code.exe', [workspace], options);
    childProcess.spawn = native;
    syncBuiltinESMExports();
    console.log(JSON.stringify({ before: before.env.ELECTRON_RUN_AS_NODE, during: during.env.ELECTRON_RUN_AS_NODE ?? null, after: after.env.ELECTRON_RUN_AS_NODE, keep: during.env.KEEP, originalUnchanged: options.env.ELECTRON_RUN_AS_NODE }));
  `)
  assert.deepEqual(outcome, { before: '1', during: null, after: '1', keep: 'ok', originalUnchanged: '1' })
})

test('real native child receives cleaned environment without mutating parent or caller', { skip: process.platform !== 'win32' }, () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-open-in-app-fix-'))
  try {
    const outcome = run(`
      import childProcess, { spawn } from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import { once } from 'node:events';
      import { readFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { installSpawnGuard } from ${JSON.stringify(moduleURL)};
      const directory = process.argv[1];
      const marker = join(directory, 'child.json');
      const native = childProcess.spawn;
      const hostBefore = JSON.stringify(process.env);
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_TEST_SENTINEL: 'preserved' };
      const childCode = 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', JSON.stringify({flag: process.env.ELECTRON_RUN_AS_NODE ?? null, sentinel: process.env.DSH_TEST_SENTINEL, cwd: process.cwd()}))';
      let seen;
      // Adapter redirects the fake Code.exe to a harmless real Node child.
      childProcess.spawn = function (command, args, options) {
        seen = { command, args };
        return native(process.execPath, ['-e', childCode], options);
      };
      syncBuiltinESMExports();
      const release = installSpawnGuard();
      try {
        const child = spawn(${JSON.stringify('D:\\VS Code\\Code.exe')}, [directory], { detached: true, stdio: 'ignore', cwd: directory, env });
        const [exit] = await once(child, 'exit');
        if (exit !== 0) throw new Error('child failed: ' + exit);
        console.log(JSON.stringify({ child: JSON.parse(readFileSync(marker, 'utf8')), parentUnchanged: JSON.stringify(process.env) === hostBefore, callerFlag: env.ELECTRON_RUN_AS_NODE, command: seen.command, folder: seen.args[0] }));
      } finally {
        release();
        childProcess.spawn = native;
        syncBuiltinESMExports();
      }
    `, [temporary])
    assert.equal(outcome.child.flag, null)
    assert.equal(outcome.child.sentinel, 'preserved')
    assert.equal(outcome.child.cwd.toLowerCase(), temporary.toLowerCase())
    assert.equal(outcome.parentUnchanged, true)
    assert.equal(outcome.callerFlag, '1')
    assert.equal(outcome.command, 'D:\\VS Code\\Code.exe')
    assert.equal(outcome.folder, temporary)
  } finally {
    // temporary is the exact directory returned by mkdtempSync above.
    assert(temporary.startsWith(join(tmpdir(), 'dsh-open-in-app-fix-')))
    rmSync(temporary, { recursive: true, force: true })
  }
})
