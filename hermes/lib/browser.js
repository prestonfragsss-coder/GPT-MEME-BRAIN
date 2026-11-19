'use strict';
// Browser profile manager: each project gets its own persistent Chromium
// user-data-dir, so cookies, localStorage and logins never leak across projects.

const path = require('path');
const fs = require('fs');
const store = require('./store');

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) {
    const err = new Error('playwright not resolvable from this environment (technical: missing dependency). ' +
      'Install with `npm i playwright` or use the preinstalled global module.');
    err.cause = e; throw err;
  }
}

// Launch the project's persistent browser context. Returns { context, page, close }.
async function openProfile(slug, { headless = true } = {}) {
  const project = store.getProject(slug);
  const { chromium } = loadPlaywright();
  const context = await chromium.launchPersistentContext(project.paths['browser-profile'], {
    headless,
    viewport: { width: 1280, height: 800 },
  });
  project.browser.launches += 1;
  project.browser.lastLaunchAt = new Date().toISOString();
  store.saveProject(project);
  store.log(slug, 'browser.launched', { headless, profile: project.paths['browser-profile'] });
  const page = context.pages()[0] || (await context.newPage());
  return {
    project, context, page,
    async close() { await context.close(); store.log(slug, 'browser.closed'); },
  };
}

// Visit a URL inside the project's profile, record status/title, optional screenshot.
async function visit(slug, url, { screenshot = true, headless = true, timeoutMs = 30000 } = {}) {
  const s = await openProfile(slug, { headless });
  try {
    const resp = await s.page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const result = {
      url, finalUrl: s.page.url(), status: resp ? resp.status() : null,
      title: await s.page.title(), screenshot: null,
    };
    // Distinguish site-side bot challenges from proxy/network blocks.
    const headers = resp ? resp.headers() : {};
    if (headers['cf-mitigated'] === 'challenge') result.blockedBy = 'site: Cloudflare bot challenge (human verification required)';
    if (screenshot) {
      const file = path.join(s.project.paths.assets, `screenshot-${Date.now()}.png`);
      await s.page.screenshot({ path: file });
      result.screenshot = file;
    }
    store.log(slug, 'browser.visit', result);
    return result;
  } catch (e) {
    store.log(slug, 'browser.visit.failed', { url, error: e.message });
    throw e;
  } finally {
    await s.close();
  }
}

// Prove isolation + persistence:
//  1. write a marker cookie+localStorage in project A on a local origin
//  2. relaunch A -> marker must still be there (persistence)
//  3. launch B on same origin -> marker must be absent (isolation)
async function verifyIsolation(slugA, slugB) {
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>hermes-isolation-probe</title>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const marker = `hermes-${slugA}-${Date.now()}`;
  const read = async (page) => page.evaluate(() => ({
    cookie: document.cookie, ls: localStorage.getItem('hermes_marker'),
  }));
  try {
    let s = await openProfile(slugA);
    await s.page.goto(origin);
    await s.page.evaluate((m) => {
      document.cookie = `hermes_marker=${m}; max-age=86400; path=/`;
      localStorage.setItem('hermes_marker', m);
    }, marker);
    await s.close();

    s = await openProfile(slugA);
    await s.page.goto(origin);
    const aAfter = await read(s.page);
    await s.close();

    s = await openProfile(slugB);
    await s.page.goto(origin);
    const b = await read(s.page);
    await s.close();

    const result = {
      origin, marker,
      persisted: aAfter.ls === marker && aAfter.cookie.includes(marker),
      isolated: b.ls !== marker && !b.cookie.includes(marker),
      observed: { [slugA]: aAfter, [slugB]: b },
    };
    result.ok = result.persisted && result.isolated;
    store.log(slugA, 'browser.verify', result);
    store.log(slugB, 'browser.verify', result);
    return result;
  } finally {
    server.close();
  }
}

module.exports = { openProfile, visit, verifyIsolation };
