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

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    // Let CSS handle display scaling within the container
    this.canvas.style.maxWidth = '100%';
    this.canvas.style.maxHeight = '100%';
    this.canvas.style.width = 'auto';
    this.canvas.style.height = 'auto';
  }

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

    // Terrain patches (drawn below obstacles)
    if (map.terrainPatches) {
      for (const patch of map.terrainPatches) {
        const info = TERRAIN_TYPES[patch.type];
        if (!info || !info.color) continue;
        ctx.fillStyle = info.color;
        ctx.fillRect(patch.x, patch.y, patch.width, patch.height);

        // Decorative details per terrain type
        if (patch.type === 'forest') {
          // Draw small tree dots
          ctx.fillStyle = 'rgba(0,100,0,0.5)';
          for (let tx = patch.x + 10; tx < patch.x + patch.width - 10; tx += 18) {
            for (let ty = patch.y + 10; ty < patch.y + patch.height - 10; ty += 18) {
              ctx.beginPath();
              ctx.arc(tx + Math.sin(tx * ty) * 4, ty + Math.cos(tx + ty) * 4, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          // Border
          ctx.strokeStyle = 'rgba(0,120,0,0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(patch.x, patch.y, patch.width, patch.height);
        } else if (patch.type === 'water') {
          // Wave lines
          ctx.strokeStyle = 'rgba(100,180,255,0.5)';
          ctx.lineWidth = 1;
          for (let wy = patch.y + 8; wy < patch.y + patch.height; wy += 10) {
            ctx.beginPath();
            for (let wx = patch.x; wx < patch.x + patch.width; wx += 6) {
              const waveY = wy + Math.sin((wx + Date.now() / 500) * 0.5) * 2;
              wx === patch.x ? ctx.moveTo(wx, waveY) : ctx.lineTo(wx, waveY);
            }
            ctx.stroke();
          }
          // Border
          ctx.strokeStyle = 'rgba(30,100,220,0.7)';
          ctx.lineWidth = 2;
          ctx.strokeRect(patch.x, patch.y, patch.width, patch.height);
        } else if (patch.type === 'snow') {
          // Snowflake dots
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          for (let sx = patch.x + 8; sx < patch.x + patch.width - 8; sx += 14) {
            for (let sy = patch.y + 8; sy < patch.y + patch.height - 8; sy += 14) {
              ctx.beginPath();
              ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          // Border
          ctx.strokeStyle = 'rgba(180,220,255,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(patch.x, patch.y, patch.width, patch.height);
        }

        // Terrain label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const info2 = TERRAIN_TYPES[patch.type];
        ctx.fillText(info2 ? info2.label : patch.type, patch.x + 3, patch.y + 3);
        ctx.restore();
      }
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
        } else if (ev.type === 'shield') {
          // Blue shield orb
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(52,152,219,${pulse})`;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(52,152,219,${0.8 * pulse})`;
          ctx.fill();
          ctx.strokeStyle = '#2980b9';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🛡️', 0, 1);
          ctx.restore();
        } else if (ev.type === 'boost') {
          // Yellow lightning orb
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(241,196,15,${pulse})`;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(241,196,15,${0.85 * pulse})`;
          ctx.fill();
          ctx.strokeStyle = '#f39c12';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', 0, 1);
          ctx.restore();
        } else if (ev.type === 'poison') {
          // Purple poison cloud
          ctx.save();
          ctx.translate(ev.x, ev.y);
          const r = ev.radius || 55;
          const grad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
          grad.addColorStop(0, `rgba(155,89,182,${0.55 * pulse})`);
          grad.addColorStop(1, `rgba(155,89,182,0)`);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = `rgba(142,68,173,${0.5 * pulse})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(255,255,255,${0.7 * pulse})`;
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('☠️', 0, 0);
          ctx.restore();
        } else if (ev.type === 'ammo') {
          // Orange ammo pack
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(230,126,34,${pulse})`;
          ctx.shadowBlur = 14;
          ctx.fillStyle = `rgba(230,126,34,${0.85 * pulse})`;
          ctx.fillRect(-12, -12, 24, 24);
          ctx.strokeStyle = '#e67e22';
          ctx.lineWidth = 2;
          ctx.strokeRect(-12, -12, 24, 24);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔫', 0, 1);
          ctx.restore();
        } else if (ev.type === 'missile') {
          // Red-orange missile pickup
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(255,69,0,${pulse})`;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,69,0,${0.85 * pulse})`;
          ctx.fill();
          ctx.strokeStyle = '#ff4500';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🚀', 0, 1);
          ctx.restore();
        } else if (ev.type === 'weapon_upgrade') {
          // Golden weapon upgrade pickup
          ctx.save();
          ctx.translate(ev.x, ev.y);
          ctx.shadowColor = `rgba(255,215,0,${pulse})`;
          ctx.shadowBlur = 18;
          // Diamond shape
          ctx.beginPath();
          ctx.moveTo(0, -15);
          ctx.lineTo(13, 0);
          ctx.lineTo(0, 15);
          ctx.lineTo(-13, 0);
          ctx.closePath();
          ctx.fillStyle = `rgba(255,215,0,${0.9 * pulse})`;
          ctx.fill();
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⬆', 0, 0);
          ctx.restore();
        }
      }
    }

    // Tank movement trails (for replay)
    if (state.redTrail && state.redTrail.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(state.redTrail[0].x, state.redTrail[0].y);
      for (let i = 1; i < state.redTrail.length; i++) {
        ctx.lineTo(state.redTrail[i].x, state.redTrail[i].y);
      }
      ctx.strokeStyle = 'rgba(231,76,60,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Draw dots at each waypoint
      for (let i = 0; i < state.redTrail.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(state.redTrail[i].x, state.redTrail[i].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(231,76,60,0.5)';
        ctx.fill();
      }
      ctx.restore();
    }
    if (state.blueTrail && state.blueTrail.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(state.blueTrail[0].x, state.blueTrail[0].y);
      for (let i = 1; i < state.blueTrail.length; i++) {
        ctx.lineTo(state.blueTrail[i].x, state.blueTrail[i].y);
      }
      ctx.strokeStyle = 'rgba(52,152,219,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Draw dots at each waypoint
      for (let i = 0; i < state.blueTrail.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(state.blueTrail[i].x, state.blueTrail[i].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52,152,219,0.5)';
        ctx.fill();
      }
      ctx.restore();
    }

    // Bullet trails
    for (const bt of this.bulletTrails) {
      if (bt.trail.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
      for (let i = 1; i < bt.trail.length; i++) {
        ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
      }
      ctx.strokeStyle = bt.owner === 'red' ? 'rgba(255,107,107,0.5)'
                      : bt.owner === 'blue' ? 'rgba(116,185,255,0.5)'
                      : bt.owner === 'green' ? 'rgba(88,255,160,0.5)'
                      : 'rgba(200,140,255,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bullet head
      const last = bt.trail[bt.trail.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = bt.owner === 'red' ? CONST.COLOR_BULLET_RED
                    : bt.owner === 'blue' ? CONST.COLOR_BULLET_BLUE
                    : bt.owner === 'green' ? CONST.COLOR_GREEN
                    : CONST.COLOR_PURPLE;
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

    // Tanks (forest tanks drawn semi-transparent to simulate hiding)
    for (const tank of tanks) {
      if (!tank.alive) continue;
      ctx.save();
      if (tank.currentTerrain === 'forest') ctx.globalAlpha = 0.45;
      this._drawTank(ctx, tank);
      // Shield aura
      if (tank.shielded) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(tank.x, tank.y, tank.size / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(52,152,219,${0.6 + 0.4 * Math.sin(Date.now() / 200)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // Boost aura
      if (tank.boostTurns > 0) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(tank.x, tank.y, tank.size / 2 + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(241,196,15,${0.5 + 0.5 * Math.sin(Date.now() / 150)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Weapon upgrade aura (golden glow per level)
      if (tank.weaponLevel > 0) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(tank.x, tank.y, tank.size / 2 + 3, 0, Math.PI * 2);
        const wPulse = 0.4 + 0.3 * Math.sin(Date.now() / 250);
        ctx.strokeStyle = `rgba(255,215,0,${wPulse * Math.min(tank.weaponLevel, 3) / 3})`;
        ctx.lineWidth = 1 + tank.weaponLevel;
        ctx.stroke();
      }
      ctx.restore();
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

    // Determine colors by player id
    const colorMap = {
      red:    { dark: CONST.COLOR_RED_DARK,    main: CONST.COLOR_RED,    barrel: '#ff8888' },
      blue:   { dark: CONST.COLOR_BLUE_DARK,   main: CONST.COLOR_BLUE,   barrel: '#88bbff' },
      green:  { dark: CONST.COLOR_GREEN_DARK,  main: CONST.COLOR_GREEN,  barrel: '#88ffaa' },
      purple: { dark: CONST.COLOR_PURPLE_DARK, main: CONST.COLOR_PURPLE, barrel: '#cc88ff' },
    };
    const colors = colorMap[tank.id] || colorMap.blue;

    // Body
    ctx.fillStyle = colors.dark;
    ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4);
    // Turret
    ctx.fillStyle = colors.main;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
    // Barrel
    ctx.fillStyle = colors.barrel;
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

    // Ammo count
    if (tank.ammo !== undefined) {
      ctx.fillStyle = tank.ammo <= 0 ? '#e74c3c' : tank.ammo <= 1 ? '#f39c12' : '#f1c40f';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let ammoStr = '🔫'.repeat(Math.min(tank.ammo, 5)) || '∅';
      if (tank.missiles > 0) ammoStr += ' 🚀' + tank.missiles;
      ctx.fillText(ammoStr, tank.x, barY - 1);
    }

    // Weapon level indicator
    if (tank.weaponLevel > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`⬆Lv${tank.weaponLevel}`, tank.x, barY - (tank.ammo !== undefined ? 11 : 1));
    }

    // Name
    ctx.fillStyle = colors.main;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const nameOffset = tank.ammo !== undefined ? 11 : 3;
    const extraOffset = tank.weaponLevel > 0 ? 10 : 0;
    ctx.fillText(tank.name, tank.x, barY - nameOffset - extraOffset);
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
