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
  }

  /**
   * Simulate bullet travel instantly, return hit result
   * Returns: { hit: Tank|null, hitObstacle: obs|null, trail: [{x,y}...], finalX, finalY }
   */
  simulate(map, tanks) {
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
          return { hit: tank, hitObstacle: null, trail, finalX: nx, finalY: ny };
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
}
