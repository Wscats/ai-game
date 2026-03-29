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

    this.tankRed = new Tank('red', 60, 60, 0, CONST.COLOR_RED, config.p1Name);
    this.tankBlue = new Tank('blue', mapSize.width - 60, mapSize.height - 60, 180, CONST.COLOR_BLUE, config.p2Name);

    this.round = 0;
    this.maxRounds = config.maxRounds;
    this.currentTurn = null; // 'red' or 'blue'
    this.gameOver = false;
    this.winner = null;
    this.autoPlay = true;
    this.waitingForStep = false;
    this.history = []; // Full game history

    // Callbacks
    this.onLog = null;
    this.onUpdate = null;
    this.onGameOver = null;
    this.onTurnStart = null;
    this.onThought = null;
    this.onAIDetail = null; // NEW: callback for AI interaction details
  }

  start() {
    this.log('🎮 回合制坦克大战开始！', 'system');
    this.log(`🔴 ${this.config.p1Name} (${this.config.p1Model}) VS 🔵 ${this.config.p2Name} (${this.config.p2Model})`, 'system');
    this.renderState();
    this.nextRound();
  }

  renderState() {
    this.renderer.render({ map: this.map, tanks: [this.tankRed, this.tankBlue] });
    if (this.onUpdate) this.onUpdate(this.getUIState());
  }

  async nextRound() {
    if (this.gameOver) return;

    this.round++;
    if (this.round > this.maxRounds) {
      this.endGame('timeout');
      return;
    }

    this.log(`━━━ 第 ${this.round} 回合 ━━━`, 'system');

    // Tick cooldowns
    this.tankRed.tickCooldown();
    this.tankBlue.tickCooldown();

    // Parallel AI requests for both players
    if (this.onTurnStart) this.onTurnStart('both');
    if (this.onThought) {
      this.onThought('red', '🤔 思考中...');
      this.onThought('blue', '🤔 思考中...');
    }

    const gameStateRed = this.buildGameState('red');
    const gameStateBlue = this.buildGameState('blue');

    let redDecision, blueDecision;

    try {
      const response = await fetch('/api/ai-decision-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { model: this.config.p1Model, gameState: gameStateRed, playerId: 'red' },
            { model: this.config.p2Model, gameState: gameStateBlue, playerId: 'blue' },
          ],
        }),
      });
      const data = await response.json();

      for (const r of data.results) {
        if (r.playerId === 'red') {
          redDecision = r.decision;
          if (this.onThought) this.onThought('red', redDecision.thought || '...');
          if (this.onAIDetail) this.onAIDetail('red', r.detail);
        } else {
          blueDecision = r.decision;
          if (this.onThought) this.onThought('blue', blueDecision.thought || '...');
          if (this.onAIDetail) this.onAIDetail('blue', r.detail);
        }
      }
    } catch (err) {
      console.error('Batch AI request failed:', err);
      redDecision = { action: 'wait', thought: '[网络错误]' };
      blueDecision = { action: 'wait', thought: '[网络错误]' };
      if (this.onThought) {
        this.onThought('red', '[请求失败]');
        this.onThought('blue', '[请求失败]');
      }
    }

    if (!redDecision) redDecision = { action: 'wait', thought: '[无响应]' };
    if (!blueDecision) blueDecision = { action: 'wait', thought: '[无响应]' };

    // Execute red turn
    this.currentTurn = 'red';
    await this.executeAction('red', redDecision);
    if (this.gameOver) return;

    // Small delay between turns
    await this.delay(200);

    // Execute blue turn
    this.currentTurn = 'blue';
    await this.executeAction('blue', blueDecision);
    if (this.gameOver) return;

    this.renderState();

    // Auto-play or wait for step
    if (this.autoPlay) {
      await this.delay(300);
      this.nextRound();
    } else {
      this.waitingForStep = true;
    }
  }

  async executeAction(playerId, decision) {
    if (this.gameOver) return;

    const tank = playerId === 'red' ? this.tankRed : this.tankBlue;
    const icon = playerId === 'red' ? '🔴' : '🔵';

    const action = decision.action;
    let actionDesc = '';

    switch (action) {
      case 'move_forward':
        const fwd = tank.moveForward(this.map);
        actionDesc = fwd ? '前进' : '前进(被阻挡)';
        break;
      case 'move_backward':
        const bwd = tank.moveBackward(this.map);
        actionDesc = bwd ? '后退' : '后退(被阻挡)';
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
          const result = bullet.simulate(this.map, [this.tankRed, this.tankBlue]);
          this.renderState();
          await this.animateBulletTrail(result.trail, playerId);

          if (result.hit) {
            result.hit.takeDamage(bullet.damage);
            tank.shotsHit++;
            tank.damageDealt += bullet.damage;
            this.renderer.addExplosion(result.hit.x, result.hit.y, 25);
            const targetIcon = result.hit.id === 'red' ? '🔴' : '🔵';
            this.log(`💥 ${icon} 命中 ${targetIcon} ${result.hit.name}！(-${bullet.damage}HP → ${result.hit.hp}HP)`, 'damage');
            if (!result.hit.alive) {
              this.endGame(playerId);
              return;
            }
          } else if (result.hitObstacle) {
            if (result.destroyed) {
              this.log(`🧱 砖墙被摧毁！`, 'system');
              this.renderer.addExplosion(result.finalX, result.finalY, 15);
            } else {
              this.log(`⚡ 子弹击中钢墙`, 'system');
            }
          } else {
            this.log(`${icon} 子弹未命中`, playerId);
          }
        } else {
          actionDesc = '开火(冷却中)';
        }
        break;
      case 'wait':
      default:
        actionDesc = '等待';
        break;
    }

    this.log(`${icon} ${tank.name}: ${actionDesc}`, playerId);

    // Record history
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
    const me = playerId === 'red' ? this.tankRed : this.tankBlue;
    const enemy = playerId === 'red' ? this.tankBlue : this.tankRed;
    const angleToEnemy = me.angleTo(enemy.x, enemy.y);
    let angleDiff = angleToEnemy - me.angle;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    return {
      round: this.round,
      maxRounds: this.maxRounds,
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      tanks: {
        [playerId]: me.getState(),
        [playerId === 'red' ? 'blue' : 'red']: enemy.getState(),
      },
      obstacles: this.map.getState(),
      bullets: [],
      distance: Math.round(me.distanceTo(enemy.x, enemy.y)),
      angleToEnemy: Math.round(angleToEnemy),
      angleDiff: Math.round(angleDiff),
      lineOfSight: this.map.hasLineOfSight(me.x, me.y, enemy.x, enemy.y),
    };
  }

  animateBulletTrail(trail, owner) {
    return new Promise(resolve => {
      this.renderer.animateBullet(
        trail, owner, this.map,
        [this.tankRed, this.tankBlue],
        resolve
      );
    });
  }

  endGame(result) {
    if (this.gameOver) return;
    this.gameOver = true;

    if (result === 'timeout') {
      if (this.tankRed.hp > this.tankBlue.hp) this.winner = 'red';
      else if (this.tankBlue.hp > this.tankRed.hp) this.winner = 'blue';
      else this.winner = 'draw';
      this.log('⏰ 回合用尽！', 'system');
    } else {
      this.winner = result;
      const loser = result === 'red' ? this.tankBlue : this.tankRed;
      this.renderer.addExplosion(loser.x, loser.y, 40);
      this.log(`💥 ${loser.name} 被摧毁！`, 'system');
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
    return {
      winner: this.winner,
      winnerName: this.winner === 'red' ? this.config.p1Name :
                  this.winner === 'blue' ? this.config.p2Name : '平局',
      rounds: this.round,
      history: this.history,
      red: this._tankStats(this.tankRed, this.config.p1Name, this.config.p1Model),
      blue: this._tankStats(this.tankBlue, this.config.p2Name, this.config.p2Model),
    };
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
    return {
      round: this.round, maxRounds: this.maxRounds,
      currentTurn: this.currentTurn,
      red: {
        hp: this.tankRed.hp, maxHp: this.tankRed.maxHp,
        shots: this.tankRed.shotsFired, hits: this.tankRed.shotsHit,
        accuracy: this.tankRed.shotsFired > 0 ? Math.round(this.tankRed.shotsHit / this.tankRed.shotsFired * 100) : 0,
      },
      blue: {
        hp: this.tankBlue.hp, maxHp: this.tankBlue.maxHp,
        shots: this.tankBlue.shotsFired, hits: this.tankBlue.shotsHit,
        accuracy: this.tankBlue.shotsFired > 0 ? Math.round(this.tankBlue.shotsHit / this.tankBlue.shotsFired * 100) : 0,
      },
    };
  }

  log(msg, type) { if (this.onLog) this.onLog(msg, type); }

  delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
