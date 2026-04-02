/**
 * game.js - Turn-based game engine
 * Each round: Red acts -> animate -> Blue acts -> animate -> next round
 */
class Game {
  constructor(config) {
    this.config = config;
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);

    const mapSize = MAP_SIZES[config.mapSize];
    this.map = new GameMap(mapSize.width, mapSize.height, config.obstacleCount);
    this.renderer.resize(mapSize.width, mapSize.height);

    this.tankRed = new Tank('red', 60, 60, 135, CONST.COLOR_RED, config.p1Name);
    this.tankBlue = new Tank('blue', mapSize.width - 60, mapSize.height - 60, 315, CONST.COLOR_BLUE, config.p2Name);
    // Third player (green) — only active when p3Model is configured
    this.hasThird = !!(config.p3Model && config.p3Name);
    this.tankGreen = this.hasThird
      ? new Tank('green', mapSize.width - 60, 60, 225, CONST.COLOR_GREEN, config.p3Name)
      : null;
    // Fourth player (purple) — only active when p4Model is configured
    this.hasFourth = !!(config.p4Model && config.p4Name);
    this.tankPurple = this.hasFourth
      ? new Tank('purple', 60, mapSize.height - 60, 45, CONST.COLOR_PURPLE, config.p4Name)
      : null;

    this.round = 0;
    this.maxRounds = config.maxRounds;
    this.currentTurn = null;
    this.gameOver = false;
    this.winner = null;
    this.autoPlay = true;
    this.waitingForStep = false;
    this.history = [];
    this.snapshots = [];
    this.randomEvents = [];

    this.onLog = null;
    this.onUpdate = null;
    this.onGameOver = null;
    this.onTurnStart = null;
    this.onThought = null;
    this.onAIDetail = null;

