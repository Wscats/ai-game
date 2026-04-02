/**
 * bullet.js - Bullet entity with simulation for turn-based game
 * In turn-based mode, bullets are simulated instantly to their final position
 */
class Bullet {
  constructor(x, y, angle, ownerId) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.ownerId = ownerId;
    this.speed = CONST.BULLET_SPEED;
    this.radius = CONST.BULLET_RADIUS;
    this.damage = CONST.BULLET_DAMAGE;
    this.alive = true;
    this.trail = [{ x, y }];
    this.bounces = 0;
    this.isMissile = false; // Missiles penetrate buildings
  }

  /**
   * Simulate bullet travel instantly, return hit result
   * Returns: { hit: Tank|null, hitObstacle: obs|null, trail: [{x,y}...], finalX, finalY }
   */
  simulate(map, tanks) {
    // Missiles use a special simulation that ignores obstacles
    if (this.isMissile) return this._simulateMissile(map, tanks);

    let cx = this.x, cy = this.y;
    let angle = this.angle;
    let bounces = 0;
    const trail = [{ x: cx, y: cy }];

    for (let step = 0; step < CONST.BULLET_MAX_STEPS; step++) {
      const rad = angle * Math.PI / 180;
      const nx = cx + Math.cos(rad) * this.speed;
      const ny = cy + Math.sin(rad) * this.speed;

      // Check tank hit
      for (const tank of tanks) {
        if (!tank.alive || tank.id === this.ownerId) continue;
        const dist = Math.sqrt((nx - tank.x) ** 2 + (ny - tank.y) ** 2);
        if (dist < this.radius + tank.size / 2) {
          trail.push({ x: nx, y: ny });
          // Calculate distance-based damage multiplier
          const travelDist = Math.sqrt((nx - this.x) ** 2 + (ny - this.y) ** 2);
          const dmgMult = this._distanceDamageMultiplier(travelDist);
          return { hit: tank, hitObstacle: null, trail, finalX: nx, finalY: ny, damageMultiplier: dmgMult };
        }
      }

      // Check wall bounce
      let bounced = false;
      if (nx - this.radius < 0 || nx + this.radius > map.width) {
        angle = 180 - angle;
        bounced = true;
      }
      if (ny - this.radius < 0 || ny + this.radius > map.height) {
        angle = -angle;
        bounced = true;
      }
      angle = ((angle % 360) + 360) % 360;

      if (bounced) {
        bounces++;
        trail.push({ x: cx, y: cy });
        if (bounces > CONST.BULLET_MAX_BOUNCES) {
          return { hit: null, hitObstacle: null, trail, finalX: cx, finalY: cy };
        }
        const newRad = angle * Math.PI / 180;
        cx += Math.cos(newRad) * this.speed;
        cy += Math.sin(newRad) * this.speed;
        continue;
      }

      // Check obstacle hit
      const obs = map.pointInObstacle(nx, ny);
      if (obs) {
        trail.push({ x: nx, y: ny });
        if (obs.type === 'brick') {
          map.damageObstacle(obs);
          return { hit: null, hitObstacle: obs, trail, finalX: nx, finalY: ny, destroyed: true };
        } else {
          // Steel: bullet stops (no reflection)
          return { hit: null, hitObstacle: obs, trail, finalX: nx, finalY: ny, destroyed: false };
        }
      }

      cx = nx;
      cy = ny;
      if (step % 3 === 0) trail.push({ x: cx, y: cy });
    }

    trail.push({ x: cx, y: cy });
    return { hit: null, hitObstacle: null, trail, finalX: cx, finalY: cy };
  }

  /**
   * Missile simulation: flies straight, ignores obstacles (penetrates buildings),
   * only stops when hitting a tank or going out of bounds.
   */
  _simulateMissile(map, tanks) {
    let cx = this.x, cy = this.y;
    const angle = this.angle;
    const trail = [{ x: cx, y: cy }];
    const rad = angle * Math.PI / 180;
    const dx = Math.cos(rad) * this.speed;
    const dy = Math.sin(rad) * this.speed;

    for (let step = 0; step < CONST.BULLET_MAX_STEPS * 1.5; step++) {
      const nx = cx + dx;
      const ny = cy + dy;

      // Check tank hit
      for (const tank of tanks) {
        if (!tank.alive || tank.id === this.ownerId) continue;
        const dist = Math.sqrt((nx - tank.x) ** 2 + (ny - tank.y) ** 2);
        if (dist < this.radius + tank.size / 2) {
          trail.push({ x: nx, y: ny });
          // Calculate distance-based damage multiplier for missile
          const travelDist = Math.sqrt((nx - this.x) ** 2 + (ny - this.y) ** 2);
          const dmgMult = this._distanceDamageMultiplier(travelDist);
          return { hit: tank, hitObstacle: null, trail, finalX: nx, finalY: ny, isMissile: true, damageMultiplier: dmgMult };
        }
      }

      // Out of bounds: missile disappears
      if (nx < 0 || nx > map.width || ny < 0 || ny > map.height) {
        trail.push({ x: nx, y: ny });
        return { hit: null, hitObstacle: null, trail, finalX: nx, finalY: ny, isMissile: true };
      }

      cx = nx;
      cy = ny;
      if (step % 3 === 0) trail.push({ x: cx, y: cy });
    }

    trail.push({ x: cx, y: cy });
    return { hit: null, hitObstacle: null, trail, finalX: cx, finalY: cy, isMissile: true };
  }

  /**
   * Distance-based damage multiplier (smooth bell curve):
   * The closer to optimal range (165px), the higher the damage.
   * Point-blank (0px): ~0.3x (very low)
   * Close range (~80px): ~0.9x
   * Optimal range (165px): 1.5x (peak damage)
   * Far range (~250px): ~0.9x
   * Very far (400px+): ~0.3x (very low)
   *
   * Uses Gaussian curve: mult = base + (peak - base) * exp(-((dist - optimal)^2) / (2 * sigma^2))
   */
  _distanceDamageMultiplier(distance) {
    const optimal = 165;   // Optimal range for max damage
    const peak = 1.5;      // Max multiplier at optimal range
    const base = 0.3;      // Min multiplier at extreme distances
    const sigma = 100;     // Controls curve width

    const mult = base + (peak - base) * Math.exp(-Math.pow(distance - optimal, 2) / (2 * sigma * sigma));
    return Math.round(mult * 100) / 100; // Round to 2 decimal places
  }
}
