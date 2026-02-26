import {
  ADVENTURE_LAYOUT_SCALE,
  ADVENTURE_MAP_BOUNDARY,
  ENEMY_BALANCE,
  ENEMY_POPULATION_SCALE,
} from '@/features/adventure3d/config/gameBalance';
import type { EnemyKind, EnemyState, Vec2 } from '@/features/adventure3d/core/types';

const ZONE_ENEMY_PATTERNS: Record<number, EnemyKind[]> = {
  1: ['scout', 'scout', 'hunter', 'scout', 'hunter'],
  2: ['hunter', 'hunter', 'crusher', 'hunter', 'crusher'],
  3: ['crusher', 'hunter', 'crusher', 'hunter', 'crusher', 'hunter'],
};

const ZONE_SPAWN_ANCHORS: Record<number, Vec2[]> = {
  1: [
    { x: -12, z: 14 },
    { x: -6, z: 10 },
    { x: 8, z: 14 },
    { x: 14, z: 8 },
    { x: -14, z: 6 },
  ],
  2: [
    { x: -16, z: 2 },
    { x: -7, z: -1 },
    { x: 5, z: 2 },
    { x: 15, z: 0 },
    { x: 0, z: 5 },
  ],
  3: [
    { x: -14, z: -10 },
    { x: -6, z: -14 },
    { x: 4, z: -11 },
    { x: 13, z: -12 },
    { x: 0, z: -7 },
    { x: 18, z: -8 },
  ],
};

function randomOffset(seed = 0): number {
  const base = Math.sin(seed * 12.9898) * 43758.5453;
  return (base - Math.floor(base)) * 1.6 - 0.8;
}

function scaleByZone(value: number, zone: number, kind: EnemyKind): number {
  const zoneScale = 1 + (zone - 1) * 0.22;
  const bossScale = kind === 'boss' ? 1.25 : 1;
  return value * zoneScale * bossScale;
}

function scaleAnchor(anchor: Vec2): Vec2 {
  return {
    x: anchor.x * ADVENTURE_LAYOUT_SCALE,
    z: anchor.z * ADVENTURE_LAYOUT_SCALE,
  };
}

function clampToBoundary(position: Vec2, padding = 2.4): Vec2 {
  const limit = Math.max(4, ADVENTURE_MAP_BOUNDARY - padding);
  const dist = Math.hypot(position.x, position.z);
  if (dist <= limit || dist <= 0.0001) {
    return position;
  }

  const ratio = limit / dist;
  return {
    x: position.x * ratio,
    z: position.z * ratio,
  };
}

function getZoneSpawnCount(zone: number, baseCount: number): number {
  if (zone <= 1) {
    return Math.max(baseCount, Math.round(baseCount * ENEMY_POPULATION_SCALE));
  }
  if (zone === 2) {
    return Math.max(baseCount, Math.round(baseCount * (ENEMY_POPULATION_SCALE + 0.15)));
  }
  return Math.max(baseCount, Math.round(baseCount * (ENEMY_POPULATION_SCALE + 0.28)));
}

function buildScaledZoneAnchor(anchor: Vec2, index: number, total: number, zone: number): Vec2 {
  const scaled = scaleAnchor(anchor);
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + zone * 0.58;
  const radiusBase = (2.3 + zone * 0.85) * ADVENTURE_LAYOUT_SCALE;
  const radiusOsc = radiusBase * (0.58 + ((Math.sin(index * 2.11 + zone * 1.87) + 1) / 2) * 0.62);

  return clampToBoundary({
    x: scaled.x + Math.cos(angle) * radiusOsc,
    z: scaled.z + Math.sin(angle) * radiusOsc,
  });
}

export function createEnemy(kind: EnemyKind, zone: number, index: number, basePosition: Vec2): EnemyState {
  const config = ENEMY_BALANCE[kind];
  const offsetX = randomOffset(zone * 97 + index * 13 + 1);
  const offsetZ = randomOffset(zone * 131 + index * 11 + 3);

  const position = {
    x: basePosition.x + offsetX,
    z: basePosition.z + offsetZ,
  };

  const hp = Math.round(scaleByZone(config.hp, zone, kind));

  return {
    id: `${kind}-${zone}-${index}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    kind,
    zone,
    position,
    spawnPosition: position,
    hp,
    maxHp: hp,
    attack: Math.round(scaleByZone(config.attack, zone, kind)),
    defense: Math.round(scaleByZone(config.defense, zone, kind)),
    speed: scaleByZone(config.speed, zone, kind),
    aggroRange: config.aggroRange + (zone - 1) * 0.7,
    attackRange: config.attackRange,
    attackCooldownMs: config.attackCooldownMs,
    attackWindupMs: config.attackWindupMs,
    state: 'patrol',
    cooldownLeftMs: Math.random() * 500,
    isAlive: true,
    bossSkillCycle: 0,
    activeBossSkill: null,
    telegraphMsLeft: 0,
    telegraphRadius: 0,
    telegraphPowerScale: 1,
    attackPulseMs: 0,
    hitPulseMs: 0,
  };
}

export function createZoneEnemies(zone: number): EnemyState[] {
  const baseKinds = ZONE_ENEMY_PATTERNS[zone] || ZONE_ENEMY_PATTERNS[1];
  const anchors = ZONE_SPAWN_ANCHORS[zone] || ZONE_SPAWN_ANCHORS[1];
  const spawnCount = getZoneSpawnCount(zone, baseKinds.length);

  return Array.from({ length: spawnCount }, (_, index) => {
    const kind = baseKinds[index % baseKinds.length];
    const anchor = anchors[index % anchors.length];
    return createEnemy(kind, zone, index, buildScaledZoneAnchor(anchor, index, spawnCount, zone));
  });
}

export function createBossEnemy(zone = 3): EnemyState {
  return createEnemy('boss', zone, 0, scaleAnchor({ x: 0, z: -19 }));
}