    // Use a Web Worker for timers so the game keeps running in background tabs
    this._timerWorker = null;
    this._timerCallbacks = {};
    this._timerIdCounter = 0;
    try {
      this._timerWorker = new Worker('/js/timer-worker.js');
      this._timerWorker.onmessage = (e) => {
        const cb = this._timerCallbacks[e.data.id];
        if (cb) { delete this._timerCallbacks[e.data.id]; cb(); }
      };
    } catch (err) {
      // Fallback: Worker unavailable, use plain setTimeout
    }
  }

  start() {
    this.log('🎮 回合制坦克大战开始！', 'system');
    const parts = [
      `🔴 ${this.config.p1Name}`,
      `🔵 ${this.config.p2Name}`,
    ];
    if (this.hasThird) parts.push(`🟢 ${this.config.p3Name}`);
    if (this.hasFourth) parts.push(`🟣 ${this.config.p4Name}`);
    this.log(parts.join(' VS '), 'system');
    this.log('⚠️ 规则：每回合必须移动！', 'system');
    this.renderState();
    this.nextRound();
  }

  renderState() {
    const tanks = [this.tankRed, this.tankBlue];
    if (this.hasThird && this.tankGreen) tanks.push(this.tankGreen);
    if (this.hasFourth && this.tankPurple) tanks.push(this.tankPurple);
    this.renderer.render({ map: this.map, tanks, events: this.randomEvents });
    if (this.onUpdate) this.onUpdate(this.getUIState());
  }

  /**
   * Get all alive tanks
   */
  get aliveTanks() {
    const t = [this.tankRed, this.tankBlue];
    if (this.hasThird && this.tankGreen) t.push(this.tankGreen);
    if (this.hasFourth && this.tankPurple) t.push(this.tankPurple);
    return t.filter(tk => tk.alive);
  }

  async nextRound() {
    if (this.gameOver) return;

    this.round++;
    if (this.round > this.maxRounds) {
      this.endGame('timeout');
      return;
    }

    this.log(`━━━ 第 ${this.round} 回合 ━━━`, 'system');

    // Save snapshot at start of each round
    this._saveSnapshot();

    // Tick cooldowns
    this.tankRed.tickCooldown();
    this.tankBlue.tickCooldown();
    if (this.hasThird && this.tankGreen) this.tankGreen.tickCooldown();
    if (this.hasFourth && this.tankPurple) this.tankPurple.tickCooldown();

    // Increment rounds since last fire for all alive tanks
    for (const tank of this.aliveTanks) {
      tank.roundsSinceLastFire++;
    }

    // Trigger exactly one random event per round
    if (this.round > 1) {
      this.triggerRandomEvent();
    }

    // ── Fetch all AI decisions in parallel ──
    const players = ['red', 'blue'];
    if (this.hasThird && this.tankGreen && this.tankGreen.alive) players.push('green');
    if (this.hasFourth && this.tankPurple && this.tankPurple.alive) players.push('purple');

    // Show thinking state for all
    for (const pid of players) {
      if (this.onTurnStart) this.onTurnStart(pid);
      if (this.onThought) this.onThought(pid, '🤔 思考中...');
    }

    // Fetch all decisions in parallel
    const decisionPromises = players.map(pid => {
      const model = pid === 'red' ? this.config.p1Model
                  : pid === 'blue' ? this.config.p2Model
                  : pid === 'green' ? this.config.p3Model
                  : this.config.p4Model;
      const gs = this.buildGameState(pid);
      return fetch('/api/ai-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, gameState: gs, playerId: pid }),
      }).then(r => r.json()).catch(() => null);
    });

    const decisionResults = await Promise.all(decisionPromises);

    const decisions = {};
    players.forEach((pid, i) => {
      const data = decisionResults[i];
      if (data && data.decision) {
        decisions[pid] = data.decision;
        if (this.onThought) this.onThought(pid, data.decision.thought || '...');
        if (this.onAIDetail) this.onAIDetail(pid, data.detail);
      } else {
        decisions[pid] = { action: 'wait', thought: '[请求失败]' };
        if (this.onThought) this.onThought(pid, '[请求失败]');
      }
    });

    // ── Execute actions in turn order ──
    this.currentTurn = 'red';
    await this.executeAction('red', decisions['red']);
    if (this.gameOver) return;
    await this.delay(100);

    this.currentTurn = 'blue';
    await this.executeAction('blue', decisions['blue']);
    if (this.gameOver) return;

    if (this.hasThird && this.tankGreen && this.tankGreen.alive) {
      await this.delay(100);
      this.currentTurn = 'green';
      await this.executeAction('green', decisions['green']);
      if (this.gameOver) return;
    }

    if (this.hasFourth && this.tankPurple && this.tankPurple.alive) {
      await this.delay(100);
      this.currentTurn = 'purple';
      await this.executeAction('purple', decisions['purple']);
      if (this.gameOver) return;
    }

    // Tick poison clouds once per round
    this.tickPoisonEvents();

    this.renderState();

    // Auto-play or wait for step
    if (this.autoPlay) {
      await this.delay(150);
      this.nextRound();
    } else {
      this.waitingForStep = true;
    }
  }

  /**
   * Force a movement action for a tank (forward > backward > rotate)
   */
  forceMoveAction(tank) {
    if (tank.moveForward(this.map)) return '强制前进';
    if (tank.moveBackward(this.map)) return '强制后退';
    tank.rotateRight();
    return `强制右转 → ${tank.angle}°`;
  }

  /**
   * Trigger a random battlefield event
   */
  triggerRandomEvent() {
    // Check if battlefield already has max items
    const activeItems = this.randomEvents.filter(e => e.active).length;
    if (activeItems >= CONST.MAX_FIELD_ITEMS) {
      this.log(`⚠️ 战场道具已满（${activeItems}/${CONST.MAX_FIELD_ITEMS}），本回合不生成新道具`, 'system');
      return;
    }

    const events = [
      { type: 'supply', weight: 4 },         // Supply box: heal
      { type: 'mine', weight: 2 },            // Mine: damage on move
      { type: 'emp', weight: 1 },             // EMP: reset cooldowns
      { type: 'collapse', weight: 1 },        // Obstacle collapse
      { type: 'airstrike', weight: 1 },       // Airstrike: random area damage
      { type: 'shield', weight: 3 },          // Shield: absorb next hit
      { type: 'boost', weight: 2 },           // Speed boost: double move next 2 turns
      { type: 'poison', weight: 1 },          // Poison cloud: linger damage zone
      { type: 'ammo', weight: 5 },            // Ammo pack: +3 bullets
      { type: 'missile', weight: 3 },         // Missile: penetrates buildings
      { type: 'weapon_upgrade', weight: 2 },  // Weapon upgrade: +dmg & range
    ];
    const total = events.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    let chosen = events[0];
    for (const e of events) { r -= e.weight; if (r <= 0) { chosen = e; break; } }

    const margin = 60;
    const ex = margin + Math.random() * (this.map.width - margin * 2);
    const ey = margin + Math.random() * (this.map.height - margin * 2);

    switch (chosen.type) {
      case 'supply': {
        // Place supply box at random position
        const event = { type: 'supply', x: ex, y: ey, radius: 20, active: true };
        this.randomEvents.push(event);
        this.log(`📦 补给箱出现在 (${Math.round(ex)}, ${Math.round(ey)})！移动经过可回复 30HP`, 'system');
        break;
      }
      case 'mine': {
        const event = { type: 'mine', x: ex, y: ey, radius: 18, active: true };
        this.randomEvents.push(event);
        this.log(`💣 地雷埋设在 (${Math.round(ex)}, ${Math.round(ey)})！踩中扣 25HP`, 'system');
        break;
      }
      case 'emp': {
        // EMP: all tanks' cooldowns reset to max
        for (const tank of this.aliveTanks) tank.cooldown = 2;
        this.log(`⚡ 电磁脉冲！所有坦克炮管冷却重置为 2 回合`, 'system');
        break;
      }
      case 'collapse': {
        // Destroy a random brick obstacle
        const bricks = this.map.obstacles.filter(o => o.type === 'brick');
        if (bricks.length > 0) {
          const target = bricks[Math.floor(Math.random() * bricks.length)];
          this.map.damageObstacle(target);
          this.renderer.addExplosion(target.x + target.width / 2, target.y + target.height / 2, 20);
          this.log(`🧱 地图坍塌！一处砖墙被摧毁`, 'system');
        } else {
          this.log(`🌪️ 风暴来袭！但无砖墙可摧毁`, 'system');
        }
        break;
      }
      case 'airstrike': {
        // Airstrike: deal 15 damage to any tank within radius 80
        const strikeRadius = 80;
        let hit = false;
        for (const tank of this.aliveTanks) {
          const dist = Math.sqrt((tank.x - ex) ** 2 + (tank.y - ey) ** 2);
          if (dist <= strikeRadius) {
            tank.takeDamage(15);
            const tIcon = tank.id === 'red' ? '🔴' : tank.id === 'blue' ? '🔵' : tank.id === 'green' ? '🟢' : '🟣';
            this.renderer.addExplosion(tank.x, tank.y, 30);
            this.log(`✈️ 空袭命中 ${tIcon} ${tank.name}！(-15HP → ${tank.hp}HP)`, 'damage');
            hit = true;
            if (!tank.alive) { this._checkWinCondition(); if (this.gameOver) return; }
          }
        }
        if (!hit) this.log(`✈️ 空袭落点 (${Math.round(ex)}, ${Math.round(ey)})，未命中任何坦克`, 'system');
        this.renderer.addExplosion(ex, ey, 25);
        break;
      }
      case 'shield': {
        // Shield pickup: absorbs next hit
        const event = { type: 'shield', x: ex, y: ey, radius: 20, active: true };
        this.randomEvents.push(event);
        this.log(`🛡️ 护盾道具出现在 (${Math.round(ex)}, ${Math.round(ey)})！拾取可抵挡下一次伤害`, 'system');
        break;
      }
      case 'boost': {
        // Speed boost pickup: double move distance for 2 turns
        const event = { type: 'boost', x: ex, y: ey, radius: 20, active: true };
        this.randomEvents.push(event);
        this.log(`⚡ 加速道具出现在 (${Math.round(ex)}, ${Math.round(ey)})！拾取后2回合移动速度翻倍`, 'system');
        break;
      }
      case 'poison': {
        // Poison cloud: linger for 3 rounds, deal 8 dmg/round to tanks inside
        const event = { type: 'poison', x: ex, y: ey, radius: 55, active: true, rounds: 3 };
        this.randomEvents.push(event);
        this.log(`☠️ 毒雾弥漫在 (${Math.round(ex)}, ${Math.round(ey)})！范围内每回合扣 8HP，持续 3 回合`, 'system');
        break;
      }
      case 'ammo': {
        // Ammo pack: +3 bullets
        const event = { type: 'ammo', x: ex, y: ey, radius: 20, active: true };
        this.randomEvents.push(event);
        this.log(`🔫 弹药补给出现在 (${Math.round(ex)}, ${Math.round(ey)})！拾取可补充 3 发炮弹`, 'system');
        break;
      }
      case 'missile': {
        // Missile pickup: +1 missile that penetrates buildings
        const event = { type: 'missile', x: ex, y: ey, radius: 20, active: true };
        this.randomEvents.push(event);
        this.log(`🚀 导弹出现在 (${Math.round(ex)}, ${Math.round(ey)})！拾取获得 1 枚导弹（可穿透建筑物）`, 'system');
        break;
      }
      case 'weapon_upgrade': {
        // Weapon upgrade pickup: +1 weapon level
        const event = { type: 'weapon_upgrade', x: ex, y: ey, radius: 20, active: true };
        this.randomEvents.push(event);
        this.log(`⬆️ 武器升级出现在 (${Math.round(ex)}, ${Math.round(ey)})！拾取可提升伤害和攻击范围`, 'system');
        break;
      }
    }
    this.renderState();
  }

  /**
   * Check if a tank triggers any active random events
   */
  checkRandomEvents(tank) {
    for (const event of this.randomEvents) {
      if (!event.active) continue;
      const dist = Math.sqrt((tank.x - event.x) ** 2 + (tank.y - event.y) ** 2);
      const icon = tank.id === 'red' ? '🔴' : tank.id === 'blue' ? '🔵' : tank.id === 'green' ? '🟢' : '🟣';

      // Poison cloud: tick damage every time tank is inside (don't deactivate)
      if (event.type === 'poison') {
        if (dist <= event.radius) {
          tank.takeDamage(8);
          this.log(`☠️ ${icon} ${tank.name} 在毒雾中！(-8HP → ${tank.hp}HP)`, 'damage');
          this.renderer.addExplosion(tank.x, tank.y, 10);
          if (!tank.alive) { this.endGame(tank.id === 'red' ? 'blue' : 'red'); return true; }
        }
        continue; // poison handled separately, don't fall through
      }

      if (dist <= event.radius + tank.size / 2) {
        event.active = false;
        if (event.type === 'supply') {
          const heal = Math.min(30, tank.maxHp - tank.hp);
          tank.hp += heal;
          this.log(`📦 ${icon} ${tank.name} 拾取补给箱！(+${heal}HP → ${tank.hp}HP)`, tank.id);
          this.renderer.addExplosion(tank.x, tank.y, 15);
        } else if (event.type === 'mine') {
          tank.takeDamage(25);
          this.log(`💣 ${icon} ${tank.name} 踩中地雷！(-25HP → ${tank.hp}HP)`, 'damage');
          this.renderer.addExplosion(tank.x, tank.y, 25);
          if (!tank.alive) { this.endGame(tank.id === 'red' ? 'blue' : 'red'); return true; }
        } else if (event.type === 'shield') {
          tank.shielded = true;
          this.log(`🛡️ ${icon} ${tank.name} 获得护盾！下次受击免疫伤害`, tank.id);
          this.renderer.addExplosion(tank.x, tank.y, 15);
        } else if (event.type === 'boost') {
          tank.boostTurns = 2;
          this.log(`⚡ ${icon} ${tank.name} 获得加速！接下来 2 回合移动距离翻倍`, tank.id);
          this.renderer.addExplosion(tank.x, tank.y, 15);
        } else if (event.type === 'ammo') {
          tank.ammo += 3;
          this.log(`🔫 ${icon} ${tank.name} 拾取弹药！(+3发 → 共${tank.ammo}发)`, tank.id);
          this.renderer.addExplosion(tank.x, tank.y, 15);
        } else if (event.type === 'missile') {
          tank.missiles += 1;
          this.log(`🚀 ${icon} ${tank.name} 获得导弹！(+1枚 → 共${tank.missiles}枚，可穿透建筑物)`, tank.id);
          this.renderer.addExplosion(tank.x, tank.y, 18);
        } else if (event.type === 'weapon_upgrade') {
          tank.weaponLevel++;
          const dmgMult = Math.pow(2, tank.weaponLevel);
          this.log(`⬆️ ${icon} ${tank.name} 武器升级！(Lv${tank.weaponLevel} → 伤害${dmgMult}倍，攻击范围增大)`, tank.id);
          this.renderer.addExplosion(tank.x, tank.y, 20);
        }
      }
    }
    // Clean up inactive pickup events
    this.randomEvents = this.randomEvents.filter(e => e.active);
    return false;
  }

  /**
   * Tick poison clouds once per round (called at end of each round)
   */
  tickPoisonEvents() {
    for (const event of this.randomEvents) {
      if (event.type === 'poison' && event.active) {
        event.rounds--;
        if (event.rounds <= 0) {
          event.active = false;
          this.log(`☠️ 毒雾消散`, 'system');
        }
      }
    }
    this.randomEvents = this.randomEvents.filter(e => e.active);
  }

  async executeAction(playerId, decision) {
    if (this.gameOver) return;

    const tank = playerId === 'red' ? this.tankRed
               : playerId === 'blue' ? this.tankBlue
               : playerId === 'green' ? this.tankGreen
               : this.tankPurple;
    const icon = playerId === 'red' ? '🔴' : playerId === 'blue' ? '🔵' : playerId === 'green' ? '🟢' : '🟣';

    const action = decision.action;
    let actionDesc = '';
    let didMove = false;

    switch (action) {
      case 'move_forward':
        const fwd = tank.moveForward(this.map);
        if (fwd) {
          const tInfo = TERRAIN_TYPES[tank.currentTerrain];
          const tLabel = tInfo ? tInfo.label : '';
          const tNote = tank.currentTerrain !== 'floor' ? ` [${tLabel}]` : '';
          actionDesc = `前进${tNote}`;
        } else {
          const rad = tank.angle * Math.PI / 180;
          const destT = this.map.getTerrainForRect(
            tank.x + Math.cos(rad) * CONST.MOVE_DISTANCE,
            tank.y + Math.sin(rad) * CONST.MOVE_DISTANCE,
            tank.size, tank.size
          );
          actionDesc = destT === 'water' ? '前进(河流阻挡)' : '前进(被阻挡)';
        }
        didMove = fwd;
        break;
      case 'move_backward':
        const bwd = tank.moveBackward(this.map);
        if (bwd) {
          const tInfo2 = TERRAIN_TYPES[tank.currentTerrain];
          const tLabel2 = tInfo2 ? tInfo2.label : '';
          const tNote2 = tank.currentTerrain !== 'floor' ? ` [${tLabel2}]` : '';
          actionDesc = `后退${tNote2}`;
        } else {
          const rad2 = tank.angle * Math.PI / 180;
          const destT2 = this.map.getTerrainForRect(
            tank.x - Math.cos(rad2) * CONST.MOVE_DISTANCE,
            tank.y - Math.sin(rad2) * CONST.MOVE_DISTANCE,
            tank.size, tank.size
          );
          actionDesc = destT2 === 'water' ? '后退(河流阻挡)' : '后退(被阻挡)';
        }
        didMove = bwd;
        break;
      case 'rotate_left':
        tank.rotateLeft();
        actionDesc = `左转 → ${tank.angle}°`;
        break;
      case 'rotate_right':
        tank.rotateRight();
        actionDesc = `右转 → ${tank.angle}°`;
        break;
      case 'fire':
        const bullet = tank.fire();
        if (bullet) {
          actionDesc = '开火！';
          const result = bullet.simulate(this.map, this.aliveTanks);
          this.renderState();
          await this.animateBulletTrail(result.trail, playerId);

          if (result.hit) {
            // Apply distance-based damage multiplier
            const dmgMult = result.damageMultiplier || 1;
            const finalDmg = Math.round(bullet.damage * dmgMult);
            const rangeLabel = dmgMult >= 1.3 ? '最佳距离' : dmgMult >= 0.9 ? '中距离' : dmgMult >= 0.5 ? '偏远' : '极端距离';
            result.hit.takeDamage(finalDmg);
            tank.shotsHit++;
            tank.damageDealt += finalDmg;
            this.renderer.addExplosion(result.hit.x, result.hit.y, 25);
            const targetIcon = result.hit.id === 'red' ? '🔴' : result.hit.id === 'blue' ? '🔵' : result.hit.id === 'green' ? '🟢' : '🟣';
            this.log(`💥 ${icon} ${rangeLabel}命中 ${targetIcon} ${result.hit.name}！(-${finalDmg}HP → ${result.hit.hp}HP) 剩余弹药:${tank.ammo}`, 'damage');
            if (!result.hit.alive) {
              this._checkWinCondition();
              return;
            }
          } else if (result.hitObstacle) {
            if (result.destroyed) {
              this.log(`🧱 砖墙被摧毁！剩余弹药:${tank.ammo}`, 'system');
              this.renderer.addExplosion(result.finalX, result.finalY, 15);
            } else {
              this.log(`⚡ 子弹击中钢墙 剩余弹药:${tank.ammo}`, 'system');
            }
          } else {
            this.log(`${icon} 子弹未命中 剩余弹药:${tank.ammo}`, playerId);
          }
        } else if (tank.ammo <= 0) {
          actionDesc = '开火(弹药耗尽)';
        }
        break;
      case 'fire_missile':
        const missile = tank.fireMissile();
        if (missile) {
          actionDesc = '发射导弹！🚀';
          const mResult = missile.simulate(this.map, this.aliveTanks);
          this.renderState();
          await this.animateBulletTrail(mResult.trail, playerId, true);

          if (mResult.hit) {
            // Apply distance-based damage multiplier
            const mDmgMult = mResult.damageMultiplier || 1;
            const mFinalDmg = Math.round(missile.damage * mDmgMult);
            const mRangeLabel = mDmgMult >= 1.3 ? '最佳距离' : mDmgMult >= 0.9 ? '中距离' : mDmgMult >= 0.5 ? '偏远' : '极端距离';
            mResult.hit.takeDamage(mFinalDmg);
            tank.shotsHit++;
            tank.damageDealt += mFinalDmg;
            this.renderer.addExplosion(mResult.hit.x, mResult.hit.y, 35);
            const targetIcon = mResult.hit.id === 'red' ? '🔴' : mResult.hit.id === 'blue' ? '🔵' : mResult.hit.id === 'green' ? '🟢' : '🟣';
            this.log(`🚀💥 ${icon} 导弹${mRangeLabel}命中 ${targetIcon} ${mResult.hit.name}！(-${mFinalDmg}HP → ${mResult.hit.hp}HP) 剩余导弹:${tank.missiles}`, 'damage');
            if (!mResult.hit.alive) {
              this._checkWinCondition();
              return;
            }
          } else {
            this.log(`🚀 ${icon} 导弹未命中 剩余导弹:${tank.missiles}`, playerId);
          }
        } else if (tank.missiles <= 0) {
          actionDesc = '发射导弹(无导弹)';
        }
        break;
      case 'wait':
      default:
        actionDesc = '(等待→强制移动)';
        break;
    }

    // ── Mandatory move rule ──
    if (!didMove) {
      const forcedDesc = this.forceMoveAction(tank);
      this.log(`⚠️ ${icon} ${tank.name} 强制移动：${forcedDesc}`, 'system');
      actionDesc = actionDesc ? `${actionDesc} + ${forcedDesc}` : forcedDesc;
      didMove = true;
    }

    // ── Forced fire rule: must fire at least once every 3 rounds ──
    if (tank.roundsSinceLastFire >= CONST.FORCE_FIRE_INTERVAL && action !== 'fire' && action !== 'fire_missile') {
      // Force fire if possible
      if (tank.canFire()) {
        const forcedBullet = tank.fire();
        if (forcedBullet) {
          this.log(`🔥 ${icon} ${tank.name} 强制开火！(已${CONST.FORCE_FIRE_INTERVAL}回合未开火)`, 'system');
          const fResult = forcedBullet.simulate(this.map, this.aliveTanks);
          this.renderState();
          await this.animateBulletTrail(fResult.trail, playerId);
          if (fResult.hit) {
            const fDmgMult = fResult.damageMultiplier || 1;
            const fFinalDmg = Math.round(forcedBullet.damage * fDmgMult);
            fResult.hit.takeDamage(fFinalDmg);
            tank.shotsHit++;
            tank.damageDealt += fFinalDmg;
            this.renderer.addExplosion(fResult.hit.x, fResult.hit.y, 25);
            const tgtIcon = fResult.hit.id === 'red' ? '🔴' : fResult.hit.id === 'blue' ? '🔵' : fResult.hit.id === 'green' ? '🟢' : '🟣';
            this.log(`💥 ${icon} 强制开火命中 ${tgtIcon} ${fResult.hit.name}！(-${fFinalDmg}HP → ${fResult.hit.hp}HP)`, 'damage');
            if (!fResult.hit.alive) {
              this._checkWinCondition();
              if (this.gameOver) return;
            }
          } else {
            this.log(`${icon} 强制开火未命中 剩余弹药:${tank.ammo}`, playerId);
          }
        }
      } else if (tank.canFireMissile()) {
        const forcedMissile = tank.fireMissile();
        if (forcedMissile) {
          this.log(`🔥 ${icon} ${tank.name} 强制发射导弹！(已${CONST.FORCE_FIRE_INTERVAL}回合未开火)`, 'system');
          const fmResult = forcedMissile.simulate(this.map, this.aliveTanks);
          this.renderState();
          await this.animateBulletTrail(fmResult.trail, playerId, true);
          if (fmResult.hit) {
            const fmDmgMult = fmResult.damageMultiplier || 1;
            const fmFinalDmg = Math.round(forcedMissile.damage * fmDmgMult);
            fmResult.hit.takeDamage(fmFinalDmg);
            tank.shotsHit++;
            tank.damageDealt += fmFinalDmg;
            this.renderer.addExplosion(fmResult.hit.x, fmResult.hit.y, 35);
            const tgtIcon = fmResult.hit.id === 'red' ? '🔴' : fmResult.hit.id === 'blue' ? '🔵' : fmResult.hit.id === 'green' ? '🟢' : '🟣';
            this.log(`🚀💥 ${icon} 强制导弹命中 ${tgtIcon} ${fmResult.hit.name}！(-${fmFinalDmg}HP → ${fmResult.hit.hp}HP)`, 'damage');
            if (!fmResult.hit.alive) {
              this._checkWinCondition();
              if (this.gameOver) return;
            }
          } else {
            this.log(`🚀 ${icon} 强制导弹未命中 剩余导弹:${tank.missiles}`, playerId);
          }
        }
      } else {
        this.log(`⚠️ ${icon} ${tank.name} 已${CONST.FORCE_FIRE_INTERVAL}回合未开火，但无弹药可用！`, 'system');
      }
    }

    // Check random events after movement
    if (didMove) {
      const died = this.checkRandomEvents(tank);
      if (died) return;
    }

    // After each action, check win condition
    this._checkWinCondition();
    if (this.gameOver) return;

    const thoughtNote = decision.thought ? ` 💭${decision.thought.substring(0, 50)}` : '';
    this.log(`${icon} ${tank.name}: ${actionDesc}${thoughtNote}`, playerId);

    this.history.push({
      round: this.round,
      player: playerId,
      action,
      thought: decision.thought,
      tankState: tank.getState(),
    });

    this.renderState();
  }

  buildGameState(playerId) {
    const me = playerId === 'red' ? this.tankRed
             : playerId === 'blue' ? this.tankBlue
             : playerId === 'green' ? this.tankGreen
             : this.tankPurple;
    // Nearest alive enemy
    const enemies = this.aliveTanks.filter(t => t.id !== playerId);
    const enemy = enemies.reduce((closest, t) => {
      return !closest || me.distanceTo(t.x, t.y) < me.distanceTo(closest.x, closest.y) ? t : closest;
    }, null) || (playerId === 'red' ? this.tankBlue : this.tankRed);

    const angleToEnemy = me.angleTo(enemy.x, enemy.y);
    let angleDiff = angleToEnemy - me.angle;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    const tanksMap = { [playerId]: me.getState() };
    for (const t of this.aliveTanks) {
      if (t.id !== playerId) tanksMap[t.id] = t.getState();
    }

    return {
      round: this.round,
      maxRounds: this.maxRounds,
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      tanks: tanksMap,
      obstacles: this.map.getState(),
      terrain: this.map.getTerrainState(),
      bullets: [],
      distance: Math.round(me.distanceTo(enemy.x, enemy.y)),
      angleToEnemy: Math.round(angleToEnemy),
      angleDiff: Math.round(angleDiff),
      lineOfSight: this.map.hasLineOfSight(me.x, me.y, enemy.x, enemy.y),
      myTerrain: me.currentTerrain,
      enemyTerrain: enemy.currentTerrain,
      fieldEvents: this.randomEvents.filter(e => e.active).map(e => ({
        type: e.type, x: Math.round(e.x), y: Math.round(e.y),
      })),
    };
  }

  animateBulletTrail(trail, owner) {
    return new Promise(resolve => {
      this.renderer.animateBullet(
        trail, owner, this.map,
        this.aliveTanks,
        resolve,
        this.randomEvents
      );
    });
  }

  /**
   * Check if the game should end (only one or zero tanks alive)
   */
  _checkWinCondition() {
    if (this.gameOver) return;
    const alive = this.aliveTanks;
    if (alive.length <= 1) {
      const winner = alive.length === 1 ? alive[0].id : 'draw';
      this.endGame(winner);
    }
  }

  endGame(result) {
    if (this.gameOver) return;
    this.gameOver = true;

    if (result === 'timeout') {
      const all = [this.tankRed, this.tankBlue,
        ...(this.hasThird ? [this.tankGreen] : []),
        ...(this.hasFourth ? [this.tankPurple] : []),
      ];
      const maxHp = Math.max(...all.map(t => t.hp));
      const winners = all.filter(t => t.hp === maxHp);
      this.winner = winners.length === 1 ? winners[0].id : 'draw';
      this.log('⏰ 回合用尽！', 'system');
    } else if (result === 'draw') {
      this.winner = 'draw';
      this.log('🤝 平局！', 'system');
    } else {
      this.winner = result;
      const all = [this.tankRed, this.tankBlue,
        ...(this.hasThird ? [this.tankGreen] : []),
        ...(this.hasFourth ? [this.tankPurple] : []),
      ];
      for (const t of all) {
        if (!t.alive) {
          this.renderer.addExplosion(t.x, t.y, 40);
          this.log(`💥 ${t.name} 被摧毁！`, 'system');
        }
      }
    }

    this.renderState();
    if (this.onGameOver) this.onGameOver(this.getResult());
  }

  stepOnce() {
    if (this.waitingForStep) {
      this.waitingForStep = false;
      this.nextRound();
    }
  }

  setAutoPlay(auto) {
    this.autoPlay = auto;
    if (auto && this.waitingForStep) {
      this.waitingForStep = false;
      this.nextRound();
    }
  }

  getResult() {
    const winnerName = this.winner === 'red' ? this.config.p1Name
                     : this.winner === 'blue' ? this.config.p2Name
                     : this.winner === 'green' ? this.config.p3Name
                     : this.winner === 'purple' ? this.config.p4Name
                     : '平局';
    const result = {
      winner: this.winner,
      winnerName,
      rounds: this.round,
      history: this.history,
      snapshots: this.snapshots,
      hasThird: this.hasThird,
      hasFourth: this.hasFourth,
      red: this._tankStats(this.tankRed, this.config.p1Name, this.config.p1Model),
      blue: this._tankStats(this.tankBlue, this.config.p2Name, this.config.p2Model),
    };
    if (this.hasThird) {
      result.green = this._tankStats(this.tankGreen, this.config.p3Name, this.config.p3Model);
    }
    if (this.hasFourth) {
      result.purple = this._tankStats(this.tankPurple, this.config.p4Name, this.config.p4Model);
    }
    return result;
  }

  _tankStats(tank, name, model) {
    return {
      name, model,
      hp: tank.hp, maxHp: tank.maxHp,
      shotsFired: tank.shotsFired, shotsHit: tank.shotsHit,
      accuracy: tank.shotsFired > 0 ? Math.round(tank.shotsHit / tank.shotsFired * 100) : 0,
      damageDealt: tank.damageDealt, damageTaken: tank.damageTaken,
    };
  }

  getUIState() {
    const state = {
      round: this.round, maxRounds: this.maxRounds,
      currentTurn: this.currentTurn,
      hasThird: this.hasThird,
      hasFourth: this.hasFourth,
      red: {
        hp: this.tankRed.hp, maxHp: this.tankRed.maxHp,
        shots: this.tankRed.shotsFired, hits: this.tankRed.shotsHit,
        accuracy: this.tankRed.shotsFired > 0 ? Math.round(this.tankRed.shotsHit / this.tankRed.shotsFired * 100) : 0,
        missiles: this.tankRed.missiles, weaponLevel: this.tankRed.weaponLevel,
      },
      blue: {
        hp: this.tankBlue.hp, maxHp: this.tankBlue.maxHp,
        shots: this.tankBlue.shotsFired, hits: this.tankBlue.shotsHit,
        accuracy: this.tankBlue.shotsFired > 0 ? Math.round(this.tankBlue.shotsHit / this.tankBlue.shotsFired * 100) : 0,
        missiles: this.tankBlue.missiles, weaponLevel: this.tankBlue.weaponLevel,
      },
    };
    if (this.hasThird && this.tankGreen) {
      state.green = {
        hp: this.tankGreen.hp, maxHp: this.tankGreen.maxHp,
        shots: this.tankGreen.shotsFired, hits: this.tankGreen.shotsHit,
        accuracy: this.tankGreen.shotsFired > 0 ? Math.round(this.tankGreen.shotsHit / this.tankGreen.shotsFired * 100) : 0,
        missiles: this.tankGreen.missiles, weaponLevel: this.tankGreen.weaponLevel,
      };
    }
    if (this.hasFourth && this.tankPurple) {
      state.purple = {
        hp: this.tankPurple.hp, maxHp: this.tankPurple.maxHp,
        shots: this.tankPurple.shotsFired, hits: this.tankPurple.shotsHit,
        accuracy: this.tankPurple.shotsFired > 0 ? Math.round(this.tankPurple.shotsHit / this.tankPurple.shotsFired * 100) : 0,
        missiles: this.tankPurple.missiles, weaponLevel: this.tankPurple.weaponLevel,
      };
    }
    return state;
  }

  /**
   * Save a full state snapshot for replay
   */
  _saveSnapshot() {
    const snap = {
      round: this.round,
      red: { ...this.tankRed.getState() },
      blue: { ...this.tankBlue.getState() },
      obstacles: this.map.obstacles.map(o => ({ ...o })),
      events: this.randomEvents.filter(e => e.active).map(e => ({ ...e })),
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      terrainPatches: this.map.terrainPatches ? this.map.terrainPatches.map(p => ({ ...p })) : [],
    };
    if (this.hasThird && this.tankGreen) {
      snap.green = { ...this.tankGreen.getState() };
    }
    if (this.hasFourth && this.tankPurple) {
      snap.purple = { ...this.tankPurple.getState() };
    }
    this.snapshots.push(snap);
  }

  log(msg, type) { if (this.onLog) this.onLog(msg, type); }

  delay(ms) {
    if (this._timerWorker) {
      return new Promise(r => {
        const id = ++this._timerIdCounter;
        this._timerCallbacks[id] = r;
        this._timerWorker.postMessage({ id, ms });
      });
    }
    return new Promise(r => setTimeout(r, ms));
  }
}
