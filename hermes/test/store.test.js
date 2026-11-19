'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.HERMES_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'));
const store = require('../lib/store');
const browser = require('../lib/browser');

test('create project builds isolated structure', () => {
  const p = store.createProject('alpha', { name: 'Alpha' });
  assert.deepStrictEqual(store.checkProject('alpha'), []);
  assert.ok(p.paths['browser-profile'].includes(path.join('projects', 'alpha')));
  assert.throws(() => store.createProject('alpha'), /already exists/);
  assert.throws(() => store.createProject('Bad Slug'), /invalid project slug/);
  assert.throws(() => store.createProject('../escape'), /invalid project slug/);
});

test('task registry lifecycle is logged to project', () => {
  const t = store.createTask({ project: 'alpha', type: 'demo', agent: 'test' });
  store.updateTask(t.id, { status: 'succeeded', evidence: { x: 1 } });
  assert.strictEqual(store.listTasks({ status: 'succeeded' }).length, 1);
  assert.ok(store.readLog('alpha').some((e) => e.event === 'task.succeeded'));
  assert.throws(() => store.updateTask(t.id, { status: 'done' }), /bad status/);
});

test('browser profiles persist and are isolated', { timeout: 120000 }, async () => {
  store.createProject('beta');
  const r = await browser.verifyIsolation('alpha', 'beta');
  assert.strictEqual(r.persisted, true, 'marker should persist in alpha');
  assert.strictEqual(r.isolated, true, 'marker must not leak to beta');
});
