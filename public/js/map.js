/**
 * map.js - Map and obstacle management
 */
class GameMap {
  constructor(width, height, obstacleCount) {
    this.width = width;
    this.height = height;
    this.obstacles = [];
    this.generateObstacles(obstacleCount);
  }
  generateObstacles(count) {
    this.obstacles = [];
    const margin = 90;
    for (let i = 0; i < count; i++) {
      let att = 0;
      while (att < 50) {
        const w = 30 + Math.random() * 50, h = 30 + Math.random() * 50;
        const x = margin + Math.random() * (this.width - 2 * margin - w);
        const y = margin + Math.random() * (this.height - 2 * margin - h);
        const type = Math.random() > 0.3 ? 'brick' : 'steel';
        const obs = { x, y, width: w, height: h, type };
        let ok = true;
        for (const e of this.obstacles) { if (this._ov(obs, e, 20)) { ok = false; break; } }
        if (this._ov(obs, {x:0,y:0,width:100,height:100}, 10)) ok = false;
        if (this._ov(obs, {x:this.width-100,y:this.height-100,width:100,height:100}, 10)) ok = false;
        if (ok) { this.obstacles.push(obs); break; }
        att++;
      }
    }
  }
  _ov(a, b, p=0) {
    return !(a.x+a.width+p<b.x||b.x+b.width+p<a.x||a.y+a.height+p<b.y||b.y+b.height+p<a.y);
  }
  pointInObstacle(px, py) {
    for (const o of this.obstacles) {
      if (px>=o.x&&px<=o.x+o.width&&py>=o.y&&py<=o.y+o.height) return o;
    }
    return null;
  }
  rectCollides(cx, cy, w, h) {
    const r = {x:cx-w/2, y:cy-h/2, width:w, height:h};
    for (const o of this.obstacles) { if (this._ov(r, o)) return o; }
    return null;
  }
  isInBounds(cx, cy, size) {
    const half = size/2;
    return cx-half>=0 && cx+half<=this.width && cy-half>=0 && cy+half<=this.height;
  }
  hasLineOfSight(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.sqrt((x2-x1)**2+(y2-y1)**2)/5);
    for (let i=0; i<=steps; i++) {
      const t = i/steps;
      if (this.pointInObstacle(x1+(x2-x1)*t, y1+(y2-y1)*t)) return false;
    }
    return true;
  }
  damageObstacle(obs) {
    if (obs.type==='brick') {
      const idx = this.obstacles.indexOf(obs);
      if (idx!==-1) { this.obstacles.splice(idx,1); return true; }
    }
    return false;
  }
  getState() {
    return this.obstacles.map(o => ({
      x:Math.round(o.x), y:Math.round(o.y),
      width:Math.round(o.width), height:Math.round(o.height), type:o.type
    }));
  }
}
