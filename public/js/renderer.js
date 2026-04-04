/**
 * renderer.js - Enhanced Canvas rendering for turn-based tank battle
 * Features: starfield, animated terrain, 3D obstacles, detailed tanks,
 *           glowing trails, spectacular explosions, polished UI
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bulletTrails = [];
    this.explosions = [];
    this.animating = false;
    this._stars = [];
    this._particles = []; // ambient floating particles
    this._frameCount = 0;
    this._damageFlashes = []; // screen-shake / flash on hit
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.maxWidth = '100%';
    this.canvas.style.maxHeight = '100%';
    this.canvas.style.width = 'auto';
    this.canvas.style.height = 'auto';
    this._initStars(w, h);
    this._initParticles(w, h);
  }

  /* ── Starfield ─────────────────────────────────────────────── */
  _initStars(w, h) {
    this._stars = [];
    const count = Math.floor((w * h) / 2000);
    for (let i = 0; i < count; i++) {
      this._stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.3 + Math.random() * 1.2,
        a: 0.2 + Math.random() * 0.6,
        speed: 0.3 + Math.random() * 0.8, // twinkle speed
      });
    }
  }

  _drawStars(ctx, W, H) {
    const t = Date.now() / 1000;
    for (const s of this._stars) {
      const alpha = s.a * (0.5 + 0.5 * Math.sin(t * s.speed + s.x));
      ctx.fillStyle = `rgba(180,200,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Ambient particles ─────────────────────────────────────── */
  _initParticles(w, h) {
    this._particles = [];
    for (let i = 0; i < 25; i++) {
      this._particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 2, a: 0.05 + Math.random() * 0.1,
        color: ['180,200,255', '255,215,0', '100,255,200'][Math.floor(Math.random() * 3)],
      });
    }
  }

  _drawParticles(ctx, W, H) {
    for (const p of this._particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 800 + p.x);
      ctx.fillStyle = `rgba(${p.color},${p.a * pulse})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Main render ───────────────────────────────────────────── */
  render(state) {
    const { map, tanks, events } = state;
    const ctx = this.ctx;
    const W = map.width, H = map.height;
    this._frameCount++;
    const t = Date.now();

    // ── Background: deep space gradient ──
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    bgGrad.addColorStop(0, '#12122e');
    bgGrad.addColorStop(0.5, '#0c0c22');
    bgGrad.addColorStop(1, '#060612');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Starfield ──
    this._drawStars(ctx, W, H);

    // ── Subtle grid (hex-dot pattern) ──
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W; x += CONST.GRID_SIZE) {
      for (let y = 0; y < H; y += CONST.GRID_SIZE) {
        const offset = (Math.floor(y / CONST.GRID_SIZE) % 2) * (CONST.GRID_SIZE / 2);
        ctx.beginPath();
        ctx.arc(x + offset, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Terrain patches ──
    if (map.terrainPatches) {
      for (const patch of map.terrainPatches) {
        this._drawTerrain(ctx, patch, t);
      }
    }

    // ── Obstacles ──
    for (const obs of map.obstacles) {
      this._drawObstacle(ctx, obs, t);
    }

    // ── Random events (items on field) ──
    if (events && events.length > 0) {
      for (const ev of events) {
        if (!ev.active) continue;
        this._drawFieldItem(ctx, ev, t);
      }
    }

    // ── Tank movement trails (replay) ──
    this._drawReplayTrails(ctx, state);

    // ── Ambient particles ──
    this._drawParticles(ctx, W, H);

    // ── Bullet trails ──
    for (const bt of this.bulletTrails) {
      this._drawBulletTrail(ctx, bt, t);
    }

    // ── Explosions ──
    this._updateExplosions(ctx);

    // ── Tanks ──
    for (const tank of tanks) {
      if (!tank.alive) continue;
      ctx.save();
      if (tank.currentTerrain === 'forest') ctx.globalAlpha = 0.45;
      this._drawTank(ctx, tank);
      this._drawTankAuras(ctx, tank, t);
      this._drawTankItems(ctx, tank, t);
      ctx.restore();
    }

    // ── Damage flashes ──
    for (let i = this._damageFlashes.length - 1; i >= 0; i--) {
      const f = this._damageFlashes[i];
      f.frame++;
      if (f.frame > f.maxFrames) { this._damageFlashes.splice(i, 1); continue; }
      const a = 0.15 * (1 - f.frame / f.maxFrames);
      ctx.fillStyle = `rgba(255,50,50,${a})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Vignette overlay ──
    const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // ── Scanline effect (subtle) ──
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let y = 0; y < H; y += 3) {
      ctx.fillRect(0, y, W, 1);
    }

    // ── Border with animated glow ──
    const borderPulse = 0.15 + 0.1 * Math.sin(t / 1500);
    ctx.save();
    ctx.shadowColor = `rgba(255,215,0,${borderPulse})`;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(255,215,0,${borderPulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();
    // Inner border
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, W - 8, H - 8);
  }

  /* ── Terrain drawing ───────────────────────────────────────── */
  _drawTerrain(ctx, patch, t) {
    const info = TERRAIN_TYPES[patch.type];
    if (!info || !info.color) return;

    ctx.save();

    if (patch.type === 'forest') {
      // Rich forest with layered trees
      const grad = ctx.createLinearGradient(patch.x, patch.y, patch.x, patch.y + patch.height);
      grad.addColorStop(0, 'rgba(20,80,20,0.5)');
      grad.addColorStop(1, 'rgba(10,50,10,0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(patch.x, patch.y, patch.width, patch.height);

      // Tree canopy circles (layered for depth)
      const layers = [
        { color: 'rgba(15,70,15,0.6)', rMin: 7, rMax: 12, spacing: 22 },
        { color: 'rgba(30,110,30,0.5)', rMin: 5, rMax: 9, spacing: 16 },
        { color: 'rgba(50,150,50,0.35)', rMin: 3, rMax: 6, spacing: 14 },
      ];
      for (const layer of layers) {
        ctx.fillStyle = layer.color;
        for (let tx = patch.x + 8; tx < patch.x + patch.width - 8; tx += layer.spacing) {
          for (let ty = patch.y + 8; ty < patch.y + patch.height - 8; ty += layer.spacing) {
            const jx = Math.sin(tx * 0.7 + ty * 0.3) * 5;
            const jy = Math.cos(tx * 0.3 + ty * 0.7) * 5;
            const r = layer.rMin + Math.abs(Math.sin(tx * ty * 0.01)) * (layer.rMax - layer.rMin);
            ctx.beginPath();
            ctx.arc(tx + jx, ty + jy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // Subtle leaf sparkle
      ctx.fillStyle = 'rgba(100,255,100,0.15)';
      for (let i = 0; i < 6; i++) {
        const sx = patch.x + 10 + Math.abs(Math.sin(t / 700 + i * 2.1)) * (patch.width - 20);
        const sy = patch.y + 10 + Math.abs(Math.cos(t / 900 + i * 1.7)) * (patch.height - 20);
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Border
      ctx.strokeStyle = 'rgba(30,130,30,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(patch.x, patch.y, patch.width, patch.height);
      ctx.setLineDash([]);

    } else if (patch.type === 'water') {
      // Animated water with reflections
      const waterGrad = ctx.createLinearGradient(patch.x, patch.y, patch.x, patch.y + patch.height);
      waterGrad.addColorStop(0, 'rgba(20,60,160,0.55)');
      waterGrad.addColorStop(0.5, 'rgba(30,90,200,0.5)');
      waterGrad.addColorStop(1, 'rgba(15,50,140,0.6)');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(patch.x, patch.y, patch.width, patch.height);

      // Animated wave lines
      ctx.lineWidth = 1;
      for (let wy = patch.y + 6; wy < patch.y + patch.height; wy += 8) {
        const waveAlpha = 0.2 + 0.15 * Math.sin(t / 600 + wy * 0.1);
        ctx.strokeStyle = `rgba(120,200,255,${waveAlpha})`;
        ctx.beginPath();
        for (let wx = patch.x; wx < patch.x + patch.width; wx += 4) {
          const waveY = wy + Math.sin((wx * 0.08) + t / 400 + wy * 0.05) * 2.5;
          wx === patch.x ? ctx.moveTo(wx, waveY) : ctx.lineTo(wx, waveY);
        }
        ctx.stroke();
      }
      // Shimmer highlights
      ctx.fillStyle = `rgba(180,230,255,${0.08 + 0.06 * Math.sin(t / 500)})`;
      for (let i = 0; i < 4; i++) {
        const rx = patch.x + 15 + Math.abs(Math.sin(t / 1200 + i * 1.5)) * (patch.width - 30);
        const ry = patch.y + 10 + Math.abs(Math.cos(t / 1000 + i * 2.3)) * (patch.height - 20);
        ctx.beginPath();
        ctx.ellipse(rx, ry, 8 + Math.sin(t / 300 + i) * 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Border
      ctx.strokeStyle = 'rgba(40,120,230,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(patch.x, patch.y, patch.width, patch.height);

    } else if (patch.type === 'snow') {
      // Snow with sparkle
      const snowGrad = ctx.createRadialGradient(
        patch.x + patch.width / 2, patch.y + patch.height / 2, 0,
        patch.x + patch.width / 2, patch.y + patch.height / 2, Math.max(patch.width, patch.height) * 0.6
      );
      snowGrad.addColorStop(0, 'rgba(220,240,255,0.4)');
      snowGrad.addColorStop(1, 'rgba(180,210,240,0.3)');
      ctx.fillStyle = snowGrad;
      ctx.fillRect(patch.x, patch.y, patch.width, patch.height);

      // Snowflake particles
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let sx = patch.x + 6; sx < patch.x + patch.width - 6; sx += 12) {
        for (let sy = patch.y + 6; sy < patch.y + patch.height - 6; sy += 12) {
          const drift = Math.sin(t / 1500 + sx * 0.1 + sy * 0.1) * 2;
          const size = 1 + Math.abs(Math.sin(sx * sy * 0.01)) * 1.5;
          ctx.beginPath();
          ctx.arc(sx + drift, sy, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Sparkle effect
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t / 200)})`;
      for (let i = 0; i < 3; i++) {
        const sparkX = patch.x + 8 + Math.abs(Math.sin(t / 500 + i * 3)) * (patch.width - 16);
        const sparkY = patch.y + 8 + Math.abs(Math.cos(t / 600 + i * 2)) * (patch.height - 16);
        // Draw tiny cross sparkle
        ctx.fillRect(sparkX - 3, sparkY - 0.5, 6, 1);
        ctx.fillRect(sparkX - 0.5, sparkY - 3, 1, 6);
      }
      // Border
      ctx.strokeStyle = 'rgba(180,220,255,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.strokeRect(patch.x, patch.y, patch.width, patch.height);
      ctx.setLineDash([]);
    }

    // Terrain label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(info.label, patch.x + 4, patch.y + 3);

    ctx.restore();
  }

  /* ── Obstacle drawing ──────────────────────────────────────── */
  _drawObstacle(ctx, obs, t) {
    ctx.save();

    if (obs.type === 'brick') {
      // 3D brick wall
      const depth = 4;
      // Side shadow (3D depth)
      ctx.fillStyle = '#5a2d0a';
      ctx.fillRect(obs.x + depth, obs.y + depth, obs.width, obs.height);

      // Main face
      const brickGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
      brickGrad.addColorStop(0, '#a0522d');
      brickGrad.addColorStop(0.3, '#8B4513');
      brickGrad.addColorStop(1, '#6b3410');
      ctx.fillStyle = brickGrad;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Brick pattern with mortar lines
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      for (let by = obs.y; by < obs.y + obs.height; by += 8) {
        ctx.beginPath(); ctx.moveTo(obs.x, by); ctx.lineTo(obs.x + obs.width, by); ctx.stroke();
        const offset = (Math.floor((by - obs.y) / 8) % 2) * 16;
        for (let bx = obs.x + offset; bx < obs.x + obs.width; bx += 32) {
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + 8); ctx.stroke();
        }
      }
      // Top highlight
      ctx.fillStyle = 'rgba(255,200,150,0.12)';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height * 0.3);
      // Border
      ctx.strokeStyle = '#A0522D';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

    } else {
      // Steel wall with metallic sheen
      const depth = 5;
      // 3D depth shadow
      ctx.fillStyle = '#3a4a5a';
      ctx.fillRect(obs.x + depth, obs.y + depth, obs.width, obs.height);

      // Main face with metallic gradient
      const steelGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
      steelGrad.addColorStop(0, '#b0c0d0');
      steelGrad.addColorStop(0.3, '#8899aa');
      steelGrad.addColorStop(0.6, '#a0b0c0');
      steelGrad.addColorStop(1, '#667788');
      ctx.fillStyle = steelGrad;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Diagonal cross pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
      ctx.moveTo(obs.x + obs.width, obs.y); ctx.lineTo(obs.x, obs.y + obs.height);
      ctx.stroke();

      // Horizontal center line
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y + obs.height / 2);
      ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
      ctx.stroke();

      // Rivets at corners with 3D effect
      const rv = 3.5;
      const rivetPositions = [
        [obs.x + rv + 3, obs.y + rv + 3],
        [obs.x + obs.width - rv - 3, obs.y + rv + 3],
        [obs.x + rv + 3, obs.y + obs.height - rv - 3],
        [obs.x + obs.width - rv - 3, obs.y + obs.height - rv - 3],
      ];
      for (const [rx, ry] of rivetPositions) {
        // Rivet shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(rx + 1, ry + 1, rv, 0, Math.PI * 2); ctx.fill();
        // Rivet body
        const rivetGrad = ctx.createRadialGradient(rx - 1, ry - 1, 0, rx, ry, rv);
        rivetGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
        rivetGrad.addColorStop(1, 'rgba(150,170,190,0.3)');
        ctx.fillStyle = rivetGrad;
        ctx.beginPath(); ctx.arc(rx, ry, rv, 0, Math.PI * 2); ctx.fill();
      }

      // Top highlight reflection
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height * 0.25);

      // Animated shine sweep
      const shineX = obs.x + ((t / 30) % (obs.width + 40)) - 20;
      const shineGrad = ctx.createLinearGradient(shineX - 10, 0, shineX + 10, 0);
      shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
      shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shineGrad;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Border
      ctx.strokeStyle = '#99aacc';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    }

    ctx.restore();
  }

  /* ── Field item drawing ────────────────────────────────────── */
  _drawFieldItem(ctx, ev, t) {
    const pulse = 0.7 + 0.3 * Math.sin(t / 300);
    const floatY = Math.sin(t / 500 + ev.x) * 3; // gentle float
    ctx.save();
    ctx.translate(ev.x, ev.y + floatY);

    // Outer glow ring for all items
    const glowR = 18;
    const glowAlpha = 0.1 + 0.08 * Math.sin(t / 250);

    const itemDefs = {
      supply:         { color: '46,204,113',  emoji: '✚',  shape: 'box',     glowColor: '46,204,113' },
      mine:           { color: '231,76,60',   emoji: '💣', shape: 'circle',  glowColor: '231,76,60' },
      shield:         { color: '52,152,219',  emoji: '🛡️', shape: 'circle',  glowColor: '52,152,219' },
      boost:          { color: '241,196,15',  emoji: '⚡', shape: 'circle',  glowColor: '241,196,15' },
      ammo:           { color: '230,126,34',  emoji: '🔫', shape: 'box',     glowColor: '230,126,34' },
      missile:        { color: '255,69,0',    emoji: '🚀', shape: 'circle',  glowColor: '255,69,0' },
      weapon_upgrade: { color: '255,215,0',   emoji: '⬆',  shape: 'diamond', glowColor: '255,215,0' },
    };

    const def = itemDefs[ev.type];
    if (!def) { ctx.restore(); return; }

    // Ground glow
    const groundGlow = ctx.createRadialGradient(0, 4, 0, 0, 4, glowR);
    groundGlow.addColorStop(0, `rgba(${def.glowColor},${glowAlpha * 1.5})`);
    groundGlow.addColorStop(1, `rgba(${def.glowColor},0)`);
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 4, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Rotating sparkle ring
    ctx.strokeStyle = `rgba(${def.color},${0.15 + 0.1 * pulse})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (ev.type === 'poison') {
      // Special: poison cloud
      const r = ev.radius || 55;
      const grad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
      grad.addColorStop(0, `rgba(155,89,182,${0.5 * pulse})`);
      grad.addColorStop(0.6, `rgba(155,89,182,${0.2 * pulse})`);
      grad.addColorStop(1, 'rgba(155,89,182,0)');
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(142,68,173,${0.4 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * pulse})`;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('☠️', 0, 0);
      ctx.restore();
      return;
    }

    // Shape
    ctx.shadowColor = `rgba(${def.glowColor},${0.6 * pulse})`;
    ctx.shadowBlur = 14;

    if (def.shape === 'box') {
      ctx.fillStyle = `rgba(${def.color},${0.85 * pulse})`;
      ctx.beginPath();
      ctx.roundRect(-12, -12, 24, 24, 4);
      ctx.fill();
      ctx.strokeStyle = `rgba(${def.color},0.9)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(-10, -10, 20, 10);
    } else if (def.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${def.color},${0.8 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${def.color},0.9)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner highlight
      const hlGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 13);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrad;
      ctx.fill();
    } else if (def.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(13, 0); ctx.lineTo(0, 15); ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(${def.color},${0.9 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${def.color},1)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Diamond facet highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(13, 0); ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Emoji icon
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji, 0, 1);

    ctx.restore();
  }

  /* ── Replay trails ─────────────────────────────────────────── */
  _drawReplayTrails(ctx, state) {
    const trailConfigs = [
      { trail: state.redTrail, color: '231,76,60' },
      { trail: state.blueTrail, color: '52,152,219' },
    ];
    for (const { trail, color } of trailConfigs) {
      if (!trail || trail.length < 2) continue;
      ctx.save();
      // Gradient trail
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = `rgba(${color},0.4)`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Waypoint dots with glow
      for (let i = 0; i < trail.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},0.5)`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ── Bullet trail drawing ──────────────────────────────────── */
  _drawBulletTrail(ctx, bt, t) {
    if (bt.trail.length < 2) return;

    const colorMap = {
      red:    { r: 255, g: 107, b: 107, glow: CONST.COLOR_BULLET_RED },
      blue:   { r: 116, g: 185, b: 255, glow: CONST.COLOR_BULLET_BLUE },
      green:  { r: 88,  g: 255, b: 160, glow: CONST.COLOR_GREEN },
      purple: { r: 200, g: 140, b: 255, glow: CONST.COLOR_PURPLE },
    };
    const c = colorMap[bt.owner] || colorMap.blue;

    ctx.save();

    // Outer glow trail
    ctx.beginPath();
    ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
    for (let i = 1; i < bt.trail.length; i++) ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.15)`;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Mid glow
    ctx.beginPath();
    ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
    for (let i = 1; i < bt.trail.length; i++) ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.35)`;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Core trail
    ctx.beginPath();
    ctx.moveTo(bt.trail[0].x, bt.trail[0].y);
    for (let i = 1; i < bt.trail.length; i++) ctx.lineTo(bt.trail[i].x, bt.trail[i].y);
    ctx.strokeStyle = `rgba(255,255,255,0.5)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bullet head with multi-layer glow
    const last = bt.trail[bt.trail.length - 1];
    // Outer glow
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.4)`;
    ctx.fill();
    // Main bullet
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = c.glow;
    ctx.fill();
    // Bright core
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    ctx.restore();
  }

  /* ── Explosion system ──────────────────────────────────────── */
  _updateExplosions(ctx) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.frame++;
      if (e.frame > e.maxFrames) { this.explosions.splice(i, 1); continue; }
      const p = e.frame / e.maxFrames;
      const r = e.size * (0.5 + p * 0.8);
      const a = 1 - p;

      ctx.save();

      // Shockwave ring
      if (p < 0.6) {
        const ringR = e.size * 2 * (p / 0.6);
        const ringA = 0.4 * (1 - p / 0.6);
        ctx.beginPath();
        ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,200,100,${ringA})`;
        ctx.lineWidth = 3 * (1 - p / 0.6);
        ctx.stroke();
      }

      // Outer heat glow
      const heatGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 2.5);
      heatGrad.addColorStop(0, `rgba(255,100,0,${a * 0.2})`);
      heatGrad.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = heatGrad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Main fireball layers
      const layers = [
        { mult: 1.8, color: `rgba(255,80,0,${a * 0.3})` },
        { mult: 1.3, color: `rgba(255,140,0,${a * 0.5})` },
        { mult: 1.0, color: `rgba(255,180,50,${a * 0.6})` },
        { mult: 0.5, color: `rgba(255,240,180,${a * 0.8})` },
        { mult: 0.2, color: `rgba(255,255,240,${a * 0.95})` },
      ];
      for (const layer of layers) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * layer.mult, 0, Math.PI * 2);
        ctx.fillStyle = layer.color;
        ctx.fill();
      }

      // Spark particles
      if (!e.sparks) {
        e.sparks = [];
        for (let si = 0; si < 12; si++) {
          const sa = Math.random() * Math.PI * 2;
          e.sparks.push({
            angle: sa,
            speed: 1.5 + Math.random() * 3,
            size: 1 + Math.random() * 2.5,
            decay: 0.8 + Math.random() * 0.15,
            color: Math.random() > 0.5 ? '255,200,50' : '255,120,30',
          });
        }
      }
      for (const spark of e.sparks) {
        const sx = e.x + Math.cos(spark.angle) * spark.speed * e.frame * spark.decay;
        const sy = e.y + Math.sin(spark.angle) * spark.speed * e.frame * spark.decay;
        const sparkA = a * 0.9;
        const sparkR = spark.size * (1 - p * 0.7);
        if (sparkR > 0) {
          ctx.beginPath();
          ctx.arc(sx, sy, sparkR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${spark.color},${sparkA})`;
          ctx.fill();
          // Spark glow
          ctx.beginPath();
          ctx.arc(sx, sy, sparkR * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${spark.color},${sparkA * 0.2})`;
          ctx.fill();
        }
      }

      // Smoke (appears in later frames)
      if (p > 0.3) {
        const smokeA = (p - 0.3) * 0.3 * (1 - p);
        ctx.beginPath();
        ctx.arc(e.x, e.y - r * p * 0.5, r * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(80,80,80,${smokeA})`;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /* ── Tank drawing ──────────────────────────────────────────── */
  _drawTank(ctx, tank) {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle * Math.PI / 180);
    const s = tank.size / 2;

    const colorMap = {
      red:    { dark: CONST.COLOR_RED_DARK, main: CONST.COLOR_RED, barrel: '#ff8888', glow: 'rgba(231,76,60,0.4)', light: '#ffaaaa', accent: '#ff6b6b' },
      blue:   { dark: CONST.COLOR_BLUE_DARK, main: CONST.COLOR_BLUE, barrel: '#88bbff', glow: 'rgba(52,152,219,0.4)', light: '#aaddff', accent: '#74b9ff' },
      green:  { dark: CONST.COLOR_GREEN_DARK, main: CONST.COLOR_GREEN, barrel: '#88ffaa', glow: 'rgba(46,204,113,0.4)', light: '#aaffcc', accent: '#58ffb0' },
      purple: { dark: CONST.COLOR_PURPLE_DARK, main: CONST.COLOR_PURPLE, barrel: '#cc88ff', glow: 'rgba(155,89,182,0.4)', light: '#ddaaff', accent: '#c39bd3' },
    };
    const colors = colorMap[tank.id] || colorMap.blue;

    // Ground shadow (soft ellipse)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(3, 4, s * 0.95, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Tank body with rounded corners ──
    const br = 5;
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

    // Body gradient
    const bodyGrad = ctx.createLinearGradient(0, -s * 0.7, 0, s * 0.7);
    bodyGrad.addColorStop(0, colors.dark);
    bodyGrad.addColorStop(0.4, colors.main);
    bodyGrad.addColorStop(1, colors.dark);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Body top highlight
    const hlGrad = ctx.createLinearGradient(0, -s * 0.7, 0, 0);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    ctx.fill();

    // Body outline
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Tracks with animated tread ──
    const trackH = 6;
    const treadOffset = (this._frameCount * 2) % 6;
    for (const trackY of [-s * 0.7, s * 0.7 - trackH]) {
      // Track base
      ctx.fillStyle = 'rgba(30,30,30,0.8)';
      ctx.fillRect(-s - 2, trackY, s * 2 + 4, trackH);
      // Track border
      ctx.strokeStyle = 'rgba(80,80,80,0.5)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-s - 2, trackY, s * 2 + 4, trackH);
      // Animated tread marks
      ctx.strokeStyle = 'rgba(100,100,100,0.4)';
      ctx.lineWidth = 1;
      for (let tx = -s - 2 + treadOffset; tx < s + 2; tx += 6) {
        ctx.beginPath();
        ctx.moveTo(tx, trackY);
        ctx.lineTo(tx, trackY + trackH);
        ctx.stroke();
      }
    }

    // ── Turret ──
    const turretGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, s * 0.55);
    turretGrad.addColorStop(0, colors.light);
    turretGrad.addColorStop(0.7, colors.main);
    turretGrad.addColorStop(1, colors.dark);
    ctx.fillStyle = turretGrad;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // Turret ring
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // ── Barrel with muzzle brake ──
    const barrelGrad = ctx.createLinearGradient(0, -4, 0, 4);
    barrelGrad.addColorStop(0, colors.barrel);
    barrelGrad.addColorStop(0.3, 'rgba(255,255,255,0.25)');
    barrelGrad.addColorStop(0.7, 'rgba(255,255,255,0.05)');
    barrelGrad.addColorStop(1, colors.barrel);
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(s * 0.3, -3.5, s * 0.85, 7);

    // Muzzle brake (wider end piece)
    ctx.fillStyle = '#ccc';
    ctx.fillRect(s + 2, -5, 7, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(s + 2, -5, 7, 10);
    // Muzzle brake slots
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(s + 4, -4, 1.5, 3);
    ctx.fillRect(s + 4, 1, 1.5, 3);

    // Turret center dot
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();

    // ── Engine exhaust glow (back of tank) ──
    const exhaustPulse = 0.3 + 0.3 * Math.sin(Date.now() / 100);
    const exhaustGrad = ctx.createRadialGradient(-s - 2, 0, 0, -s - 2, 0, 8);
    exhaustGrad.addColorStop(0, `rgba(255,150,50,${exhaustPulse})`);
    exhaustGrad.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = exhaustGrad;
    ctx.beginPath();
    ctx.arc(-s - 2, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── UI elements (not rotated) ──

    // Direction indicator arrow
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle * Math.PI / 180);
    const arrowDist = s + 16;
    ctx.fillStyle = colors.glow;
    ctx.beginPath();
    ctx.moveTo(arrowDist + 7, 0);
    ctx.lineTo(arrowDist - 2, -5);
    ctx.lineTo(arrowDist - 2, 5);
    ctx.closePath();
    ctx.fill();
    // Arrow outline
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();

    // ── HP bar ──
    const barW = tank.size * 1.4, barH = 6;
    const barX = tank.x - barW / 2, barY = tank.y - tank.size / 2 - 16;
    const hpR = tank.hp / tank.maxHp;

    // Bar background with rounded corners
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // HP fill with gradient
    const hpColor = hpR < 0.3 ? '#e74c3c' : hpR < 0.6 ? '#f39c12' : '#2ecc71';
    const hpColorEnd = hpR < 0.3 ? '#ff6b6b' : hpR < 0.6 ? '#f1c40f' : '#58ffb0';
    if (barW * hpR > 0) {
      const hpGrad = ctx.createLinearGradient(barX, barY, barX + barW * hpR, barY);
      hpGrad.addColorStop(0, hpColor);
      hpGrad.addColorStop(1, hpColorEnd);
      ctx.fillStyle = hpGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpR, barH, 3);
      ctx.fill();
      // HP bar shine
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpR, barH / 2, [3, 3, 0, 0]);
      ctx.fill();
    }

    // ── Ammo display ──
    if (tank.ammo !== undefined) {
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let ammoStr = `🔫${tank.ammo}`;
      if (tank.missiles > 0) ammoStr += ` 🚀${tank.missiles}`;
      ctx.fillStyle = tank.ammo <= 0 ? '#e74c3c' : tank.ammo <= 3 ? '#f39c12' : '#aaa';
      ctx.fillText(ammoStr, tank.x, barY - 3);
    }

    // ── Weapon level ──
    if (tank.weaponLevel > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`⬆Lv${tank.weaponLevel}`, tank.x, barY - (tank.ammo !== undefined ? 13 : 3));
    }

    // ── Name with glow ──
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = colors.main;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const nameOffset = tank.ammo !== undefined ? 13 : 3;
    const extraOffset = tank.weaponLevel > 0 ? 10 : 0;
    ctx.fillText(tank.name, tank.x, barY - nameOffset - extraOffset);
    ctx.restore();
  }

  /* ── Tank auras (shield, boost, weapon upgrade) ────────────── */
  _drawTankAuras(ctx, tank, t) {
    const s = tank.size / 2;

    // Shield aura
    const hasShield = tank.shielded || (tank.items && tank.items.some(i => i.type === 'shield'));
    if (hasShield) {
      ctx.save();
      ctx.globalAlpha = 1;
      const shieldR = s + 12;
      const shieldPulse = 0.5 + 0.5 * Math.sin(t / 200);
      ctx.translate(tank.x, tank.y);

      // Hexagonal shield
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
      ctx.shadowColor = 'rgba(52,152,219,0.7)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.fillStyle = `rgba(52,152,219,${0.06 + 0.06 * shieldPulse})`;
      ctx.fill();

      // Shield energy particles
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + t / 1000;
        const px = Math.cos(a) * shieldR * 0.8;
        const py = Math.sin(a) * shieldR * 0.8;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,200,255,${0.4 + 0.3 * shieldPulse})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Boost aura
    const boostItem = tank.items && tank.items.find(i => i.type === 'boost');
    const hasBoost = tank.boostTurns > 0 || boostItem;
    if (hasBoost) {
      ctx.save();
      ctx.globalAlpha = 1;
      const boostPulse = 0.5 + 0.5 * Math.sin(t / 120);
      ctx.translate(tank.x, tank.y);
      const boostR = s + 8;

      // Speed lines
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i + t / 500;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (boostR - 3), Math.sin(a) * (boostR - 3));
        ctx.lineTo(Math.cos(a) * (boostR + 6), Math.sin(a) * (boostR + 6));
        ctx.strokeStyle = `rgba(241,196,15,${0.3 + 0.4 * boostPulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Dashed circle
      ctx.beginPath();
      ctx.arc(0, 0, boostR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(241,196,15,${0.25 + 0.25 * boostPulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Weapon upgrade aura
    const hasWeaponUp = tank.weaponLevel > 0 || (tank.items && tank.items.some(i => i.type === 'weapon_upgrade'));
    if (hasWeaponUp) {
      ctx.save();
      ctx.globalAlpha = 1;
      const wPulse = 0.4 + 0.3 * Math.sin(t / 250);
      const wLevel = tank.weaponLevel || 1;
      ctx.translate(tank.x, tank.y);
      const starR = s + 5;
      const rotation = t / 2000;

      // Rotating star pattern
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + rotation;
        const px = Math.cos(a) * starR;
        const py = Math.sin(a) * starR;
        ctx.moveTo(px - 2, py - 2); ctx.lineTo(px + 2, py + 2);
        ctx.moveTo(px + 2, py - 2); ctx.lineTo(px - 2, py + 2);
      }
      ctx.strokeStyle = `rgba(255,215,0,${wPulse * Math.min(wLevel, 3) / 3})`;
      ctx.lineWidth = 1.5 + wLevel * 0.5;
      ctx.stroke();
      // Glow ring
      ctx.beginPath();
      ctx.arc(0, 0, starR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,215,0,${wPulse * 0.25 * Math.min(wLevel, 3) / 3})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ── Tank held items icons ─────────────────────────────────── */
  _drawTankItems(ctx, tank, t) {
    if (!tank.items || tank.items.length === 0) return;
    ctx.save();
    ctx.globalAlpha = 1;
    const itemY = tank.y + tank.size / 2 + 12;
    const totalW = tank.items.length * 20;
    const startX = tank.x - totalW / 2 + 10;

    for (let ii = 0; ii < tank.items.length; ii++) {
      const item = tank.items[ii];
      const ix = startX + ii * 20;
      const iy = itemY;
      const itemPulse = 0.7 + 0.3 * Math.sin(t / 300 + ii);

      // Slot background
      ctx.fillStyle = `rgba(0,0,0,${0.55 * itemPulse})`;
      ctx.beginPath();
      ctx.roundRect(ix - 9, iy - 9, 18, 18, 4);
      ctx.fill();

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
      ctx.roundRect(ix - 9, iy - 9, 18, 18, 4);
      ctx.stroke();

      // Emoji
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, ix, iy);

      // Boost turns remaining
      if (item.type === 'boost' && item.turns) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(item.turns.toString(), ix + 9, iy - 9);
      }
    }
    ctx.restore();
  }

  /* ── Public API ────────────────────────────────────────────── */
  addBulletTrail(trail, owner) {
    this.bulletTrails.push({ trail, owner, time: Date.now() });
    if (this.bulletTrails.length > 4) this.bulletTrails.shift();
  }

  addExplosion(x, y, size) {
    this.explosions.push({ x, y, size, frame: 0, maxFrames: 25 });
    this._damageFlashes.push({ frame: 0, maxFrames: 8 });
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
