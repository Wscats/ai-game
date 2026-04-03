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

    // Background with subtle radial gradient
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bgGrad.addColorStop(0, '#1e1e3a');
    bgGrad.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Grid with crosshair dots instead of full lines
    for (let x = 0; x < W; x += CONST.GRID_SIZE) {
      for (let y = 0; y < H; y += CONST.GRID_SIZE) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
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

    // Obstacles with improved visuals
    for (const obs of map.obstacles) {
      ctx.save();
      if (obs.type === 'brick') {
        // Brick wall with 3D effect
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        // Brick pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5;
        for (let by = obs.y; by < obs.y + obs.height; by += 8) {
          ctx.beginPath(); ctx.moveTo(obs.x, by); ctx.lineTo(obs.x + obs.width, by); ctx.stroke();
          const offset = (Math.floor((by - obs.y) / 8) % 2) * 15;
          for (let bx = obs.x + offset; bx < obs.x + obs.width; bx += 30) {
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + 8); ctx.stroke();
          }
        }
        // Top highlight
        const brickGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
        brickGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
        brickGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = brickGrad;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        // Border
        ctx.strokeStyle = '#A0522D'; ctx.lineWidth = 1.5;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      } else {
        // Steel wall with metallic gradient
        const steelGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
        steelGrad.addColorStop(0, '#aabbcc');
        steelGrad.addColorStop(0.5, '#8899aa');
        steelGrad.addColorStop(1, '#667788');
        ctx.fillStyle = steelGrad;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        // Cross pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
        ctx.moveTo(obs.x + obs.width, obs.y); ctx.lineTo(obs.x, obs.y + obs.height);
        ctx.stroke();
        // Rivets at corners
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        const rv = 3;
        ctx.beginPath(); ctx.arc(obs.x + rv + 2, obs.y + rv + 2, rv, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(obs.x + obs.width - rv - 2, obs.y + rv + 2, rv, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(obs.x + rv + 2, obs.y + obs.height - rv - 2, rv, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(obs.x + obs.width - rv - 2, obs.y + obs.height - rv - 2, rv, 0, Math.PI * 2); ctx.fill();
        // Border
        ctx.strokeStyle = '#99aacc'; ctx.lineWidth = 1.5;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
      ctx.restore();
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

    // Bullet trails with glow
    for (const bt of this.bulletTrails) {
      if (bt.trail.length < 2) continue;
      const trailColor = bt.owner === 'red' ? 'rgba(255,107,107,'
                       : bt.owner === 'blue' ? 'rgba(116,185,255,'
                       : bt.owner === 'green' ? 'rgba(88,255,160,'
                       : 'rgba(200,140,255,';
      // Glow trail
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
      for (let i = 1; i < bt.trail.length; i++) {
        ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
      }
      ctx.strokeStyle = trailColor + '0.2)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      // Main trail
      ctx.beginPath();
      ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
      for (let i = 1; i < bt.trail.length; i++) {
        ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
      }
      ctx.strokeStyle = trailColor + '0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bullet head with glow
      const last = bt.trail[bt.trail.length - 1];
      ctx.save();
      ctx.shadowColor = bt.owner === 'red' ? CONST.COLOR_BULLET_RED
                      : bt.owner === 'blue' ? CONST.COLOR_BULLET_BLUE
                      : bt.owner === 'green' ? CONST.COLOR_GREEN
                      : CONST.COLOR_PURPLE;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = bt.owner === 'red' ? CONST.COLOR_BULLET_RED
                    : bt.owner === 'blue' ? CONST.COLOR_BULLET_BLUE
                    : bt.owner === 'green' ? CONST.COLOR_GREEN
                    : CONST.COLOR_PURPLE;
      ctx.fill();
      // Inner bright core
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
      ctx.restore();
    }

    // Explosions with improved particles
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.frame++;
      if (e.frame > e.maxFrames) { this.explosions.splice(i, 1); continue; }
      const p = e.frame / e.maxFrames;
      const r = e.size * (0.5 + p);
      const a = 1 - p;
      // Outer glow
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,100,0,${a * 0.15})`; ctx.fill();
      // Main explosion
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,165,0,${a * 0.35})`; ctx.fill();
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,100,0,${a * 0.6})`; ctx.fill();
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,200,${a * 0.9})`; ctx.fill();
      // Spark particles
      if (!e.sparks) {
        e.sparks = [];
        for (let si = 0; si < 6; si++) {
          const sa = Math.random() * Math.PI * 2;
          e.sparks.push({ angle: sa, speed: 1 + Math.random() * 2, size: 1 + Math.random() * 2 });
        }
      }
      for (const spark of e.sparks) {
        const sx = e.x + Math.cos(spark.angle) * spark.speed * e.frame;
        const sy = e.y + Math.sin(spark.angle) * spark.speed * e.frame;
        ctx.beginPath(); ctx.arc(sx, sy, spark.size * (1 - p), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,50,${a * 0.8})`; ctx.fill();
      }
    }

    // Tanks (forest tanks drawn semi-transparent to simulate hiding)
    for (const tank of tanks) {
      if (!tank.alive) continue;
      ctx.save();
      if (tank.currentTerrain === 'forest') ctx.globalAlpha = 0.45;
      this._drawTank(ctx, tank);
      // Shield aura (from items inventory)
      const hasShield = tank.shielded || (tank.items && tank.items.some(i => i.type === 'shield'));
      if (hasShield) {
        ctx.globalAlpha = 1;
        // Hexagonal shield effect
        const shieldR = tank.size / 2 + 10;
        const shieldPulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        ctx.save();
        ctx.translate(tank.x, tank.y);
        // Outer glow
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(a) * shieldR;
          const py = Math.sin(a) * shieldR;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(52,152,219,${0.4 + 0.4 * shieldPulse})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(52,152,219,0.6)';
        ctx.shadowBlur = 10;
        ctx.stroke();
        // Inner fill
        ctx.fillStyle = `rgba(52,152,219,${0.08 + 0.06 * shieldPulse})`;
        ctx.fill();
        ctx.restore();
      }
      // Boost aura (from items inventory)
      const boostItem = tank.items && tank.items.find(i => i.type === 'boost');
      const hasBoost = tank.boostTurns > 0 || boostItem;
      if (hasBoost) {
        ctx.globalAlpha = 1;
        const boostPulse = 0.5 + 0.5 * Math.sin(Date.now() / 120);
        ctx.save();
        ctx.translate(tank.x, tank.y);
        // Speed lines radiating outward
        const boostR = tank.size / 2 + 6;
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i + Date.now() / 500;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (boostR - 3), Math.sin(a) * (boostR - 3));
          ctx.lineTo(Math.cos(a) * (boostR + 5), Math.sin(a) * (boostR + 5));
          ctx.strokeStyle = `rgba(241,196,15,${0.4 + 0.4 * boostPulse})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Dashed circle
        ctx.beginPath();
        ctx.arc(0, 0, boostR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(241,196,15,${0.3 + 0.3 * boostPulse})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // Weapon upgrade aura (from items inventory)
      const hasWeaponUp = tank.weaponLevel > 0 || (tank.items && tank.items.some(i => i.type === 'weapon_upgrade'));
      if (hasWeaponUp) {
        ctx.globalAlpha = 1;
        const wPulse = 0.4 + 0.3 * Math.sin(Date.now() / 250);
        const wLevel = tank.weaponLevel || 1;
        ctx.save();
        ctx.translate(tank.x, tank.y);
        // Rotating star pattern
        const starR = tank.size / 2 + 4;
        const rotation = Date.now() / 2000;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i + rotation;
          const px = Math.cos(a) * starR;
          const py = Math.sin(a) * starR;
          ctx.moveTo(px - 2, py - 2);
          ctx.lineTo(px + 2, py + 2);
          ctx.moveTo(px + 2, py - 2);
          ctx.lineTo(px - 2, py + 2);
        }
        ctx.strokeStyle = `rgba(255,215,0,${wPulse * Math.min(wLevel, 3) / 3})`;
        ctx.lineWidth = 1.5 + wLevel * 0.5;
        ctx.stroke();
        // Glow ring
        ctx.beginPath();
        ctx.arc(0, 0, starR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,215,0,${wPulse * 0.3 * Math.min(wLevel, 3) / 3})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ── Draw held items icons below the tank ──
      if (tank.items && tank.items.length > 0) {
        ctx.globalAlpha = 1;
        const itemY = tank.y + tank.size / 2 + 10;
        const totalW = tank.items.length * 18;
        const startX = tank.x - totalW / 2 + 9;
        for (let ii = 0; ii < tank.items.length; ii++) {
          const item = tank.items[ii];
          const ix = startX + ii * 18;
          const iy = itemY;
          const itemPulse = 0.7 + 0.3 * Math.sin(Date.now() / 300 + ii);

          // Item slot background
          ctx.fillStyle = `rgba(0,0,0,${0.5 * itemPulse})`;
          ctx.beginPath();
          ctx.roundRect(ix - 8, iy - 8, 16, 16, 3);
          ctx.fill();

          // Item-specific icon and border color
          let borderColor, emoji;
          if (item.type === 'shield') {
            borderColor = `rgba(52,152,219,${0.7 * itemPulse})`;
            emoji = '🛡';
          } else if (item.type === 'boost') {
            borderColor = `rgba(241,196,15,${0.7 * itemPulse})`;
            emoji = '⚡';
          } else if (item.type === 'weapon_upgrade') {
            borderColor = `rgba(255,215,0,${0.7 * itemPulse})`;
            emoji = '⬆';
          } else {
            borderColor = `rgba(255,255,255,${0.5 * itemPulse})`;
            emoji = '?';
          }

          // Border glow
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(ix - 8, iy - 8, 16, 16, 3);
          ctx.stroke();

          // Emoji icon
          ctx.fillStyle = '#fff';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, ix, iy);

          // Boost turns remaining indicator
          if (item.type === 'boost' && item.turns) {
            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(item.turns.toString(), ix + 8, iy - 8);
          }
        }
      }

      ctx.restore();
    }

    // Border with glow effect
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255,215,0,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();
    // Inner border
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, W - 8, H - 8);
  }

  _drawTank(ctx, tank) {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle * Math.PI / 180);
    const s = tank.size / 2;

    // Determine colors by player id
    const colorMap = {
      red:    { dark: CONST.COLOR_RED_DARK,    main: CONST.COLOR_RED,    barrel: '#ff8888', glow: 'rgba(231,76,60,0.4)', light: '#ffaaaa' },
      blue:   { dark: CONST.COLOR_BLUE_DARK,   main: CONST.COLOR_BLUE,   barrel: '#88bbff', glow: 'rgba(52,152,219,0.4)', light: '#aaddff' },
      green:  { dark: CONST.COLOR_GREEN_DARK,  main: CONST.COLOR_GREEN,  barrel: '#88ffaa', glow: 'rgba(46,204,113,0.4)', light: '#aaffcc' },
      purple: { dark: CONST.COLOR_PURPLE_DARK, main: CONST.COLOR_PURPLE, barrel: '#cc88ff', glow: 'rgba(155,89,182,0.4)', light: '#ddaaff' },
    };
    const colors = colorMap[tank.id] || colorMap.blue;

    // Ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, s * 0.9, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tank body with rounded corners
    const bw = s * 2, bh = s * 1.4;
    const br = 4; // corner radius
    ctx.fillStyle = colors.dark;
    ctx.beginPath();
    ctx.moveTo(-s + br, -s * 0.7);
    ctx.lineTo(s - br, -s * 0.7);
    ctx.quadraticCurveTo(s, -s * 0.7, s, -s * 0.7 + br);
    ctx.lineTo(s, s * 0.7 - br);
    ctx.quadraticCurveTo(s, s * 0.7, s - br, s * 0.7);
    ctx.lineTo(-s + br, s * 0.7);
    ctx.quadraticCurveTo(-s, s * 0.7, -s, s * 0.7 - br);
    ctx.lineTo(-s, -s * 0.7 + br);
    ctx.quadraticCurveTo(-s, -s * 0.7, -s + br, -s * 0.7);
    ctx.closePath();
    ctx.fill();

    // Body top highlight
    const bodyGrad = ctx.createLinearGradient(0, -s * 0.7, 0, s * 0.7);
    bodyGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
    bodyGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
    bodyGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Tracks with tread pattern
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-s, -s * 0.7, s * 2, 5);
    ctx.fillRect(-s, s * 0.7 - 5, s * 2, 5);
    // Tread marks
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let tx = -s + 3; tx < s; tx += 5) {
      ctx.beginPath(); ctx.moveTo(tx, -s * 0.7); ctx.lineTo(tx, -s * 0.7 + 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, s * 0.7 - 5); ctx.lineTo(tx, s * 0.7); ctx.stroke();
    }

    // Turret with gradient
    const turretGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, s * 0.55);
    turretGrad.addColorStop(0, colors.light || colors.main);
    turretGrad.addColorStop(1, colors.main);
    ctx.fillStyle = turretGrad;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
    // Turret ring
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Barrel with gradient
    const barrelGrad = ctx.createLinearGradient(0, -4, 0, 4);
    barrelGrad.addColorStop(0, colors.barrel);
    barrelGrad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    barrelGrad.addColorStop(1, colors.barrel);
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(s * 0.3, -3.5, s * 0.8 + 5, 7);
    // Barrel muzzle
    ctx.fillStyle = '#ddd';
    ctx.fillRect(s + 2, -4.5, 6, 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(s + 2, -4.5, 6, 9);

    // Turret center dot
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // ── UI elements drawn in world space (not rotated) ──

    // Direction indicator arrow (small triangle pointing forward)
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle * Math.PI / 180);
    const arrowDist = s + 14;
    ctx.fillStyle = colors.glow || 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(arrowDist + 6, 0);
    ctx.lineTo(arrowDist - 2, -4);
    ctx.lineTo(arrowDist - 2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // HP bar with border
    const barW = tank.size * 1.3, barH = 5;
    const barX = tank.x - barW / 2, barY = tank.y - tank.size / 2 - 14;
    const hpR = tank.hp / tank.maxHp;
    // Bar background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 3);
    ctx.fill();
    // HP fill with gradient
    const hpColor = hpR < 0.3 ? '#e74c3c' : hpR < 0.6 ? '#f39c12' : '#2ecc71';
    const hpGrad = ctx.createLinearGradient(barX, barY, barX + barW * hpR, barY);
    hpGrad.addColorStop(0, hpColor);
    hpGrad.addColorStop(1, hpR < 0.3 ? '#ff6b6b' : hpR < 0.6 ? '#f1c40f' : '#58ffb0');
    ctx.fillStyle = hpGrad;
    if (barW * hpR > 0) {
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpR, barH, 2);
      ctx.fill();
    }
    // HP bar highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    if (barW * hpR > 0) {
      ctx.fillRect(barX, barY, barW * hpR, barH / 2);
    }

    // Ammo display (compact text instead of emoji spam)
    if (tank.ammo !== undefined) {
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let ammoStr = `🔫${tank.ammo}`;
      if (tank.missiles > 0) ammoStr += ` 🚀${tank.missiles}`;
      ctx.fillStyle = tank.ammo <= 0 ? '#e74c3c' : tank.ammo <= 3 ? '#f39c12' : '#aaa';
      ctx.fillText(ammoStr, tank.x, barY - 2);
    }

    // Weapon level indicator
    if (tank.weaponLevel > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`⬆Lv${tank.weaponLevel}`, tank.x, barY - (tank.ammo !== undefined ? 12 : 2));
    }

    // Name with shadow
    const nameColors = colorMap[tank.id] || colorMap.blue;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = nameColors.main;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const nameOffset = tank.ammo !== undefined ? 12 : 3;
    const extraOffset = tank.weaponLevel > 0 ? 10 : 0;
    ctx.fillText(tank.name, tank.x, barY - nameOffset - extraOffset);
    ctx.restore();
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
