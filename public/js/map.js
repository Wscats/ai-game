/**
 * map.js - Map, obstacle and terrain management
 */
class GameMap {
  constructor(width, height, obstacleCount) {
    this.width = width;
    this.height = height;
    this.obstacles = [];
    this.terrainPatches = []; // Array of terrain zones: { x, y, width, height, type }
    this.generateTerrain();
    this.generateObstacles(obstacleCount);
  }

  /**
   * Generate terrain patches (snow, forest, water) scattered across the map
   */
  generateTerrain() {
    this.terrainPatches = [];
    const margin = 60;
    const types = ['snow', 'forest', 'water'];
    // Weights: forest 40%, snow 40%, water 20%
    const weights = [0.4, 0.4, 0.2];
    const patchCount = 4 + Math.floor(Math.random() * 4); // 4~7 patches

    for (let i = 0; i < patchCount; i++) {
      let att = 0;
      while (att < 40) {
        const w = 60 + Math.random() * 100;
        const h = 50 + Math.random() * 80;
        const x = margin + Math.random() * (this.width - 2 * margin - w);
        const y = margin + Math.random() * (this.height - 2 * margin - h);

        // Pick type by weight
        let r = Math.random(), type = types[0];
        let cum = 0;
        for (let j = 0; j < types.length; j++) {
          cum += weights[j];
          if (r < cum) { type = types[j]; break; }
        }

        const patch = { x, y, width: w, height: h, type };

        // Avoid tank spawn corners
        let ok = true;
        if (this._ov(patch, { x: 0, y: 0, width: 110, height: 110 }, 10)) ok = false;
        if (this._ov(patch, { x: this.width - 110, y: this.height - 110, width: 110, height: 110 }, 10)) ok = false;

        // Limit water patches to avoid blocking too much
        if (type === 'water') {
          const existingWater = this.terrainPatches.filter(p => p.type === 'water');
          if (existingWater.length >= 2) { att++; continue; }
        }

        if (ok) { this.terrainPatches.push(patch); break; }
        att++;
      }
    }
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
        if (this._ov(obs, {x:this.width-100,y:0,width:100,height:100}, 10)) ok = false;
        if (this._ov(obs, {x:0,y:this.height-100,width:100,height:100}, 10)) ok = false;
        if (ok) { this.obstacles.push(obs); break; }
        att++;
      }
    }
  }

  /**
   * Get terrain type at a given point (returns 'floor' if no patch covers it)
   */
  getTerrainAt(px, py) {
    for (const p of this.terrainPatches) {
      if (px >= p.x && px <= p.x + p.width && py >= p.y && py <= p.y + p.height) {
        return p.type;
      }
    }
    return 'floor';
  }

  /**
   * Get terrain type for a rect (center cx,cy, size w×h) — returns worst terrain
   * Priority: water > snow > forest > floor
   */
  getTerrainForRect(cx, cy, w, h) {
    const priority = { water: 4, snow: 3, forest: 2, floor: 1 };
    let worst = 'floor';
    // Sample 4 corners + center
    const pts = [
      [cx, cy],
      [cx - w/2, cy - h/2], [cx + w/2, cy - h/2],
      [cx - w/2, cy + h/2], [cx + w/2, cy + h/2],
    ];
    for (const [px, py] of pts) {
      const t = this.getTerrainAt(px, py);
      if (priority[t] > priority[worst]) worst = t;
    }
    return worst;
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
  getTerrainState() {
    return this.terrainPatches.map(p => ({
      x: Math.round(p.x), y: Math.round(p.y),
      width: Math.round(p.width), height: Math.round(p.height),
      type: p.type,
    }));
  }
}
