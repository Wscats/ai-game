/**
 * app.js - Application controller
 */
(function () {
  'use strict';

  let game = null;
  let lastConfig = null;
  let serverConnected = false;

  // ========== Replay State ==========
  let replayData = null;      // { snapshots, history, config }
  let replayIndex = 0;        // current snapshot index
  let replayPlaying = false;
  let replayTimer = null;
  let replayRenderer = null;

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
      const p3Select = $('p3-model');
      const p4Select = $('p4-model');
      p1Select.innerHTML = '';
      p2Select.innerHTML = '';
      if (p3Select) p3Select.innerHTML = '';
      if (p4Select) p4Select.innerHTML = '';
      data.models.forEach((m, i) => {
        const opt1 = new Option(`${m.icon} ${m.name} (${m.id})`, m.id);
        const opt2 = new Option(`${m.icon} ${m.name} (${m.id})`, m.id);
        p1Select.appendChild(opt1);
        p2Select.appendChild(opt2);
        if (p3Select) p3Select.appendChild(new Option(`${m.icon} ${m.name} (${m.id})`, m.id));
        if (p4Select) p4Select.appendChild(new Option(`${m.icon} ${m.name} (${m.id})`, m.id));
      });
      // Default: first model for red, second for blue
      if (data.models.length >= 2) {
      p1Select.value = data.models[0].id;
        p2Select.value = data.models[1].id;
        $('p1-name').value = data.models[0].name;
        $('p2-name').value = data.models[1].name;
        // Default third model
        if (p3Select && data.models.length >= 3) {
          p3Select.value = data.models[2].id;
          $('p3-name').value = data.models[2].name;
        }
        // Default fourth model
        if (p4Select && data.models.length >= 4) {
          p4Select.value = data.models[3].id;
          $('p4-name').value = data.models[3].name;
        }
      }
    } catch (err) {
      console.error('Failed to load models:', err);
      loadFallbackModels();
    }
  }

  function loadFallbackModels() {
    const fallback = [
      { id: 'deepseek-v3-2-volc',    name: 'DeepSeek V3',      icon: '🧠' },
      { id: 'kimi-k2.5',             name: 'Kimi K2.5',        icon: '🌙' },
      { id: 'hunyuan-2.0-thinking',  name: '混元 2.0',          icon: '🔥' },
      { id: 'glm-5.0',               name: 'GLM-5.0',          icon: '🤖' },
      { id: 'glm-4.7',               name: 'GLM-4.7',          icon: '⚡' },
      { id: 'minimax-m2.7',          name: 'MiniMax M2.7',     icon: '🎯' },
      { id: 'minimax-m2.5',          name: 'MiniMax M2.5',     icon: '💫' },
      { id: 'glm-5.0-turbo',         name: 'GLM-5.0 Turbo',   icon: '🚀' },
    ];
    const p1Select = $('p1-model');
    const p2Select = $('p2-model');
    const p3Select = $('p3-model');
    const p4Select = $('p4-model');
    if (p1Select.options.length === 0) {
      fallback.forEach(m => {
        p1Select.appendChild(new Option(`${m.icon} ${m.name}`, m.id));
        p2Select.appendChild(new Option(`${m.icon} ${m.name}`, m.id));
        if (p3Select) p3Select.appendChild(new Option(`${m.icon} ${m.name}`, m.id));
        if (p4Select) p4Select.appendChild(new Option(`${m.icon} ${m.name}`, m.id));
      });
      if (p3Select && fallback.length >= 3) {
        p3Select.value = fallback[2].id;
        $('p3-name').value = fallback[2].name;
      }
      if (p4Select && fallback.length >= 4) {
        p4Select.value = fallback[3].id;
        $('p4-name').value = fallback[3].name;
      }
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
  $('p3-model').addEventListener('change', () => {
    const sel = $('p3-model');
    const text = sel.options[sel.selectedIndex]?.text || '';
    const name = text.replace(/^[^\s]+\s/, '').replace(/\s*\(.*\)$/, '');
    if (name) $('p3-name').value = name;
  });
  $('p4-model').addEventListener('change', () => {
    const sel = $('p4-model');
    const text = sel.options[sel.selectedIndex]?.text || '';
    const name = text.replace(/^[^\s]+\s/, '').replace(/\s*\(.*\)$/, '');
    if (name) $('p4-name').value = name;
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
  $('btn-replay').addEventListener('click', () => {
    if (replayData) startReplay(replayData);
  });

  // ========== Replay Controls ==========
  $('replay-prev').addEventListener('click', () => {
    replayPause();
    replayGoto(replayIndex - 1);
  });
  $('replay-next').addEventListener('click', () => {
    replayPause();
    replayGoto(replayIndex + 1);
  });
  $('replay-play').addEventListener('click', () => {
    if (replayPlaying) replayPause();
    else replayResume();
  });
  $('replay-exit').addEventListener('click', () => {
    replayPause();
    showScreen('result-screen');
  });

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
      p3Name: $('p3-name').value || '',
      p4Name: $('p4-name').value || '',
      p1Model: $('p1-model').value,
      p2Model: $('p2-model').value,
      p3Model: $('p3-model').value || '',
      p4Model: $('p4-model').value || '',
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
    replayData = null;
    replayPause();

    // Show/hide green panel
    const hasThird = !!(config.p3Model && config.p3Name);
    const greenPanel = document.querySelector('.panel-green-bg');
    const greenIntent = document.querySelector('.intent-green');
    if (greenPanel) greenPanel.style.display = hasThird ? '' : 'none';
    if (greenIntent) greenIntent.style.display = hasThird ? '' : 'none';
    if (hasThird) {
      $('g-p3-name').textContent = config.p3Name;
      $('g-p3-model').textContent = config.p3Model;
      $('g-p3-thought').textContent = '等待中...';
      $('g-p3-history').innerHTML = '';
      $('g-p3-detail').innerHTML = '<span class="detail-placeholder">等待AI响应...</span>';
      $('intent-p3-name').textContent = config.p3Name;
    }

    // Show/hide purple panel
    const hasFourth = !!(config.p4Model && config.p4Name);
    const purplePanel = document.querySelector('.panel-purple-bg');
    const purpleIntent = document.querySelector('.intent-purple');
    if (purplePanel) purplePanel.style.display = hasFourth ? '' : 'none';
    if (purpleIntent) purpleIntent.style.display = hasFourth ? '' : 'none';
    if (hasFourth) {
      $('g-p4-name').textContent = config.p4Name;
      $('g-p4-model').textContent = config.p4Model;
      $('g-p4-thought').textContent = '等待中...';
      $('g-p4-history').innerHTML = '';
      $('g-p4-detail').innerHTML = '<span class="detail-placeholder">等待AI响应...</span>';
      $('intent-p4-name').textContent = config.p4Name;
    }

    // Hide right intent column entirely if no third/fourth player
    const rightIntentCol = document.querySelector('.intent-right');
    if (rightIntentCol) rightIntentCol.style.display = (hasThird || hasFourth) ? '' : 'none';

    // Set intent panel names for red/blue
    $('intent-p1-name').textContent = config.p1Name;
    $('intent-p2-name').textContent = config.p2Name;

    game = new Game(config);
    game.autoPlay = true;

    game.onLog = (msg, type) => addLog(msg, type);
    game.onUpdate = (state) => updateUI(state);
    game.onTurnStart = (playerId) => showTurnIndicator(playerId);
    game.onThought = (playerId, thought) => updateThought(playerId, thought);
    game.onAIDetail = (playerId, detail) => updateAIDetail(playerId, detail);
    game.onGameOver = (result) => {
      replayData = { ...result, config };
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
    $('g-p1-missiles').textContent = state.red.missiles || 0;
    $('g-p1-weapon').textContent = `Lv${state.red.weaponLevel || 0}`;

    // Blue
    const bluePct = state.blue.hp / state.blue.maxHp * 100;
    $('g-p2-hp').style.width = bluePct + '%';
    $('g-p2-hp-text').textContent = `HP: ${state.blue.hp}/${state.blue.maxHp}`;
    $('g-p2-hits').textContent = state.blue.hits;
    $('g-p2-shots').textContent = state.blue.shots;
    $('g-p2-accuracy').textContent = state.blue.accuracy + '%';
    $('g-p2-missiles').textContent = state.blue.missiles || 0;
    $('g-p2-weapon').textContent = `Lv${state.blue.weaponLevel || 0}`;

    // Green
    if (state.hasThird && state.green) {
      const greenPct = state.green.hp / state.green.maxHp * 100;
      $('g-p3-hp').style.width = greenPct + '%';
      $('g-p3-hp-text').textContent = `HP: ${state.green.hp}/${state.green.maxHp}`;
      $('g-p3-hits').textContent = state.green.hits;
      $('g-p3-shots').textContent = state.green.shots;
      $('g-p3-accuracy').textContent = state.green.accuracy + '%';
      $('g-p3-missiles').textContent = state.green.missiles || 0;
      $('g-p3-weapon').textContent = `Lv${state.green.weaponLevel || 0}`;
      if (greenPct <= 20) $('g-p3-hp').classList.add('hp-critical');
      else $('g-p3-hp').classList.remove('hp-critical');
    }

    // Purple
    if (state.hasFourth && state.purple) {
      const purplePct = state.purple.hp / state.purple.maxHp * 100;
      $('g-p4-hp').style.width = purplePct + '%';
      $('g-p4-hp-text').textContent = `HP: ${state.purple.hp}/${state.purple.maxHp}`;
      $('g-p4-hits').textContent = state.purple.hits;
      $('g-p4-shots').textContent = state.purple.shots;
      $('g-p4-accuracy').textContent = state.purple.accuracy + '%';
      $('g-p4-missiles').textContent = state.purple.missiles || 0;
      $('g-p4-weapon').textContent = `Lv${state.purple.weaponLevel || 0}`;
      if (purplePct <= 20) $('g-p4-hp').classList.add('hp-critical');
      else $('g-p4-hp').classList.remove('hp-critical');
    }

    // Low HP warning flash
    if (redPct <= 20) $('g-p1-hp').classList.add('hp-critical');
    else $('g-p1-hp').classList.remove('hp-critical');
    if (bluePct <= 20) $('g-p2-hp').classList.add('hp-critical');
    else $('g-p2-hp').classList.remove('hp-critical');
  }

  function showTurnIndicator(playerId) {
    const el = $('turn-indicator');
    el.className = 'turn-indicator turn-' + playerId + ' turn-thinking';
    const icon = playerId === 'red' ? '🔴' : playerId === 'blue' ? '🔵' : playerId === 'green' ? '🟢' : '🟣';
    const name = playerId === 'red' ? game.config.p1Name
               : playerId === 'blue' ? game.config.p2Name
               : playerId === 'green' ? game.config.p3Name
               : game.config.p4Name;
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
    const elId = playerId === 'red' ? 'g-p1-thought' : playerId === 'blue' ? 'g-p2-thought' : playerId === 'green' ? 'g-p3-thought' : 'g-p4-thought';
    const el = $(elId);
    if (el) el.textContent = thought;

    // Only add real thoughts to history (skip placeholder "thinking..." states)
    const isPlaceholder = thought === '🤔 思考中...' || thought === '[请求失败]' || thought === '[无响应]';
    if (isPlaceholder) return;

    // Add to history
    const histId = playerId === 'red' ? 'g-p1-history' : playerId === 'blue' ? 'g-p2-history' : playerId === 'green' ? 'g-p3-history' : 'g-p4-history';
    const histEl = $(histId);
    if (histEl) {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `<span class="h-round">R${game.round}</span> ${thought}`;
      histEl.appendChild(item);
      histEl.scrollTop = histEl.scrollHeight;
    }

    // Update turn indicator
    const ti = $('turn-indicator');
    ti.className = 'turn-indicator turn-' + playerId;
    const icon = playerId === 'red' ? '🔴' : playerId === 'blue' ? '🔵' : playerId === 'green' ? '🟢' : '🟣';
    const name = playerId === 'red' ? game.config.p1Name
               : playerId === 'blue' ? game.config.p2Name
               : playerId === 'green' ? game.config.p3Name
               : game.config.p4Name;
    ti.textContent = `${icon} ${name}: ${thought}`;
  }

  function updateAIDetail(playerId, detail) {
    if (!detail) return;
    const elId = playerId === 'red' ? 'g-p1-detail' : playerId === 'blue' ? 'g-p2-detail' : playerId === 'green' ? 'g-p3-detail' : 'g-p4-detail';
    const el = $(elId);
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
    else if (type === 'green') el.className = 'log-green';
    else if (type === 'system') el.className = 'log-system';
    else if (type === 'damage') el.className = 'log-damage';
    el.textContent = msg;
    $('game-log').appendChild(el);
    $('game-log').scrollTop = $('game-log').scrollHeight;
  }

  // ========== Replay Functions ==========
  function startReplay(data) {
    replayData = data;
    replayIndex = 0;
    replayPlaying = false;

    showScreen('replay-screen');

    // Init canvas
    const canvas = $('replay-canvas');
    const snap0 = data.snapshots[0];
    canvas.width = snap0.mapWidth;
    canvas.height = snap0.mapHeight;
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    canvas.style.width = 'auto';
    canvas.style.height = 'auto';

    // Init renderer (reuse Renderer class)
    replayRenderer = new Renderer(canvas);

    // Set names
    $('replay-p1-name').textContent = data.config.p1Name + ' 🔴';
    $('replay-p2-name').textContent = data.config.p2Name + ' 🔵';
    if (data.hasThird && data.config.p3Name) {
      $('replay-p3-name').textContent = data.config.p3Name + ' 🟢';
    }
    if (data.hasFourth && data.config.p4Name) {
      $('replay-p4-name').textContent = data.config.p4Name + ' 🟣';
    }
    $('replay-round-total').textContent = data.snapshots.length - 1 || data.snapshots.length;

    // Build action log entries from history
    buildReplayLogs(data);

    // Render first frame
    renderReplayFrame(0);

    // Auto-play
    replayResume();
  }

  function buildReplayLogs(data) {
    const p1Log = $('replay-p1-log');
    const p2Log = $('replay-p2-log');
    const p3Log = $('replay-p3-log');
    const p4Log = $('replay-p4-log');
    p1Log.innerHTML = '';
    p2Log.innerHTML = '';
    if (p3Log) p3Log.innerHTML = '';
    if (p4Log) p4Log.innerHTML = '';

    // Show/hide green panel in replay
    const p3Panel = $('replay-p3-panel');
    if (p3Panel) p3Panel.style.display = data.hasThird ? '' : 'none';
    // Show/hide purple panel in replay
    const p4Panel = $('replay-p4-panel');
    if (p4Panel) p4Panel.style.display = data.hasFourth ? '' : 'none';

    for (const h of data.history) {
      const el = document.createElement('div');
      el.className = 'replay-log-item';
      el.dataset.round = h.round;
      el.dataset.player = h.player;
      const actionLabel = {
        move_forward: '前进', move_backward: '后退',
        rotate_left: '左转', rotate_right: '右转',
        fire: '开火', fire_missile: '导弹', wait: '等待',
      }[h.action] || h.action;
      el.innerHTML = `<span class="rl-round">R${h.round}</span> <span class="rl-action">${actionLabel}</span> <span class="rl-thought">${h.thought || ''}</span>`;
      if (h.player === 'red') p1Log.appendChild(el);
      else if (h.player === 'blue') p2Log.appendChild(el);
      else if (h.player === 'green' && p3Log) p3Log.appendChild(el);
      else if (h.player === 'purple' && p4Log) p4Log.appendChild(el);
    }
  }

  function renderReplayFrame(idx) {
    if (!replayData || !replayRenderer) return;
    const snaps = replayData.snapshots;
    if (idx < 0 || idx >= snaps.length) return;
    replayIndex = idx;

    const snap = snaps[idx];
    $('replay-round-cur').textContent = snap.round;

    // Progress bar
    const pct = snaps.length > 1 ? (idx / (snaps.length - 1)) * 100 : 100;
    $('replay-progress-fill').style.width = pct + '%';

    // HP bars
    const redPct = snap.red.hp / snap.red.maxHp * 100;
    const bluePct = snap.blue.hp / snap.blue.maxHp * 100;
    $('replay-p1-hp').style.width = redPct + '%';
    $('replay-p2-hp').style.width = bluePct + '%';
    $('replay-p1-hp-text').textContent = `HP: ${snap.red.hp}/${snap.red.maxHp}`;
    $('replay-p2-hp-text').textContent = `HP: ${snap.blue.hp}/${snap.blue.maxHp}`;
    if (snap.green && $('replay-p3-hp')) {
      const greenPct = snap.green.hp / snap.green.maxHp * 100;
      $('replay-p3-hp').style.width = greenPct + '%';
      $('replay-p3-hp-text').textContent = `HP: ${snap.green.hp}/${snap.green.maxHp}`;
    }
    if (snap.purple && $('replay-p4-hp')) {
      const purplePct = snap.purple.hp / snap.purple.maxHp * 100;
      $('replay-p4-hp').style.width = purplePct + '%';
      $('replay-p4-hp-text').textContent = `HP: ${snap.purple.hp}/${snap.purple.maxHp}`;
    }

    // Highlight current round log items
    document.querySelectorAll('.replay-log-item').forEach(el => {
      el.classList.toggle('rl-current', parseInt(el.dataset.round) === snap.round);
    });
    // Scroll log to current
    const curRed = $('replay-p1-log').querySelector('.rl-current');
    if (curRed) curRed.scrollIntoView({ block: 'nearest' });
    const curBlue = $('replay-p2-log').querySelector('.rl-current');
    if (curBlue) curBlue.scrollIntoView({ block: 'nearest' });
    const p3Log = $('replay-p3-log');
    if (p3Log) {
      const curGreen = p3Log.querySelector('.rl-current');
      if (curGreen) curGreen.scrollIntoView({ block: 'nearest' });
    }
    const p4Log = $('replay-p4-log');
    if (p4Log) {
      const curPurple = p4Log.querySelector('.rl-current');
      if (curPurple) curPurple.scrollIntoView({ block: 'nearest' });
    }

    // Build fake map/tanks for renderer
    const fakeMap = {
      width: snap.mapWidth,
      height: snap.mapHeight,
      obstacles: snap.obstacles,
      terrainPatches: snap.terrainPatches || [],
    };
    const tankSize = (typeof CONST !== 'undefined' ? CONST.TANK_SIZE : 30);
    const fakeTanks = [
      { ...snap.red,  id: 'red',  alive: snap.red.hp > 0,  size: tankSize, name: replayData.config.p1Name || '红方' },
      { ...snap.blue, id: 'blue', alive: snap.blue.hp > 0, size: tankSize, name: replayData.config.p2Name || '蓝方' },
    ];
    if (snap.green) fakeTanks.push({ ...snap.green, id: 'green', alive: snap.green.hp > 0, size: tankSize, name: replayData.config.p3Name || '绿方' });
    if (snap.purple) fakeTanks.push({ ...snap.purple, id: 'purple', alive: snap.purple.hp > 0, size: tankSize, name: replayData.config.p4Name || '紫方' });
    const fakeEvents = (snap.events || []).map(e => ({ ...e, active: true }));

    replayRenderer.bulletTrails = [];
    replayRenderer.explosions = [];
    replayRenderer.render({
      map: fakeMap,
      tanks: fakeTanks,
      events: fakeEvents,
      redTrail: snap.redTrail || [],
      blueTrail: snap.blueTrail || [],
    });
  }

  function replayGoto(idx) {
    const snaps = replayData ? replayData.snapshots : [];
    if (idx < 0) idx = 0;
    if (idx >= snaps.length) idx = snaps.length - 1;
    renderReplayFrame(idx);
  }

  function replayResume() {
    if (!replayData) return;
    replayPlaying = true;
    $('replay-play').textContent = '⏸ 暂停';
    $('replay-play').classList.add('btn-active');
    scheduleReplayNext();
  }

  function replayPause() {
    replayPlaying = false;
    $('replay-play').textContent = '▶ 播放';
    $('replay-play').classList.remove('btn-active');
    if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; }
  }

  function scheduleReplayNext() {
    if (!replayPlaying) return;
    const speed = parseInt($('replay-speed').value) || 1000;
    replayTimer = setTimeout(() => {
      if (!replayPlaying) return;
      const next = replayIndex + 1;
      if (next >= replayData.snapshots.length) {
        replayPause(); // reached end
        return;
      }
      renderReplayFrame(next);
      scheduleReplayNext();
    }, speed);
  }

  // ========== Result Screen ==========
  function showResult(result) {
    showScreen('result-screen');

    if (result.winner === 'draw') {
      $('result-title').textContent = '🤝 平局！';
      $('result-winner').textContent = result.hasThird ? '三方势均力敌' : '双方势均力敌';
      $('result-winner').style.cssText = 'background:rgba(255,255,255,0.1);color:#ffd700';
    } else if (result.winner === 'red') {
      $('result-title').textContent = '🏆 红方获胜！';
      $('result-winner').textContent = `🔴 ${result.red.name} (${result.red.model}) 获胜！`;
      $('result-winner').style.cssText = 'background:rgba(231,76,60,0.2);color:#e74c3c';
    } else if (result.winner === 'blue') {
      $('result-title').textContent = '🏆 蓝方获胜！';
      $('result-winner').textContent = `🔵 ${result.blue.name} (${result.blue.model}) 获胜！`;
      $('result-winner').style.cssText = 'background:rgba(52,152,219,0.2);color:#3498db';
    } else if (result.winner === 'green') {
      $('result-title').textContent = '🏆 绿方获胜！';
      $('result-winner').textContent = `🟢 ${result.green.name} (${result.green.model}) 获胜！`;
      $('result-winner').style.cssText = 'background:rgba(46,204,113,0.2);color:#2ecc71';
    } else if (result.winner === 'purple') {
      $('result-title').textContent = '🏆 紫方获胜！';
      $('result-winner').textContent = `🟣 ${result.purple.name} (${result.purple.model}) 获胜！`;
      $('result-winner').style.cssText = 'background:rgba(155,89,182,0.2);color:#9b59b6';
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
    const winnerName = result.winner === 'draw' ? '平局'
      : result.winner === 'red' ? result.red.name
      : result.winner === 'blue' ? result.blue.name
      : result.green ? result.green.name : '?';
    let statsHtml = `
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
        <div class="stat-detail">胜者: ${winnerName}</div>
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
      </div>`;
    if (result.hasThird && result.green) {
      statsHtml += `
      <div class="stat-card" style="border-color:rgba(46,204,113,0.3)">
        <h3 style="color:#2ecc71">🟢 ${result.green.name}</h3>
        <div class="stat-value">${result.green.hp} HP</div>
        <div class="stat-detail">
          模型: ${result.green.model}<br>
          开火: ${result.green.shotsFired} 次<br>
          命中: ${result.green.shotsHit} 次<br>
          命中率: ${result.green.accuracy}%<br>
          造成伤害: ${result.green.damageDealt}<br>
          承受伤害: ${result.green.damageTaken}
        </div>
      </div>`;
    }
    if (result.hasFourth && result.purple) {
      statsHtml += `
      <div class="stat-card" style="border-color:rgba(155,89,182,0.3)">
        <h3 style="color:#9b59b6">🟣 ${result.purple.name}</h3>
        <div class="stat-value">${result.purple.hp} HP</div>
        <div class="stat-detail">
          模型: ${result.purple.model}<br>
          开火: ${result.purple.shotsFired} 次<br>
          命中: ${result.purple.shotsHit} 次<br>
          命中率: ${result.purple.accuracy}%<br>
          造成伤害: ${result.purple.damageDealt}<br>
          承受伤害: ${result.purple.damageTaken}
        </div>
      </div>`;
    }
    $('result-stats').innerHTML = statsHtml;
  }

  // ========== Init ==========
  loadModels();
})();
