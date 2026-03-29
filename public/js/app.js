/**
 * app.js - Application controller
 */
(function () {
  'use strict';

  let game = null;
  let lastConfig = null;
  let serverConnected = false;

  const $ = id => document.getElementById(id);

  // ========== Server Connection Check ==========
  async function checkServerConnection() {
    const statusEl = $('server-status');
    const startBtn = $('btn-start');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('/api/models', { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        serverConnected = true;
        if (statusEl) {
          statusEl.className = 'server-status connected';
          statusEl.innerHTML = '🟢 服务器已连接';
        }
        startBtn.disabled = false;
        startBtn.classList.remove('btn-disabled');
        return true;
      }
    } catch (e) {}
    serverConnected = false;
    if (statusEl) {
      statusEl.className = 'server-status disconnected';
      statusEl.innerHTML = '🔴 服务器未连接 - 请先运行 <code>npm start</code>';
    }
    startBtn.disabled = true;
    startBtn.classList.add('btn-disabled');
    return false;
  }

  // ========== Load models from server ==========
  async function loadModels() {
    const connected = await checkServerConnection();
    if (!connected) {
      // Retry every 3 seconds
      const retryInterval = setInterval(async () => {
        const ok = await checkServerConnection();
        if (ok) {
          clearInterval(retryInterval);
          await fetchModels();
        }
      }, 3000);
      // Also load fallback models
      loadFallbackModels();
      return;
    }
    await fetchModels();
  }

  async function fetchModels() {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const p1Select = $('p1-model');
      const p2Select = $('p2-model');
      p1Select.innerHTML = '';
      p2Select.innerHTML = '';
      data.models.forEach((m, i) => {
        const opt1 = new Option(`${m.icon} ${m.name} (${m.id})`, m.id);
        const opt2 = new Option(`${m.icon} ${m.name} (${m.id})`, m.id);
        p1Select.appendChild(opt1);
        p2Select.appendChild(opt2);
      });
      // Default: first model for red, second for blue
      if (data.models.length >= 2) {
        p1Select.value = data.models[0].id;
        p2Select.value = data.models[1].id;
        $('p1-name').value = data.models[0].name;
        $('p2-name').value = data.models[1].name;
      }
    } catch (err) {
      console.error('Failed to load models:', err);
      loadFallbackModels();
    }
  }

  function loadFallbackModels() {
    const fallback = [
      { id: 'deepseek-v3-2-volc', name: 'DeepSeek V3', icon: '🧠' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', icon: '🌙' },
      { id: 'hunyuan-2.0-thinking', name: '混元 2.0', icon: '🔥' },
      { id: 'glm-5.0', name: 'GLM-5.0', icon: '🤖' },
      { id: 'glm-4.7', name: 'GLM-4.7', icon: '⚡' },
      { id: 'minimax-m2.7', name: 'MiniMax M2.7', icon: '🎯' },
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', icon: '💫' },
      { id: 'glm-5.0-turbo', name: 'GLM-5.0 Turbo', icon: '🚀' },
    ];
    const p1Select = $('p1-model');
    const p2Select = $('p2-model');
    if (p1Select.options.length === 0) {
      fallback.forEach(m => {
        p1Select.appendChild(new Option(`${m.icon} ${m.name}`, m.id));
        p2Select.appendChild(new Option(`${m.icon} ${m.name}`, m.id));
      });
    }
  }

  // ========== Screen Management ==========
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  // ========== Config Events ==========
  $('btn-start').addEventListener('click', startGame);

  // Model selection auto-fills name
  $('p1-model').addEventListener('change', () => {
    const sel = $('p1-model');
    const text = sel.options[sel.selectedIndex]?.text || '';
    const name = text.replace(/^[^\s]+\s/, '').replace(/\s*\(.*\)$/, '');
    if (name) $('p1-name').value = name;
  });
  $('p2-model').addEventListener('change', () => {
    const sel = $('p2-model');
    const text = sel.options[sel.selectedIndex]?.text || '';
    const name = text.replace(/^[^\s]+\s/, '').replace(/\s*\(.*\)$/, '');
    if (name) $('p2-name').value = name;
  });

  // ========== Game Events ==========
  $('btn-auto').addEventListener('click', () => {
    if (!game) return;
    game.autoPlay = !game.autoPlay;
    $('btn-auto').textContent = game.autoPlay ? '▶ 自动' : '⏸ 手动';
    $('btn-auto').classList.toggle('btn-active', game.autoPlay);
    if (game.autoPlay) game.setAutoPlay(true);
  });

  $('btn-step').addEventListener('click', () => {
    if (!game) return;
    if (!game.autoPlay) game.stepOnce();
  });

  $('btn-quit').addEventListener('click', () => {
    if (game) game.gameOver = true;
    game = null;
    showScreen('config-screen');
  });

  // ========== Result Events ==========
  $('btn-rematch').addEventListener('click', () => {
    if (lastConfig) startGameWithConfig(lastConfig);
  });
  $('btn-back').addEventListener('click', () => showScreen('config-screen'));

  // ========== Start Game ==========
  async function startGame() {
    // Re-check server connection before starting
    if (!serverConnected) {
      const ok = await checkServerConnection();
      if (!ok) {
        alert('⚠️ 服务器未连接！请先运行: npm start');
        return;
      }
    }

    const config = {
      p1Name: $('p1-name').value || 'Red AI',
      p2Name: $('p2-name').value || 'Blue AI',
      p1Model: $('p1-model').value,
      p2Model: $('p2-model').value,
      mapSize: $('map-size').value,
      obstacleCount: parseInt($('obstacle-count').value) || 6,
      maxRounds: parseInt($('max-rounds').value) || 30,
    };
    lastConfig = config;
    startGameWithConfig(config);
  }

  function startGameWithConfig(config) {
    showScreen('game-screen');

    // Reset UI
    $('g-p1-name').textContent = config.p1Name;
    $('g-p2-name').textContent = config.p2Name;
    $('g-p1-model').textContent = config.p1Model;
    $('g-p2-model').textContent = config.p2Model;
    $('max-round-num').textContent = config.maxRounds;
    $('game-log').innerHTML = '';
    $('g-p1-thought').textContent = '等待中...';
    $('g-p2-thought').textContent = '等待中...';
    $('g-p1-history').innerHTML = '';
    $('g-p2-history').innerHTML = '';
    $('g-p1-detail').innerHTML = '<span class="detail-placeholder">等待AI响应...</span>';
    $('g-p2-detail').innerHTML = '<span class="detail-placeholder">等待AI响应...</span>';
    $('btn-auto').textContent = '▶ 自动';
    $('btn-auto').classList.add('btn-active');

    game = new Game(config);
    game.autoPlay = true;

    game.onLog = (msg, type) => addLog(msg, type);
    game.onUpdate = (state) => updateUI(state);
    game.onTurnStart = (playerId) => showTurnIndicator(playerId);
    game.onThought = (playerId, thought) => updateThought(playerId, thought);
    game.onAIDetail = (playerId, detail) => updateAIDetail(playerId, detail);
    game.onGameOver = (result) => {
      setTimeout(() => showResult(result), 1000);
    };

    game.start();
  }

  // ========== UI Updates ==========
  function updateUI(state) {
    $('round-num').textContent = state.round;

    // Red
    const redPct = state.red.hp / state.red.maxHp * 100;
    $('g-p1-hp').style.width = redPct + '%';
    $('g-p1-hp-text').textContent = `HP: ${state.red.hp}/${state.red.maxHp}`;
    $('g-p1-hits').textContent = state.red.hits;
    $('g-p1-shots').textContent = state.red.shots;
    $('g-p1-accuracy').textContent = state.red.accuracy + '%';

    // Blue
    const bluePct = state.blue.hp / state.blue.maxHp * 100;
    $('g-p2-hp').style.width = bluePct + '%';
    $('g-p2-hp-text').textContent = `HP: ${state.blue.hp}/${state.blue.maxHp}`;
    $('g-p2-hits').textContent = state.blue.hits;
    $('g-p2-shots').textContent = state.blue.shots;
    $('g-p2-accuracy').textContent = state.blue.accuracy + '%';

    // Low HP warning flash
    if (redPct <= 20) $('g-p1-hp').classList.add('hp-critical');
    else $('g-p1-hp').classList.remove('hp-critical');
    if (bluePct <= 20) $('g-p2-hp').classList.add('hp-critical');
    else $('g-p2-hp').classList.remove('hp-critical');
  }

  function showTurnIndicator(playerId) {
    const el = $('turn-indicator');
    el.className = 'turn-indicator turn-' + playerId + ' turn-thinking';
    const icon = playerId === 'red' ? '🔴' : '🔵';
    const name = playerId === 'red' ? game.config.p1Name : game.config.p2Name;
    el.innerHTML = `<span class="spinner"></span>${icon} ${name} 思考中...`;

    // Flash overlay
    const overlay = $('turn-overlay');
    const overlayText = $('turn-overlay-text');
    overlayText.className = 'turn-overlay-text ' + playerId;
    overlayText.textContent = `${icon} ${name} 的回合`;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.display = 'none'; }, 1000);
  }

  function updateThought(playerId, thought) {
    const el = playerId === 'red' ? $('g-p1-thought') : $('g-p2-thought');
    el.textContent = thought;

    // Add to history
    const histEl = playerId === 'red' ? $('g-p1-history') : $('g-p2-history');
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<span class="h-round">R${game.round}</span> ${thought}`;
    histEl.appendChild(item);
    histEl.scrollTop = histEl.scrollHeight;

    // Update turn indicator
    const ti = $('turn-indicator');
    ti.className = 'turn-indicator turn-' + playerId;
    const icon = playerId === 'red' ? '🔴' : '🔵';
    const name = playerId === 'red' ? game.config.p1Name : game.config.p2Name;
    ti.textContent = `${icon} ${name}: ${thought}`;
  }

  function updateAIDetail(playerId, detail) {
    if (!detail) return;
    const el = playerId === 'red' ? $('g-p1-detail') : $('g-p2-detail');
    if (!el) return;

    const elapsed = detail.elapsed || 0;
    const model = detail.model || '?';
    const parseMethod = detail.parseMethod || '?';
    const raw = detail.raw || '';
    const error = detail.error || '';

    // Color code elapsed time
    let timeClass = 'time-fast';
    if (elapsed > 10000) timeClass = 'time-slow';
    else if (elapsed > 5000) timeClass = 'time-medium';

    let statusIcon = '✅';
    let statusText = '成功';
    if (error || parseMethod === 'fallback_random') {
      statusIcon = '❌';
      statusText = '失败(随机)';
    } else if (parseMethod === 'fallback') {
      statusIcon = '⚠️';
      statusText = '降级解析';
    }

    // Truncate raw for display
    const rawDisplay = raw.length > 200 ? raw.substring(0, 200) + '...' : raw;

    el.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">⏱ 耗时</span>
        <span class="detail-value ${timeClass}">${(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">📡 状态</span>
        <span class="detail-value">${statusIcon} ${statusText}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">🔧 解析</span>
        <span class="detail-value">${parseMethod}</span>
      </div>
      ${error ? `<div class="detail-row detail-error"><span class="detail-label">❗ 错误</span><span class="detail-value">${error}</span></div>` : ''}
      <div class="detail-raw-toggle" onclick="this.nextElementSibling.classList.toggle('detail-raw-show')">
        📄 原始响应 <span class="toggle-arrow">▶</span>
      </div>
      <div class="detail-raw">${escapeHtml(rawDisplay)}</div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function addLog(msg, type) {
    const el = document.createElement('div');
    el.style.display = 'inline';
    el.style.marginRight = '10px';
    if (type === 'red') el.className = 'log-red';
    else if (type === 'blue') el.className = 'log-blue';
    else if (type === 'system') el.className = 'log-system';
    else if (type === 'damage') el.className = 'log-damage';
    el.textContent = msg;
    $('game-log').appendChild(el);
    $('game-log').scrollTop = $('game-log').scrollHeight;
  }

  // ========== Result Screen ==========
  function showResult(result) {
    showScreen('result-screen');

    if (result.winner === 'draw') {
      $('result-title').textContent = '🤝 平局！';
      $('result-winner').textContent = '双方势均力敌';
      $('result-winner').style.cssText = 'background:rgba(255,255,255,0.1);color:#ffd700';
    } else if (result.winner === 'red') {
      $('result-title').textContent = '🏆 红方获胜！';
      $('result-winner').textContent = `🔴 ${result.red.name} (${result.red.model}) 击败了 🔵 ${result.blue.name}`;
      $('result-winner').style.cssText = 'background:rgba(231,76,60,0.2);color:#e74c3c';
    } else {
      $('result-title').textContent = '🏆 蓝方获胜！';
      $('result-winner').textContent = `🔵 ${result.blue.name} (${result.blue.model}) 击败了 🔴 ${result.red.name}`;
      $('result-winner').style.cssText = 'background:rgba(52,152,219,0.2);color:#3498db';
    }

    // Replay summary
    const replayEl = $('result-replay');
    let replayHtml = '<strong>📜 对战回放</strong><br>';
    for (const h of result.history) {
      const icon = h.player === 'red' ? '🔴' : '🔵';
      const cls = h.player === 'red' ? 'log-red' : 'log-blue';
      replayHtml += `<span class="${cls}">R${h.round} ${icon} ${h.action}</span> <span style="color:#666">${h.thought || ''}</span><br>`;
    }
    replayEl.innerHTML = replayHtml;

    // Stats
    $('result-stats').innerHTML = `
      <div class="stat-card" style="border-color:rgba(231,76,60,0.3)">
        <h3 style="color:#e74c3c">🔴 ${result.red.name}</h3>
        <div class="stat-value">${result.red.hp} HP</div>
        <div class="stat-detail">
          模型: ${result.red.model}<br>
          开火: ${result.red.shotsFired} 次<br>
          命中: ${result.red.shotsHit} 次<br>
          命中率: ${result.red.accuracy}%<br>
          造成伤害: ${result.red.damageDealt}<br>
          承受伤害: ${result.red.damageTaken}
        </div>
      </div>
      <div class="stat-card">
        <h3 style="color:#ffd700">📊 战斗统计</h3>
        <div class="stat-value">${result.rounds} 回合</div>
        <div class="stat-detail">
          ${result.winner === 'draw' ? '结果: 平局' :
            result.winner === 'red' ? `胜者: ${result.red.name}` : `胜者: ${result.blue.name}`}
        </div>
      </div>
      <div class="stat-card" style="border-color:rgba(52,152,219,0.3)">
        <h3 style="color:#3498db">🔵 ${result.blue.name}</h3>
        <div class="stat-value">${result.blue.hp} HP</div>
        <div class="stat-detail">
          模型: ${result.blue.model}<br>
          开火: ${result.blue.shotsFired} 次<br>
          命中: ${result.blue.shotsHit} 次<br>
          命中率: ${result.blue.accuracy}%<br>
          造成伤害: ${result.blue.damageDealt}<br>
          承受伤害: ${result.blue.damageTaken}
        </div>
      </div>
    `;
  }

  // ========== Init ==========
  loadModels();
})();
