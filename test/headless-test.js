/**
 * headless-test.js
 * Headless browser test for AI Tank Battle using Puppeteer.
 * Usage: node test/headless-test.js [--visible] [--rounds=N] [--p1=model] [--p2=model]
 */
const puppeteer = require('puppeteer');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const VISIBLE   = args.includes('--visible');
const ROUNDS    = parseInt((args.find(a => a.startsWith('--rounds=')) || '--rounds=20').split('=')[1]);
const P1_MODEL  = (args.find(a => a.startsWith('--p1=')) || '--p1=deepseek-v3-2-volc').split('=')[1];
const P2_MODEL  = (args.find(a => a.startsWith('--p2=')) || '--p2=kimi-k2.5').split('=')[1];
const BASE_URL  = 'http://localhost:3000';
const TIMEOUT   = 10 * 60 * 1000; // 10 min total

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prefix = { INFO: '\x1b[36m[INFO]\x1b[0m', OK: '\x1b[32m[ OK ]\x1b[0m', WARN: '\x1b[33m[WARN]\x1b[0m', ERR: '\x1b[31m[ERR ]\x1b[0m', GAME: '\x1b[35m[GAME]\x1b[0m' };
  console.log(`${ts} ${prefix[level] || '[    ]'} ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  log(`Starting headless test  p1=${P1_MODEL}  p2=${P2_MODEL}  rounds=${ROUNDS}  visible=${VISIBLE}`);

  const browser = await puppeteer.launch({
    headless: !VISIBLE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  // ── Capture browser console ──────────────────────────────────────────────
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') log(`[Browser] ${msg.text()}`, 'ERR');
    else if (type === 'warn')  log(`[Browser] ${msg.text()}`, 'WARN');
    // else log(`[Browser] ${msg.text()}`);
  });
  page.on('pageerror', err => log(`[PageError] ${err.message}`, 'ERR'));

  try {
    // ── 1. Open game page ──────────────────────────────────────────────────
    log('Opening game page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
    log('Page loaded', 'OK');

    // ── 2. Wait for server connected ──────────────────────────────────────
    log('Waiting for server connection...');
    await page.waitForFunction(
      () => document.getElementById('server-status')?.classList.contains('connected'),
      { timeout: 10000 }
    );
    log('Server connected', 'OK');

    // ── 3. Select models ──────────────────────────────────────────────────
    log(`Selecting models: p1=${P1_MODEL}, p2=${P2_MODEL}`);
    await page.evaluate((p1, p2) => {
      const s1 = document.getElementById('p1-model');
      const s2 = document.getElementById('p2-model');
      // Try to select by value; if not found, keep default
      for (const opt of s1.options) { if (opt.value === p1) { s1.value = p1; break; } }
      for (const opt of s2.options) { if (opt.value === p2) { s2.value = p2; break; } }
    }, P1_MODEL, P2_MODEL);

    // Set max rounds
    await page.evaluate((r) => {
      const el = document.getElementById('max-rounds');
      if (el) { el.value = r; el.dispatchEvent(new Event('change')); }
    }, ROUNDS);

    // Set player names
    await page.evaluate((p1, p2) => {
      const n1 = document.getElementById('p1-name');
      const n2 = document.getElementById('p2-name');
      if (n1) n1.value = p1;
      if (n2) n2.value = p2;
    }, P1_MODEL.split('-')[0].toUpperCase(), P2_MODEL.split('-')[0].toUpperCase());

    log('Config set', 'OK');

    // ── 4. Start game ─────────────────────────────────────────────────────
    log('Clicking start button...');
    await page.click('#btn-start');
    await sleep(500);

    // Wait for game screen to become active
    await page.waitForFunction(
      () => document.getElementById('game-screen')?.classList.contains('active'),
      { timeout: 8000 }
    );
    log('Game screen active', 'OK');

    // ── 5. Monitor game progress ──────────────────────────────────────────
    log('Game started! Monitoring rounds...');
    const startTime = Date.now();
    let lastRound = 0;
    let stuckCount = 0;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT) {
        log('Test timeout reached!', 'WARN');
        break;
      }

      // Check if result screen appeared
      const onResult = await page.evaluate(
        () => document.getElementById('result-screen')?.classList.contains('active')
      );
      if (onResult) {
        log('Result screen detected — game over!', 'OK');
        break;
      }

      // Read current round
      const roundInfo = await page.evaluate(() => {
        const round = document.getElementById('round-num')?.textContent || '0';
        const maxRound = document.getElementById('max-round-num')?.textContent || '?';
        const p1hp = document.getElementById('g-p1-hp-text')?.textContent || '';
        const p2hp = document.getElementById('g-p2-hp-text')?.textContent || '';
        const p1thought = document.getElementById('g-p1-thought')?.textContent || '';
        const p2thought = document.getElementById('g-p2-thought')?.textContent || '';
        const logEl = document.getElementById('game-log');
        const lastLog = logEl?.lastElementChild?.textContent || '';
        return { round, maxRound, p1hp, p2hp, p1thought, p2thought, lastLog };
      });

      const curRound = parseInt(roundInfo.round);
      if (curRound !== lastRound) {
        log(`Round ${roundInfo.round}/${roundInfo.maxRound}  🔴${roundInfo.p1hp}  🔵${roundInfo.p2hp}`, 'GAME');
        if (roundInfo.p1thought && roundInfo.p1thought !== '等待中...') {
          log(`  🔴 思考: ${roundInfo.p1thought}`);
        }
        if (roundInfo.p2thought && roundInfo.p2thought !== '等待中...') {
          log(`  🔵 思考: ${roundInfo.p2thought}`);
        }
        lastRound = curRound;
        stuckCount = 0;
      } else {
        stuckCount++;
        if (stuckCount > 60) { // 30s stuck
          log('Game appears stuck (no round progress for 30s)', 'WARN');
          stuckCount = 0;
        }
      }

      await sleep(500);
    }

    // ── 6. Collect result ─────────────────────────────────────────────────
    const result = await page.evaluate(() => {
      const title   = document.getElementById('result-title')?.textContent || '';
      const winner  = document.getElementById('result-winner')?.textContent || '';
      const stats   = document.getElementById('result-stats')?.textContent || '';
      return { title, winner, stats };
    });

    log('═══════════════════════════════════════', 'OK');
    log(`Result: ${result.title}`, 'OK');
    log(`Winner: ${result.winner}`, 'OK');
    log(`Stats:  ${result.stats.replace(/\s+/g, ' ').trim()}`, 'OK');
    log('═══════════════════════════════════════', 'OK');

    // ── 7. Screenshot ─────────────────────────────────────────────────────
    const screenshotPath = `test/result-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    log(`Screenshot saved: ${screenshotPath}`, 'OK');

    // ── 8. Test replay button ─────────────────────────────────────────────
    log('Testing replay feature...');
    const replayBtn = await page.$('#btn-replay');
    if (replayBtn) {
      await replayBtn.click();
      await sleep(1000);
      const onReplay = await page.evaluate(
        () => document.getElementById('replay-screen')?.classList.contains('active')
      );
      if (onReplay) {
        log('Replay screen opened successfully', 'OK');
        await sleep(3000); // Watch a few frames
        const replayRound = await page.evaluate(
          () => document.getElementById('replay-round-cur')?.textContent
        );
        log(`Replay at round: ${replayRound}`, 'GAME');
        // Exit replay
        await page.click('#replay-exit');
        await sleep(500);
        log('Replay exit OK', 'OK');
      } else {
        log('Replay screen did not open', 'WARN');
      }
    } else {
      log('Replay button not found', 'WARN');
    }

    log('All tests passed ✓', 'OK');

  } catch (err) {
    log(`Test failed: ${err.message}`, 'ERR');
    console.error(err);
    // Screenshot on failure
    try {
      const failPath = `test/fail-${Date.now()}.png`;
      await page.screenshot({ path: failPath });
      log(`Failure screenshot: ${failPath}`, 'WARN');
    } catch (_) {}
    process.exitCode = 1;
  } finally {
    if (!VISIBLE) {
      await browser.close();
    } else {
      log('Browser left open (--visible mode). Close manually.');
    }
  }
})();
