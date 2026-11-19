'use strict';
// Project store: one isolated directory per project, plus a shared task registry.
// Layout under HERMES_HOME (default: <repo>/data, git-ignored):
//   registry/tasks.json             shared task registry (all agents)
//   projects/<slug>/project.json    manifest
//   projects/<slug>/browser-profile Chromium user-data-dir (cookies, storage)
//   projects/<slug>/assets/         project assets
//   projects/<slug>/credentials/    credential *references* (no secrets in git)
//   projects/<slug>/wallets/        wallet records (public addresses + owner)
//   projects/<slug>/logs/execution.jsonl  append-only execution log

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SUBDIRS = ['browser-profile', 'assets', 'credentials', 'wallets', 'logs'];

function home() {
  return path.resolve(process.env.HERMES_HOME || path.join(__dirname, '..', '..', 'data'));
}
function projectsDir() { return path.join(home(), 'projects'); }
function projectDir(slug) { assertSlug(slug); return path.join(projectsDir(), slug); }
function registryPath() { return path.join(home(), 'registry', 'tasks.json'); }

function assertSlug(slug) {
  if (!SLUG_RE.test(slug || '')) {
    throw new Error(`invalid project slug "${slug}": use lowercase letters, digits, hyphens (max 63)`);
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}

// ---------- execution log ----------
function log(slug, event, details = {}) {
  const file = path.join(projectDir(slug), 'logs', 'execution.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = { ts: new Date().toISOString(), project: slug, event, ...details };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  return entry;
}
function readLog(slug) {
  const file = path.join(projectDir(slug), 'logs', 'execution.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---------- projects ----------
function createProject(slug, { name, description = '' } = {}) {
  const dir = projectDir(slug);
  const manifestPath = path.join(dir, 'project.json');
  if (fs.existsSync(manifestPath)) throw new Error(`project "${slug}" already exists`);
  for (const sub of SUBDIRS) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  // Credentials dir is owner-only.
  fs.chmodSync(path.join(dir, 'credentials'), 0o700);
  const manifest = {
    slug,
    name: name || slug,
    description,
    createdAt: new Date().toISOString(),
    paths: Object.fromEntries(SUBDIRS.map((s) => [s, path.join(dir, s)])),
    browser: { profileId: crypto.randomUUID(), launches: 0, lastLaunchAt: null },
  };
  writeJsonAtomic(manifestPath, manifest);
  log(slug, 'project.created', { name: manifest.name });
  return manifest;
}

function getProject(slug) {
  const manifestPath = path.join(projectDir(slug), 'project.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`project "${slug}" not found`);
  return readJson(manifestPath);
}
function saveProject(manifest) {
  writeJsonAtomic(path.join(projectDir(manifest.slug), 'project.json'), manifest);
}
function listProjects() {
  if (!fs.existsSync(projectsDir())) return [];
  return fs.readdirSync(projectsDir())
    .filter((d) => fs.existsSync(path.join(projectsDir(), d, 'project.json')))
    .map(getProject);
}

// Verify a project's directory structure is intact; returns list of problems.
function checkProject(slug) {
  const problems = [];
  const dir = projectDir(slug);
  if (!fs.existsSync(path.join(dir, 'project.json'))) problems.push('missing project.json');
  for (const sub of SUBDIRS) if (!fs.existsSync(path.join(dir, sub))) problems.push(`missing ${sub}/`);
  const cred = path.join(dir, 'credentials');
  if (fs.existsSync(cred) && (fs.statSync(cred).mode & 0o077)) problems.push('credentials/ is not owner-only (0700)');
  return problems;
}

// ---------- task registry ----------
const TASK_STATES = ['pending', 'running', 'succeeded', 'failed', 'blocked'];

function createTask({ project, type, agent, input = {} }) {
  if (project) getProject(project);
  const reg = readJson(registryPath(), { tasks: [] });
  const task = {
    id: `t_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    project: project || null, type, agent, input,
    status: 'pending', createdAt: new Date().toISOString(), updatedAt: null,
    evidence: null, error: null,
  };
  reg.tasks.push(task);
  writeJsonAtomic(registryPath(), reg);
  return task;
}
function updateTask(id, patch) {
  if (patch.status && !TASK_STATES.includes(patch.status)) throw new Error(`bad status ${patch.status}`);
  const reg = readJson(registryPath(), { tasks: [] });
  const task = reg.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`task ${id} not found`);
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  writeJsonAtomic(registryPath(), reg);
  if (task.project) log(task.project, `task.${task.status}`, { taskId: id, type: task.type });
  return task;
}
function listTasks(filter = {}) {
  const reg = readJson(registryPath(), { tasks: [] });
  return reg.tasks.filter((t) => Object.entries(filter).every(([k, v]) => v == null || t[k] === v));
}

module.exports = {
  home, projectDir, registryPath, assertSlug,
  createProject, getProject, saveProject, listProjects, checkProject,
  log, readLog, createTask, updateTask, listTasks, TASK_STATES,
};
