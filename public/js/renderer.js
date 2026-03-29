/**
 * renderer.js - Canvas rendering for turn-based tank battle
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bulletTrails = [];
    this.explosions = [];
    this.animating = false;
  }

  resize(w, h) { this.canvas.width = w; this.canvas.height = h; }

  render(state) {
    const { map, tanks, events } = state;
    const ctx = this.ctx;
    const W = map.width, H = map.height;

    ctx.fillStyle = CONST.COLOR_GROUND;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = CONST.COLOR_GRID;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += CONST.GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += CONST.GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Obstacles
    for (const obs of map.obstacles) {
      if (obs.type === 'brick') {
        ctx.fillStyle = '#8B4513'; ctx.strokeStyle = '#A0522D';
      } else {
        ctx.fillStyle = '#8899aa'; ctx.strokeStyle = '#aabbcc';
      }
      ctx.lineWidth = 1;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      if (obs.type === 'brick') {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5;
        for (let by = obs.y; by < obs.y + obs.height; by += 8) {
          ctx.beginPath(); ctx.moveTo(obs.x, by); ctx.lineTo(obs.x + obs.width, by); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
        ctx.moveTo(obs.x + obs.width, obs.y); ctx.lineTo(obs.x, obs.y + obs.height);
        ctx.stroke();
      }
    }

    // Random events (supply boxes and mines)
    if (events && events.length > 0) {
      for (const ev of events) {
        if (!ev.active) continue;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
        if (ev.type === 'supply') {
          // Green supply box
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(46,204,113,${pulse})`;
          ctx.shadowBlur = 12;
          ctx.fillStyle = `rgba(46,204,113,${0.85 * pulse})`;
          ctx.fillRect(-12, -12, 24, 24);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 2;
          ctx.strokeRect(-12, -12, 24, 24);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✚', 0, 0);
          ctx.restore();
        } else if (ev.type === 'mine') {
          // Red mine
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(231,76,60,${pulse})`;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(231,76,60,${0.85 * pulse})`;
          ctx.fill();
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💣', 0, 1);
          ctx.restore();
        }
      }
    }

    // Bullet trails
    for (const bt of this.bulletTrails) {
      if (bt.trail.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
      for (let i = 1; i < bt.trail.length; i++) {
        ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
      }
      ctx.strokeStyle = bt.owner === 'red' ? 'rgba(255,107,107,0.5)' : 'rgba(116,185,255,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bullet head
      const last = bt.trail[bt.trail.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = bt.owner === 'red' ? CONST.COLOR_BULLET_RED : CONST.COLOR_BULLET_BLUE;
      ctx.fill();
    }

    // Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.frame++;
      if (e.frame > e.maxFrames) { this.explosions.splice(i, 1); continue; }
      const p = e.frame / e.maxFrames;
      const r = e.size * (0.5 + p);
      const a = 1 - p;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,165,0,${a * 0.3})`; ctx.fill();
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,100,0,${a * 0.6})`; ctx.fill();
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,200,${a * 0.8})`; ctx.fill();
    }

    // Tanks
    for (const tank of tanks) {
      if (!tank.alive) continue;
      this._drawTank(ctx, tank);
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, W, H);
  }

  _drawTank(ctx, tank) {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle * Math.PI / 180);
    const s = tank.size / 2;
    const isRed = tank.id === 'red';

    // Body
    ctx.fillStyle = isRed ? CONST.COLOR_RED_DARK : CONST.COLOR_BLUE_DARK;
    ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4);
    // Turret
    ctx.fillStyle = isRed ? CONST.COLOR_RED : CONST.COLOR_BLUE;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
    // Barrel
    ctx.fillStyle = isRed ? '#ff8888' : '#88bbff';
    ctx.fillRect(0, -3, s + 5, 6);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(s + 2, -4, 5, 8);
    // Tracks
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-s, -s * 0.7, s * 2, 4);
    ctx.fillRect(-s, s * 0.7 - 4, s * 2, 4);
    ctx.restore();

    // HP bar
    const barW = tank.size * 1.2, barH = 4;
    const barX = tank.x - barW / 2, barY = tank.y - tank.size / 2 - 12;
    const hpR = tank.hp / tank.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpR < 0.3 ? '#e74c3c' : hpR < 0.6 ? '#f39c12' : '#2ecc71';
    ctx.fillRect(barX, barY, barW * hpR, barH);

    // Name
    ctx.fillStyle = isRed ? CONST.COLOR_RED : CONST.COLOR_BLUE;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tank.name, tank.x, barY - 3);
  }

  addBulletTrail(trail, owner) {
    this.bulletTrails.push({ trail, owner, time: Date.now() });
    // Remove old trails
    if (this.bulletTrails.length > 4) this.bulletTrails.shift();
  }

  addExplosion(x, y, size) {
    this.explosions.push({ x, y, size, frame: 0, maxFrames: 20 });
  }

  clearTrails() { this.bulletTrails = []; }

  /**
   * Animate bullet travel, then call callback
   */
  animateBullet(trail, owner, map, tanks, callback, events) {
    if (trail.length < 2) { callback(); return; }
    this.animating = true;
    let idx = 0;
    const step = () => {
      idx += 2;
      if (idx >= trail.length) idx = trail.length - 1;
      const partial = trail.slice(0, idx + 1);
      this.bulletTrails = [{ trail: partial, owner, time: Date.now() }];
      this.render({ map, tanks, events });
      if (idx < trail.length - 1) {
        requestAnimationFrame(step);
      } else {
        this.animating = false;
        callback();
      }
    };
    requestAnimationFrame(step);
  }
}
