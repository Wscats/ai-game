/**
 * constants.js - Game constants for turn-based tank battle
 */
const CONST = {
  // Tank
  TANK_SIZE: 30,
  TANK_HP: 100,
  MOVE_DISTANCE: 30,       // Pixels per move action
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
