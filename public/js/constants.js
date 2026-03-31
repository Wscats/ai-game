/**
 * constants.js - Game constants for turn-based tank battle
 */
const CONST = {
  // Tank
  TANK_SIZE: 30,
  TANK_HP: 100,
  TANK_INIT_AMMO: 3,       // Initial ammo count per tank
  MOVE_DISTANCE: 30,       // Pixels per move action (base, on floor)
  ROTATE_DEGREES: 30,      // Degrees per rotate action
  BULLET_DAMAGE: 20,

  // Bullet
  BULLET_SPEED: 8,
  BULLET_RADIUS: 3,
  BULLET_MAX_BOUNCES: 1,
  BULLET_MAX_STEPS: 80,    // Max simulation steps for bullet travel

  // Colors
  COLOR_RED: '#e74c3c',
  COLOR_RED_DARK: '#c0392b',
  COLOR_BLUE: '#3498db',
  COLOR_BLUE_DARK: '#2980b9',
  COLOR_GREEN: '#2ecc71',
  COLOR_GREEN_DARK: '#27ae60',
  COLOR_PURPLE: '#9b59b6',
  COLOR_PURPLE_DARK: '#7d3c98',
  COLOR_GROUND: '#1a1a2e',
  COLOR_GRID: 'rgba(255,255,255,0.03)',
  COLOR_BULLET_RED: '#ff6b6b',
  COLOR_BULLET_BLUE: '#74b9ff',

  // Grid
  GRID_SIZE: 40,
};

const MAP_SIZES = {
  small: { width: 600, height: 400 },
  medium: { width: 800, height: 600 },
  large: { width: 1000, height: 700 },
};

/**
 * Terrain types and their properties
 * speedMult: movement distance multiplier (1.0 = normal 30px)
 * passable:  false = cannot enter (like water)
 * hidden:    true = tank is hidden from enemy (forest)
 * color:     canvas fill color
 * label:     display name
 */
const TERRAIN_TYPES = {
  floor:  { speedMult: 1.0,  passable: true,  hidden: false, color: null,                    label: '地板' },
  snow:   { speedMult: 0.6,  passable: true,  hidden: false, color: 'rgba(200,230,255,0.35)', label: '雪地' },
  forest: { speedMult: 0.7,  passable: true,  hidden: true,  color: 'rgba(34,139,34,0.45)',   label: '森林' },
  water:  { speedMult: 0.0,  passable: false, hidden: false, color: 'rgba(30,100,200,0.55)',   label: '河流' },
};
