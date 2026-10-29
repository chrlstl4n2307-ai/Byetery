import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { stateLanesFixture } from '../../backend/tests/d2-state-lanes-fixture.ts';

test('D2.3 actual Next/Chromium state lanes with isolated HTTP/SQL fixtures and archived control', { timeout: 240000 }, async t => {
  const f = await stateLanesFixture(), contexts = [], results = [], blocked = [];
  const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
  const logs = new URL('../../.tools/d2-007/', import.meta.url);
  const evidence = new URL('../../docs/instaward/d2/evidence/d2-007/', import.meta.url);
  const historical = JSON.parse(await readFile(new URL('historical-control.json', evidence), 'utf8'));
  const history = JSON.parse(await readFile(new URL('../../docs/instaward/d2/D2-003-TIMELINE.json', import.meta.url), 'utf8'));
  await mkdir(logs, { recursive: true }); await mkdir(evidence, { recursive: true });
  const generated = ['next-env.d.ts', 'AGENTS.md', 'CLAUDE.md'], original = new Map();
  for (const name of generated) try { original.set(name, await readFile(path.join(frontend, name))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; original.set(name, null); }
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', BYETERY_WEB_ENV: 'LOCAL', BYETERY_SOURCE: 'MOCK',
    BYETERY_WEB_ORIGIN: origin, BYETERY_API_URL: f.origin, SUPABASE_URL: 'https://aemxuqnnwfclzrwwiqfd.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_D2_007_FIXTURE_ONLY' };
  for (const key of ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_GIT_COMMIT_REF']) delete env[key];
  const child = spawn(process.execPath, [path.join(frontend, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: frontend, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', browser;
  child.stdout.on('data', b => { output = (output + b).slice(-128000); });
  child.stderr.on('data', b => { output = (output + b).slice(-128000); });
  try {
    const deadline = Date.now() + 90000; let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error('Next fixture server stopped; inspect ignored log');
      try { const response = await fetch(origin, { signal: AbortSignal.timeout(10000) });
        output += `\nReadiness HTTP ${response.status}`;
        if (response.ok) { ready = true; break; }
      } catch (error) { output += `\nReadiness ${error.name}`; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.ok(ready, 'Local Next server ready');
    let executablePath = chromium.executablePath();
    if (!existsSync(executablePath) && process.platform === 'win32') {
      const cache = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
      executablePath = readdirSync(cache).filter(n => /^chromium_headless_shell-\d+$/.test(n))
        .sort((a,b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)))
        .map(n => path.join(cache, n, 'chrome-headless-shell-win64/chrome-headless-shell.exe')).find(p => existsSync(p));
    }
    assert.ok(executablePath && existsSync(executablePath), 'Existing Chromium only; no download');
    browser = await chromium.launch({ headless: true, executablePath });
    const before = await f.snapshot();
    const specs = [
      ['A', '01-pending.png'], ['B', '02-uncertain.png'], ['C', '03-confirmed-reward-pending.png'],
      ['E', '04-failed-reward-pending.png'], ['F', '05-confirmed-reward-sent.png'], ['N', '06-no-operation.png'],
      ['HISTORICAL', '07-historical-testnet-confirmed.png'],
    ];
    for (const [name, filename] of specs) await t.test(name + ' actual state rendering', async () => {
      const item = f.cases.find(c => c.spec.case === name), archived = name === 'HISTORICAL';
      const batteryId = archived ? historical.battery.batteryId : item?.batteryId ?? f.emptyBattery;
      const expected = archived ? { lifecycle: 'RECYCLED', lane: 'CONFIRMED', reward: 'SENT' }
        : item?.spec ?? { lifecycle: 'REGISTERED', lane: 'NO_PENDING_OPERATION', reward: 'NOT_ELIGIBLE' };
      const classification = archived ? historical.classification : 'LOCAL FIXTURE STATE — HTTP / SQL / MOCK; NOT a live Testnet transaction';
      const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' }); contexts.push(context);
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin) { blocked.push(url.origin); await route.abort(); return; }
        if (url.pathname === '/auth/session') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'LOCAL-FIXTURE-USER', user_metadata: { full_name: 'LOCAL FIXTURE' } } }) }); return;
        }
        if (url.pathname.startsWith('/api/')) {
          assert.equal(req.method(), 'GET', 'Browser acceptance performs reads only');
          let reply;
          if (archived && url.pathname === '/api/batteries/' + batteryId) reply = { status: 200, body: historical.battery };
          else if (archived && url.pathname.endsWith('/history')) reply = { status: 200, body: history.history };
          else reply = await f.call('USER', url.pathname + url.search);
          if (url.pathname === '/api/me') reply = { status: 200, body: { ...reply.body, userId: 'LOCAL-FIXTURE-USER', wallets: [], requests: [], source: archived ? 'TESTNET' : 'MOCK' } };
          await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) }); return;
        }
        await route.continue();
      });
      const page = await context.newPage(); await page.goto(origin + '/battery/' + batteryId);
      await page.getByRole('heading', { name: batteryId, exact: true }).waitFor();
      const lifecycle = page.getByRole('region', { name: 'Estado de ciclo y atestación' });
      const tx = page.getByRole('region', { name: 'Estado de transacción Stellar' });
      const reward = page.getByRole('region', { name: 'Estado de recompensa' });
      const txLabels = { PENDING: 'Pendiente', UNCERTAIN: 'Resultado incierto', CONFIRMED: 'Confirmada', FAILED: 'Fallida', NO_PENDING_OPERATION: 'Sin operación pendiente' };
      const actualLifecycle = await lifecycle.locator('li[aria-current="step"] small').textContent();
      const actualLabel = await tx.locator('strong').textContent();
      const actualReward = await reward.locator('code').textContent();
      assert.equal(actualLifecycle, expected.lifecycle); assert.equal(actualLabel, txLabels[expected.lane]); assert.equal(actualReward, expected.reward);
      if (expected.lane !== 'CONFIRMED') assert.equal(await tx.getByText('Confirmada', { exact: true }).count(), 0);
      if (expected.reward !== 'SENT') {
        assert.equal(await reward.getByText('Recompensa enviada ✓', { exact: true }).count(), 0);
        assert.equal(await reward.locator('.reward-amount').count(), 0); assert.equal(await page.getByText('Ciclo completado', { exact: true }).count(), 0);
      }
      if (name === 'E') assert.ok((await tx.textContent()).includes('no acredita un fallo confirmado en Stellar'));
      // Explicit harness annotation outside StateSummary; never edits lane contents or results.
      await page.evaluate(label => { const note = document.createElement('p'); note.className = 'notice'; note.textContent = label;
        note.dataset.evidenceAnnotation = 'D2-007'; document.querySelector('main').prepend(note); }, classification);
      await page.screenshot({ path: fileURLToPath(new URL(filename, evidence)), fullPage: true });
      results.push({ case: name, classification, expected, actual: { lifecycle: actualLifecycle,
        transaction: Object.keys(txLabels).find(k => txLabels[k] === actualLabel), reward: actualReward }, falseSuccess: false, screenshot: filename });
    });
    assert.deepEqual(await f.snapshot(), before); assert.equal(f.externalCalls(), 0); assert.deepEqual(blocked, []);
    await writeFile(new URL('browser-results.json', logs), JSON.stringify({ task: 'D2.3', browser: browser.version(), cases: results,
      fixtureAuthBridge: true, newTransactions: 0, operationalSignatures: 0, broadcasts: 0, externalConnections: blocked }, null, 2) + '\n');
  } finally {
    await Promise.all(contexts.map(c => c.close())); if (browser) await browser.close();
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
      else child.kill('SIGTERM');
    }
    for (const name of generated) {
      const target = path.join(frontend, name), bytes = original.get(name);
      if (name === 'next-env.d.ts' && bytes) { await writeFile(target, bytes); continue; }
      if (bytes !== null) continue;
      let current; try { current = await readFile(target); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      if ((name === 'AGENTS.md' && current.toString().includes('<!-- BEGIN:nextjs-agent-rules -->')) || (name === 'CLAUDE.md' && current.toString().trim() === '@AGENTS.md')) {
        const archive = new URL('generated-next/', logs); await mkdir(archive, { recursive: true }); await writeFile(new URL(name, archive), current); await unlink(target);
      }
    }
    await writeFile(new URL('next-browser.log', logs), output); await f.close();
  }
});
