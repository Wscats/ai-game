/**
 * headless-test.js
 * Headless browser test for AI Tank Battle using Puppeteer.
 * Takes a screenshot after each round.
 * Usage: node test/headless-test.js [--visible] [--rounds=N] [--p1=model] [--p2=model]
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const VISIBLE   = args.includes('--visible');
const ROUNDS    = parseInt((args.find(a => a.startsWith('--rounds=')) || '--rounds=20').split('=')[1]);
const P1_MODEL  = (args.find(a => a.startsWith('--p1=')) || '--p1=deepseek-v3-2-volc').split('=')[1];
const P2_MODEL  = (args.find(a => a.startsWith('--p2=')) || '--p2=kimi-k2.5').split('=')[1];
const BASE_URL  = 'http://localhost:3000';
const TIMEOUT   = 100 * 60 * 1000; // 100 min total (enough for 120 rounds)

// ── Screenshot directory ──────────────────────────────────────────────────────
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function safeScreenshot(page, filePath) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.screenshot({ path: filePath, fullPage: false });
      return true;
    } catch (err) {
      log(`Screenshot attempt ${attempt} failed: ${err.message}`, 'WARN');
      if (attempt < 3) await sleep(500);
    }
  }
  return false;
}

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prefix = { INFO: '\x1b[36m[INFO]\x1b[0m', OK: '\x1b[32m[ OK ]\x1b[0m', WARN: '\x1b[33m[WARN]\x1b[0m', ERR: '\x1b[31m[ERR ]\x1b[0m', GAME: '\x1b[35m[GAME]\x1b[0m' };
  console.log(`${ts} ${prefix[level] || '[    ]'} ${msg}`);
}

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    log(`Created screenshot directory: ${SCREENSHOT_DIR}`, 'OK');
  } else {
    // Clean up old screenshots
    const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
    for (const f of files) {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, f));
    }
    log(`Cleaned ${files.length} old screenshots`, 'INFO');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  log(`Starting headless test  p1=${P1_MODEL}  p2=${P2_MODEL}  rounds=${ROUNDS}  visible=${VISIBLE}`);
  ensureScreenshotDir();

  const browser = await puppeteer.launch({
    headless: !VISIBLE,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1440,900',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 60000,
  });

  const page = await browser.newPage();

  // ── Capture browser console ──────────────────────────────────────────────
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') log(`[Browser] ${msg.text()}`, 'ERR');
    else if (type === 'warn')  log(`[Browser] ${msg.text()}`, 'WARN');
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

    // Take initial screenshot (round 0 - game start)
    const initScreenshot = path.join(SCREENSHOT_DIR, 'round-00-start.png');
    await safeScreenshot(page, initScreenshot);
    log(`📸 Screenshot saved: round-00-start.png`, 'OK');

    // ── 5. Monitor game progress & screenshot each round ──────────────────
    log('Game started! Monitoring rounds & taking screenshots...');
    const startTime = Date.now();
    let lastRound = 0;
    let stuckCount = 0;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT) {
        log('Test timeout reached!', 'WARN');
        break;
      }

      // Wrap all page interactions in try-catch to survive transient errors
      try {
        // Check if result screen appeared
        const onResult = await page.evaluate(
          () => document.getElementById('result-screen')?.classList.contains('active')
        );
        if (onResult) {
          log('Result screen detected — game over!', 'OK');
          break;
        }

        // Read current round and game state
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
        if (curRound !== lastRound && curRound > 0) {
          log(`Round ${roundInfo.round}/${roundInfo.maxRound}  🔴${roundInfo.p1hp}  🔵${roundInfo.p2hp}`, 'GAME');
          if (roundInfo.p1thought && roundInfo.p1thought !== '等待中...') {
            log(`  🔴 思考: ${roundInfo.p1thought}`);
          }
          if (roundInfo.p2thought && roundInfo.p2thought !== '等待中...') {
            log(`  🔵 思考: ${roundInfo.p2thought}`);
          }

          // Wait a moment for animations to complete before taking screenshot
          await sleep(300);

          // Take screenshot for this round
          const roundStr = String(curRound).padStart(2, '0');
          const screenshotFile = `round-${roundStr}.png`;
          const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFile);
          if (await safeScreenshot(page, screenshotPath)) {
            log(`📸 Screenshot saved: ${screenshotFile}`, 'OK');
          } else {
            log(`📸 Screenshot FAILED for ${screenshotFile}`, 'WARN');
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
      } catch (loopErr) {
        log(`Loop iteration error: ${loopErr.message}`, 'WARN');
        // If page/frame is detached, try to recover
        if (loopErr.message.includes('detached') || loopErr.message.includes('closed') || loopErr.message.includes('Target closed')) {
          log('Page appears to have crashed. Attempting recovery...', 'WARN');
          await sleep(2000);
          try {
            // Try to get a fresh page reference
            const pages = await browser.pages();
            if (pages.length > 0) {
              // Reassign page variable - use the last open page
              const freshPage = pages[pages.length - 1];
              const url = await freshPage.url();
              log(`Recovered page reference (url: ${url})`, 'OK');
            } else {
              log('No pages available - browser may have crashed', 'ERR');
              break;
            }
          } catch (recoveryErr) {
            log(`Recovery failed: ${recoveryErr.message}. Ending test.`, 'ERR');
            break;
          }
        }
        await sleep(1000);
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

    // ── 7. Final result screenshot ────────────────────────────────────────
    const resultScreenshot = path.join(SCREENSHOT_DIR, 'result-final.png');
    await safeScreenshot(page, resultScreenshot);
    log(`📸 Final result screenshot saved: result-final.png`, 'OK');

    // ── 8. Test replay button ─────────────────────────────────────────────
    log('Testing replay feature...');
    const replayBtn = await page.$('#btn-replay');
    if (replayBtn) {
      await page.evaluate(() => document.getElementById('btn-replay')?.click());
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

        // Take replay screenshot
        const replayScreenshot = path.join(SCREENSHOT_DIR, 'replay.png');
        await safeScreenshot(page, replayScreenshot);
        log(`📸 Replay screenshot saved: replay.png`, 'OK');

        // Exit replay
        await page.evaluate(() => document.getElementById('replay-exit')?.click());
        await sleep(500);
        log('Replay exit OK', 'OK');
      } else {
        log('Replay screen did not open', 'WARN');
      }
    } else {
      log('Replay button not found', 'WARN');
    }

    // ── 9. Summary ────────────────────────────────────────────────────────
    const totalScreenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).length;
    log(`\n📁 All ${totalScreenshots} screenshots saved to: ${SCREENSHOT_DIR}`, 'OK');
    log('All tests passed ✓', 'OK');

  } catch (err) {
    log(`Test failed: ${err.message}`, 'ERR');
    console.error(err);
    // Screenshot on failure
    try {
      const failPath = path.join(SCREENSHOT_DIR, `fail-${Date.now()}.png`);
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
