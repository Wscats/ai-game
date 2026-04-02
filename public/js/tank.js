/**
 * tank.js - Tank entity for turn-based game
 */
class Tank {
  constructor(id, x, y, angle, color, name) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.color = color;
    this.name = name;
    this.hp = CONST.TANK_HP;
    this.maxHp = CONST.TANK_HP;
    this.size = CONST.TANK_SIZE;
    this.alive = true;
    this.cooldown = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.currentTerrain = 'floor'; // Track current terrain for UI/AI
    this.shielded = false;          // Shield: absorb next hit
    this.boostTurns = 0;            // Speed boost remaining turns
    this.ammo = CONST.TANK_INIT_AMMO; // Ammo count
    this.missiles = CONST.TANK_INIT_MISSILES; // Missile count (penetrates buildings)
    this.weaponLevel = 0;           // Weapon upgrade level (0=base, each +1 = damage doubles)
    this.roundsSinceLastFire = 0;   // Rounds since last fire (for forced fire rule)
  }

  /**
   * Move forward; terrain affects actual distance.
   * Returns false if blocked (water or obstacle), true if moved.
   */
  moveForward(map) {
    const rad = this.angle * Math.PI / 180;
    return this._tryMove(map, rad, 1);
  }

  moveBackward(map) {
    const rad = this.angle * Math.PI / 180;
    return this._tryMove(map, rad, -1);
  }

  _tryMove(map, rad, dir) {
    const baseDist = CONST.MOVE_DISTANCE;
    // Check destination terrain first (use full step to detect water)
    const fullNx = this.x + Math.cos(rad) * baseDist * dir;
    const fullNy = this.y + Math.sin(rad) * baseDist * dir;
    const destTerrain = map.getTerrainForRect(fullNx, fullNy, this.size, this.size);
    const terrainInfo = TERRAIN_TYPES[destTerrain] || TERRAIN_TYPES.floor;

    // Water is impassable
    if (!terrainInfo.passable) return false;

    // Apply speed multiplier + boost
    const boostMult = this.boostTurns > 0 ? 2 : 1;
    const dist = baseDist * terrainInfo.speedMult * boostMult;
    if (this.boostTurns > 0) this.boostTurns--;
    const nx = this.x + Math.cos(rad) * dist * dir;
    const ny = this.y + Math.sin(rad) * dist * dir;

    if (this._canMove(nx, ny, map)) {
      this.x = nx;
      this.y = ny;
      this.currentTerrain = map.getTerrainForRect(nx, ny, this.size, this.size);
      return true;
    }
    return false;
  }

  rotateLeft() { this.angle = (this.angle - CONST.ROTATE_DEGREES + 360) % 360; }
  rotateRight() { this.angle = (this.angle + CONST.ROTATE_DEGREES) % 360; }
  canFire() { return this.cooldown <= 0 && this.alive && this.ammo > 0; }
  canFireMissile() { return this.cooldown <= 0 && this.alive && this.missiles > 0; }
  fire() {
    if (!this.canFire()) return null;
    this.cooldown = CONST.FIRE_COOLDOWN;
    this.ammo--;
    this.shotsFired++;
    this.roundsSinceLastFire = 0; // Reset forced fire counter
    const rad = this.angle * Math.PI / 180;
    const bx = this.x + Math.cos(rad) * (this.size / 2 + 5);
    const by = this.y + Math.sin(rad) * (this.size / 2 + 5);
    const b = new Bullet(bx, by, this.angle, this.id);
    // Apply weapon upgrade: damage doubles per level
    b.damage = CONST.BULLET_DAMAGE * Math.pow(2, this.weaponLevel);
    b.radius += this.weaponLevel * 2;
    return b;
  }
  fireMissile() {
    if (!this.canFireMissile()) return null;
    this.cooldown = CONST.MISSILE_COOLDOWN;
    this.missiles--;
    this.shotsFired++;
    this.roundsSinceLastFire = 0; // Reset forced fire counter
    const rad = this.angle * Math.PI / 180;
    const bx = this.x + Math.cos(rad) * (this.size / 2 + 5);
    const by = this.y + Math.sin(rad) * (this.size / 2 + 5);
    const m = new Bullet(bx, by, this.angle, this.id);
    m.isMissile = true;
    // Apply weapon upgrade: damage doubles per level
    m.damage = CONST.MISSILE_DAMAGE * Math.pow(2, this.weaponLevel);
    m.radius = 5 + this.weaponLevel * 2;
    return m;
  }
  takeDamage(amount) {
    if (this.shielded) {
      this.shielded = false;
      return; // absorb hit
    }
    this.hp -= amount;
    this.damageTaken += amount;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }
  tickCooldown() { if (this.cooldown > 0) this.cooldown--; }
  _canMove(nx, ny, map) {
    if (!map.isInBounds(nx, ny, this.size)) return false;
    if (map.rectCollides(nx, ny, this.size, this.size)) return false;
    return true;
  }
  angleTo(tx, ty) { return Math.atan2(ty - this.y, tx - this.x) * 180 / Math.PI; }
  distanceTo(tx, ty) { return Math.sqrt((tx - this.x) ** 2 + (ty - this.y) ** 2); }
  getState() {
    return {
      x: Math.round(this.x), y: Math.round(this.y),
      angle: Math.round(this.angle), hp: this.hp, maxHp: this.maxHp,
      canFire: this.canFire(), alive: this.alive,
      terrain: this.currentTerrain,
      shielded: this.shielded, boostTurns: this.boostTurns, ammo: this.ammo,
      missiles: this.missiles, weaponLevel: this.weaponLevel,
      canFireMissile: this.canFireMissile(),
      roundsSinceLastFire: this.roundsSinceLastFire,
    };
  }
}
