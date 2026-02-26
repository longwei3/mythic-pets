import type { BossSkillType, EnemyState, Vec2 } from '@/features/adventure3d/core/types';
import { ADVENTURE_MAP_BOUNDARY } from '@/features/adventure3d/config/gameBalance';
import { resolvePositionWithCoralObstacles } from '@/features/adventure3d/systems/coralObstacleSystem';

interface EnemyTickResult {
  enemies: EnemyState[];
  damageToPlayer: number;
  spawnedProjectiles: EnemyProjectileSpawn[];
}

interface BossSkillConfig {
  type: BossSkillType;
  radius: number;
  windupMs: number;
  powerScale: number;
  cooldownExtraMs: number;
}

export interface EnemyProjectileSpawn {
  sourceEnemyId: string;
  position: Vec2;
  direction: Vec2;
  damage: number;
  speed: number;
  radius: number;
  ttlMs: number;
}

const BOSS_SKILL_SEQUENCE: BossSkillConfig[] = [
  {
    type: 'clawSweep',
    radius: 2.9,
    windupMs: 650,
    powerScale: 1,
    cooldownExtraMs: 260,
  },
  {
    type: 'shockSlam',
    radius: 4.4,
    windupMs: 900,
    powerScale: 1.22,
    cooldownExtraMs: 460,
  },
  {
    type: 'tidalBurst',
    radius: 6.2,
    windupMs: 1150,
    powerScale: 0.95,
    cooldownExtraMs: 720,
  },
];

function getBossSkill(cycle: number): BossSkillConfig {
  return BOSS_SKILL_SEQUENCE[cycle % BOSS_SKILL_SEQUENCE.length];
}

function attackPulseDurationMs(enemy: EnemyState): number {
  if (enemy.kind === 'boss') {
    return 620;
  }
  if (enemy.kind === 'crusher') {
    return 360;
  }
  if (enemy.kind === 'hunter') {
    return 300;
  }
  return 240;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function moveTowards(current: Vec2, target: Vec2, speed: number, deltaSec: number): Vec2 {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.0001) {
    return current;
  }

  const maxStep = speed * deltaSec;
  if (len <= maxStep) {
    return target;
  }

  return {
    x: current.x + (dx / len) * maxStep,
    z: current.z + (dz / len) * maxStep,
  };
}

function getEnemyCollisionRadius(enemy: EnemyState): number {
  if (enemy.kind === 'boss') {
    return 1.35;
  }
  if (enemy.kind === 'crusher') {
    return 0.78;
  }
  if (enemy.kind === 'hunter') {
    return 0.68;
  }
  return 0.6;
}

function clampEnemyPosition(position: Vec2, radius: number): Vec2 {
  const limit = Math.max(2, ADVENTURE_MAP_BOUNDARY - radius);
  const dist = Math.hypot(position.x, position.z);
  const boundaryClamped =
    dist <= limit || dist <= 0.0001
      ? position
      : {
          x: position.x * (limit / dist),
          z: position.z * (limit / dist),
        };
  const obstacleResolved = resolvePositionWithCoralObstacles(boundaryClamped, radius, 0.08);
  const postDist = Math.hypot(obstacleResolved.x, obstacleResolved.z);
  if (postDist <= limit || postDist <= 0.0001) {
    return obstacleResolved;
  }
  const ratio = limit / postDist;
  return {
    x: obstacleResolved.x * ratio,
    z: obstacleResolved.z * ratio,
  };
}

function resolveEnemyOverlap(enemies: EnemyState[]): EnemyState[] {
  const resolved = enemies.map((enemy) => ({
    ...enemy,
    position: { ...enemy.position },
  }));

  for (let iteration = 0; iteration < 2; iteration += 1) {
    for (let i = 0; i < resolved.length; i += 1) {
      const current = resolved[i];
      if (!current.isAlive || current.hp <= 0) {
        continue;
      }

      for (let j = i + 1; j < resolved.length; j += 1) {
        const other = resolved[j];
        if (!other.isAlive || other.hp <= 0) {
          continue;
        }

        const dx = other.position.x - current.position.x;
        const dz = other.position.z - current.position.z;
        const dist = Math.hypot(dx, dz);
        const minDistance = getEnemyCollisionRadius(current) + getEnemyCollisionRadius(other);

        if (dist >= minDistance) {
          continue;
        }

        const nx = dist > 0.0001 ? dx / dist : 1;
        const nz = dist > 0.0001 ? dz / dist : 0;
        const push = (minDistance - dist) / 2;

        current.position = {
          x: current.position.x - nx * push,
          z: current.position.z - nz * push,
        };
        other.position = {
          x: other.position.x + nx * push,
          z: other.position.z + nz * push,
        };
      }
    }
  }

  return resolved.map((enemy) => ({
    ...enemy,
    position: clampEnemyPosition(enemy.position, getEnemyCollisionRadius(enemy)),
  }));
}

