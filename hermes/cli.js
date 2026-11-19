#!/usr/bin/env node
'use strict';
// Hermes browser-profile & project manager CLI.
// Every command that does work is recorded as a task in the shared registry,
// with its evidence, so other agents can see what ran and whether it succeeded.

const store = require('./lib/store');
const browser = require('./lib/browser');

function parse(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}
const out = (o) => console.log(JSON.stringify(o, null, 2));

// Wrap a unit of work in a registry task: pending -> running -> succeeded/failed.
async function tracked(project, type, input, fn) {
  const task = store.createTask({ project, type, agent: 'browser-profile-manager', input });
  store.updateTask(task.id, { status: 'running' });
  try {
    const evidence = await fn();
    const ok = evidence && evidence.blockedBy ? 'blocked'
      : evidence && evidence.ok === false ? 'failed' : 'succeeded';
    return store.updateTask(task.id, { status: ok, evidence });
  } catch (e) {
    store.updateTask(task.id, { status: 'failed', error: e.message });
    throw e;
  }
}

const HELP = `hermes — project & browser profile manager

  project create <slug> [--name N] [--description D]
  project list
  project show <slug>            manifest + structure check + recent log
  browser visit <slug> <url> [--no-screenshot] [--headed]
  browser verify <slugA> <slugB> prove profile persistence + isolation
  tasks [--project slug] [--status s]
  log <slug>

  Data root: $HERMES_HOME (default ./data)`;

async function main() {
  const { pos, flags } = parse(process.argv.slice(2));
  const [group, cmd, ...rest] = pos;
  if (group === 'project' && cmd === 'create') {
    const slug = rest[0];
    out(store.createProject(slug, { name: flags.name, description: flags.description }));
  } else if (group === 'project' && cmd === 'list') {
    out(store.listProjects().map((p) => ({ slug: p.slug, name: p.name, createdAt: p.createdAt, launches: p.browser.launches })));
  } else if (group === 'project' && cmd === 'show') {
    const slug = rest[0];
    out({ manifest: store.getProject(slug), problems: store.checkProject(slug), recentLog: store.readLog(slug).slice(-10) });
  } else if (group === 'browser' && cmd === 'visit') {
    const [slug, url] = rest;
    if (!url) throw new Error('usage: browser visit <slug> <url>');
    out(await tracked(slug, 'browser.visit', { url }, () =>
      browser.visit(slug, url, { screenshot: !flags['no-screenshot'], headless: !flags.headed })));
  } else if (group === 'browser' && cmd === 'verify') {
    const [a, b] = rest;
    if (!b) throw new Error('usage: browser verify <slugA> <slugB>');
    const t = await tracked(a, 'browser.verify', { against: b }, () => browser.verifyIsolation(a, b));
    out(t); if (t.status !== 'succeeded') process.exitCode = 1;
  } else if (group === 'tasks') {
    out(store.listTasks({ project: flags.project, status: flags.status }));
  } else if (group === 'log') {
    out(store.readLog(cmd));
  } else {
    console.log(HELP);
    if (group) process.exitCode = 2;
  }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exitCode = 1; });
