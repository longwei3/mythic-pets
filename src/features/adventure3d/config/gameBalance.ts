import type { EnemyKind, GatherNodeType, PlayerState } from '@/features/adventure3d/core/types';

export const ADVENTURE_BASE_RADIUS = 28;
export const ADVENTURE_AREA_SCALE = 5;
export const ADVENTURE_MAP_BOUNDARY = Math.round(ADVENTURE_BASE_RADIUS * Math.sqrt(ADVENTURE_AREA_SCALE));
export const ADVENTURE_LAYOUT_SCALE = ADVENTURE_MAP_BOUNDARY / ADVENTURE_BASE_RADIUS;
export const ENEMY_POPULATION_SCALE = Math.max(1, Math.min(ADVENTURE_AREA_SCALE, 2.4));
export const GATHER_POPULATION_SCALE = Math.max(1, Math.min(ADVENTURE_AREA_SCALE, 2.3));

export const ZONE_PROGRESS_KILLS: Record<number, number> = {
  1: 5,
  2: 12,
  3: 18,
};

export const DEFAULT_PLAYER_STATE: PlayerState = {
  position: { x: 0, z: 16 * ADVENTURE_LAYOUT_SCALE },
  heading: 0,
  elevation: 0,
  verticalVelocity: 0,
  isGrounded: true,
  hp: 140,
  maxHp: 140,
  energy: 90,
  maxEnergy: 90,
  level: 1,
  attack: 22,
  defense: 11,
  moveSpeed: 5.6,
  sprintSpeed: 8.2,
  attackRange: 2.4,
  attackCooldownMs: 700,
};

export const PLAYER_JUMP_POWER = 7.6;
export const PLAYER_GRAVITY = 19;
export const PLAYER_PROJECTILE_SPEED = 15.5;
export const PLAYER_PROJECTILE_RADIUS = 0.52;
export const PLAYER_PROJECTILE_TTL_MS = 1600;
export const PLAYER_PROJECTILE_MAX_TARGET_RANGE = 18;

export const ENEMY_BALANCE: Record<EnemyKind, {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  attackWindupMs: number;
  mythDropMin: number;
  mythDropMax: number;
}> = {
  scout: {
    hp: 42,
    attack: 8,
    defense: 4,
    speed: 3.3,
    aggroRange: 8,
    attackRange: 1.7,
    attackCooldownMs: 1350,
    attackWindupMs: 300,
    mythDropMin: 2,
    mythDropMax: 4,
  },
  hunter: {
    hp: 60,
    attack: 11,
    defense: 6,
    speed: 3.0,
    aggroRange: 9,
    attackRange: 1.9,
    attackCooldownMs: 1500,
    attackWindupMs: 350,
    mythDropMin: 3,
    mythDropMax: 5,
  },
  crusher: {
    hp: 95,
    attack: 14,
    defense: 9,
    speed: 2.6,
    aggroRange: 10,
    attackRange: 2.2,
    attackCooldownMs: 1700,
    attackWindupMs: 450,
    mythDropMin: 5,
    mythDropMax: 8,
  },
  boss: {
    hp: 360,
    attack: 22,
    defense: 12,
    speed: 2.2,
    aggroRange: 15,
    attackRange: 3,
    attackCooldownMs: 1500,
    attackWindupMs: 500,
    mythDropMin: 30,
    mythDropMax: 40,
  },
};

export const GATHER_REWARD_BY_TYPE: Record<GatherNodeType, { myth: number; shell: number; essence: number; relic: number }> = {
  pearl: { myth: 2, shell: 1, essence: 1, relic: 0 },
  coral: { myth: 3, shell: 2, essence: 1, relic: 0 },
  relic: { myth: 5, shell: 1, essence: 2, relic: 1 },
};

export const GATHER_INTERACT_RANGE = 2.8;
export const GATHER_COOLDOWN_MS = 900;

export const SCORE_WEIGHTS = {
  kill: 14,
  zone: 85,
  shell: 6,
  essence: 10,
  relic: 28,
  hpRatio: 120,
  durationPenaltyPerMin: 6,
};

export const RUN_RESULT_BONUS = {
  completion: 28,
  failureConsolationMin: 5,
};

export const ATTACK_SFX_PITCH = {
  normal: 240,
  boss: 170,
};