export function updateEnemyAi(enemies: EnemyState[], playerPosition: Vec2, deltaSec: number): EnemyTickResult {
  let damageToPlayer = 0;
  const spawnedProjectiles: EnemyProjectileSpawn[] = [];

  const nextEnemies = enemies.map((enemy) => {
    if (!enemy.isAlive || enemy.hp <= 0) {
      return {
        ...enemy,
        hp: 0,
        isAlive: false,
        activeBossSkill: null,
        telegraphMsLeft: 0,
        telegraphRadius: 0,
      };
    }

    const distToPlayer = distance(enemy.position, playerPosition);
    let state = enemy.state;
    let nextPosition = enemy.position;
    let cooldownLeftMs = Math.max(0, enemy.cooldownLeftMs - deltaSec * 1000);

    let bossSkillCycle = enemy.bossSkillCycle;
    let activeBossSkill = enemy.activeBossSkill;
    let telegraphMsLeft = Math.max(0, enemy.telegraphMsLeft - deltaSec * 1000);
    let telegraphRadius = enemy.telegraphRadius;
    let telegraphPowerScale = enemy.telegraphPowerScale;
    let attackPulseMs = Math.max(0, enemy.attackPulseMs - deltaSec * 1000);
    const hitPulseMs = Math.max(0, enemy.hitPulseMs - deltaSec * 1000);

    if (distToPlayer <= enemy.attackRange) {
      state = 'attack';
    } else if (distToPlayer <= enemy.aggroRange) {
      state = distToPlayer <= enemy.aggroRange * 0.65 ? 'chase' : 'alert';
    } else if (distance(enemy.position, enemy.spawnPosition) > 0.6) {
      state = 'return';
    } else {
      state = 'patrol';
    }

    if (state === 'alert' || state === 'chase') {
      nextPosition = moveTowards(enemy.position, playerPosition, enemy.speed, deltaSec);
    }

    if (state === 'return') {
      nextPosition = moveTowards(enemy.position, enemy.spawnPosition, enemy.speed * 0.85, deltaSec);
    }

    if (enemy.kind === 'boss') {
      if (state !== 'attack') {
        activeBossSkill = null;
        telegraphMsLeft = 0;
        telegraphRadius = 0;
        telegraphPowerScale = 1;
      } else {
        if (activeBossSkill && telegraphMsLeft <= 0) {
          if (distToPlayer <= telegraphRadius) {
            const toPlayerX = playerPosition.x - enemy.position.x;
            const toPlayerZ = playerPosition.z - enemy.position.z;
            const len = Math.hypot(toPlayerX, toPlayerZ);
            const direction =
              len > 0.0001
                ? { x: toPlayerX / len, z: toPlayerZ / len }
                : { x: 0, z: 1 };

            spawnedProjectiles.push({
              sourceEnemyId: enemy.id,
              position: { ...enemy.position },
              direction,
              damage: Math.round(enemy.attack * telegraphPowerScale),
              speed: 11.5,
              radius: 0.78,
              ttlMs: 1900,
            });
          }
          attackPulseMs = attackPulseDurationMs(enemy);
          const finishedSkill = getBossSkill(bossSkillCycle);
          cooldownLeftMs = enemy.attackCooldownMs + finishedSkill.cooldownExtraMs;
          bossSkillCycle += 1;
          activeBossSkill = null;
          telegraphRadius = 0;
          telegraphPowerScale = 1;
          telegraphMsLeft = 0;
        }

        if (!activeBossSkill && cooldownLeftMs <= 0) {
          const nextSkill = getBossSkill(bossSkillCycle);
          activeBossSkill = nextSkill.type;
          telegraphMsLeft = nextSkill.windupMs;
          telegraphRadius = nextSkill.radius;
          telegraphPowerScale = nextSkill.powerScale;
        }
      }
    } else if (state === 'attack' && cooldownLeftMs <= 0) {
      const toPlayerX = playerPosition.x - enemy.position.x;
      const toPlayerZ = playerPosition.z - enemy.position.z;
      const len = Math.hypot(toPlayerX, toPlayerZ);
      const direction =
        len > 0.0001
          ? { x: toPlayerX / len, z: toPlayerZ / len }
          : { x: 0, z: 1 };

      spawnedProjectiles.push({
        sourceEnemyId: enemy.id,
        position: { ...enemy.position },
        direction,
        damage: enemy.attack,
        speed: 10.8,
        radius: 0.54,
        ttlMs: 1800,
      });
      attackPulseMs = attackPulseDurationMs(enemy);
      cooldownLeftMs = enemy.attackCooldownMs + Math.random() * enemy.attackWindupMs;
    }

    return {
      ...enemy,
      state,
      position: nextPosition,
      cooldownLeftMs,
      bossSkillCycle,
      activeBossSkill,
      telegraphMsLeft,
      telegraphRadius,
      telegraphPowerScale,
      attackPulseMs,
      hitPulseMs,
    };
  });

  return {
    enemies: resolveEnemyOverlap(nextEnemies),
    damageToPlayer,
    spawnedProjectiles,
  };
}
