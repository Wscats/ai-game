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
  }
  moveForward(map) {
    const rad = this.angle * Math.PI / 180;
    const nx = this.x + Math.cos(rad) * CONST.MOVE_DISTANCE;
    const ny = this.y + Math.sin(rad) * CONST.MOVE_DISTANCE;
    if (this._canMove(nx, ny, map)) { this.x = nx; this.y = ny; return true; }
    return false;
  }
  moveBackward(map) {
    const rad = this.angle * Math.PI / 180;
    const nx = this.x - Math.cos(rad) * CONST.MOVE_DISTANCE;
    const ny = this.y - Math.sin(rad) * CONST.MOVE_DISTANCE;
    if (this._canMove(nx, ny, map)) { this.x = nx; this.y = ny; return true; }
    return false;
  }
  rotateLeft() { this.angle = (this.angle - CONST.ROTATE_DEGREES + 360) % 360; }
  rotateRight() { this.angle = (this.angle + CONST.ROTATE_DEGREES) % 360; }
  canFire() { return this.cooldown <= 0 && this.alive; }
  fire() {
    if (!this.canFire()) return null;
    this.cooldown = 2;
    this.shotsFired++;
    const rad = this.angle * Math.PI / 180;
    const bx = this.x + Math.cos(rad) * (this.size / 2 + 5);
    const by = this.y + Math.sin(rad) * (this.size / 2 + 5);
    return new Bullet(bx, by, this.angle, this.id);
  }
  takeDamage(amount) {
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
    };
  }
}
