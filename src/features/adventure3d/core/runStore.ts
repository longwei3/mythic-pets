import {
  ADVENTURE_LAYOUT_SCALE,
  ADVENTURE_MAP_BOUNDARY,
  DEFAULT_PLAYER_STATE,
  GATHER_COOLDOWN_MS,
  PLAYER_GRAVITY,
  PLAYER_JUMP_POWER,
  PLAYER_PROJECTILE_MAX_TARGET_RANGE,
  PLAYER_PROJECTILE_RADIUS,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_PROJECTILE_TTL_MS,
  RUN_RESULT_BONUS,
  SCORE_WEIGHTS,
  ZONE_PROGRESS_KILLS,
} from '@/features/adventure3d/config/gameBalance';
import { createBossEnemy, createZoneEnemies } from '@/features/adventure3d/entities/enemyFactory';
import type {
  AdventureWorldState,
  EnemyProjectionMark,
  EnemyState,
  MovementInput,
  ProjectileState,
  RunState,
  RunSummary,
  TickArgs,
  Vec2,
} from '@/features/adventure3d/core/types';
import { type EnemyProjectileSpawn, updateEnemyAi } from '@/features/adventure3d/systems/enemyAiSystem';
import { isPositionBlockedByCoral } from '@/features/adventure3d/systems/coralObstacleSystem';
import { createGatherNodes, tryGatherAtPosition } from '@/features/adventure3d/systems/gatherSystem';
import { mergeLoot, rollLootForEnemy } from '@/features/adventure3d/systems/lootSystem';
import { stepPlayerMovement } from '@/features/adventure3d/systems/movementSystem';

const ENEMY_PROJECTION_MARK_TTL_MS = 4600;
const SPRINT_ENERGY_COST_PER_SEC = 18;
const OUT_OF_COMBAT_RECOVERY_PER_MIN = 10;

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalizeVec(vec: Vec2): Vec2 {
  const len = Math.hypot(vec.x, vec.z);
  if (len <= 0.0001) {
    return { x: 0, z: 1 };
  }
  return {
    x: vec.x / len,
    z: vec.z / len,
  };
}

function createProjectileId(owner: ProjectileState['owner']): string {
  return `${owner}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getEnemyHitRadius(enemy: EnemyState): number {
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

function hasMovementInput(input: MovementInput): boolean {
  return input.forward || input.backward || input.left || input.right;
}

function isEnemyInCombatState(enemy: EnemyState): boolean {
  return enemy.state === 'alert' || enemy.state === 'chase' || enemy.state === 'attack';
}

function isPlayerInCombat(enemies: EnemyState[], playerPosition: Vec2): boolean {
  return enemies.some((enemy) => {
    if (!isEnemyAlive(enemy)) {
      return false;
    }

    if (isEnemyInCombatState(enemy)) {
      return true;
    }

    const safeAggroRadius = Math.max(enemy.aggroRange + 1.5, enemy.attackRange + 1.5);
    return distance(enemy.position, playerPosition) <= safeAggroRadius;
  });
}

function createProjectileFromEnemySpawn(spawn: EnemyProjectileSpawn): ProjectileState {
  return {
    id: createProjectileId('enemy'),
    owner: 'enemy',
    position: { ...spawn.position },
    velocity: {
      x: spawn.direction.x * spawn.speed,
      z: spawn.direction.z * spawn.speed,
    },
    damage: spawn.damage,
    radius: spawn.radius,
    ttlMs: spawn.ttlMs,
  };
}

function hitPulseDurationMs(enemy: EnemyState): number {
  if (enemy.kind === 'boss') {
    return 520;
  }
  if (enemy.kind === 'crusher') {
    return 360;
  }
  if (enemy.kind === 'hunter') {
    return 300;
  }
  return 260;
}

function createInitialRunState(): RunState {
  return {
    phase: 'idle',
    startedAt: null,
    endedAt: null,
    zone: 1,
    checkpointZone: 1,
    kills: 0,
    bossSpawned: false,
    bossDefeated: false,
    score: 0,
  };
}

export function createInitialWorldState(): AdventureWorldState {
  return {
    run: createInitialRunState(),
    player: {
      ...DEFAULT_PLAYER_STATE,
      position: { ...DEFAULT_PLAYER_STATE.position },
    },
    enemies: [],
    projectiles: [],
    enemyProjectionMarks: [],
    gatherNodes: createGatherNodes(),
    loot: {
      myth: 0,
      shell: 0,
      essence: 0,
      relic: 0,
    },
    targetEnemyId: null,
    message: null,
    lastAttackAt: 0,
    lastGatherAt: 0,
  };
}

export function getCheckpointPosition(zone: number): Vec2 {
  if (zone >= 3) {
    return { x: 0, z: -8 * ADVENTURE_LAYOUT_SCALE };
  }
  if (zone === 2) {
    return { x: 0, z: 4 * ADVENTURE_LAYOUT_SCALE };
  }
  return { x: 0, z: 16 * ADVENTURE_LAYOUT_SCALE };
}

function recalculateScore(state: AdventureWorldState, now: number): AdventureWorldState {
  const startedAt = state.run.startedAt ?? now;
  const durationMinutes = Math.max(0, (now - startedAt) / 60000);
  const hpRatio = state.player.hp / state.player.maxHp;

  const scoreRaw =
    state.run.kills * SCORE_WEIGHTS.kill +
    state.run.zone * SCORE_WEIGHTS.zone +
    state.loot.shell * SCORE_WEIGHTS.shell +
    state.loot.essence * SCORE_WEIGHTS.essence +
    state.loot.relic * SCORE_WEIGHTS.relic +
    hpRatio * SCORE_WEIGHTS.hpRatio -
    durationMinutes * SCORE_WEIGHTS.durationPenaltyPerMin;

  return {
    ...state,
    run: {
      ...state.run,
      score: Math.max(0, Math.round(scoreRaw)),
    },
  };
}

function isEnemyAlive(enemy: EnemyState): boolean {
  return enemy.isAlive && enemy.hp > 0;
}

function findNearestEnemy(enemies: EnemyState[], position: Vec2): EnemyState | null {
  const alive = enemies.filter(isEnemyAlive);
  if (alive.length === 0) {
    return null;
  }

  return alive.reduce((best, enemy) => {
    if (!best) {
      return enemy;
    }
    return distance(enemy.position, position) < distance(best.position, position) ? enemy : best;
  }, null as EnemyState | null);
}

function ensureTargetEnemyId(state: AdventureWorldState): string | null {
  if (state.targetEnemyId) {
    const active = state.enemies.find((enemy) => enemy.id === state.targetEnemyId);
    if (active && isEnemyAlive(active)) {
      return active.id;
    }
  }
  const nearest = findNearestEnemy(state.enemies, state.player.position);
  return nearest?.id || null;
}

function advanceZoneIfNeeded(state: AdventureWorldState): AdventureWorldState {
  if (state.run.zone === 1 && state.run.kills >= ZONE_PROGRESS_KILLS[1]) {
    return {
      ...state,
      run: {
        ...state.run,
        zone: 2,
        checkpointZone: 2,
      },
      enemies: [...state.enemies, ...createZoneEnemies(2)],
      message: 'Zone 2 unlocked',
    };
  }

  if (state.run.zone === 2 && state.run.kills >= ZONE_PROGRESS_KILLS[2]) {
    return {
      ...state,
      run: {
        ...state.run,
        zone: 3,
        checkpointZone: 3,
      },
      enemies: [...state.enemies, ...createZoneEnemies(3)],
      message: 'Zone 3 unlocked',
    };
  }

  if (
    state.run.zone >= 3 &&
    !state.run.bossSpawned &&
    state.run.kills >= ZONE_PROGRESS_KILLS[3]
  ) {
    return {
      ...state,
      run: {
        ...state.run,
        bossSpawned: true,
      },
      enemies: [...state.enemies, createBossEnemy(3)],
      message: 'Boss appeared',
    };
  }

  return state;
}

function settleBossStatus(state: AdventureWorldState, now: number): AdventureWorldState {
  if (!state.run.bossSpawned || state.run.bossDefeated) {
    return state;
  }

  const bossAlive = state.enemies.some((enemy) => enemy.kind === 'boss' && isEnemyAlive(enemy));
  if (bossAlive) {
    return state;
  }

  return {
    ...state,
    run: {
      ...state.run,
      bossDefeated: true,
      phase: 'completed',
      endedAt: now,
    },
    message: 'Boss defeated, return to surface',
  };
}

function applyPlayerDamage(state: AdventureWorldState, incomingDamage: number, now: number): AdventureWorldState {
  if (incomingDamage <= 0) {
    return state;
  }

  const mitigated = Math.max(0, Math.round(incomingDamage - state.player.defense * 0.24));
  if (mitigated <= 0) {
    return state;
  }

  const nextHp = Math.max(0, state.player.hp - mitigated);

  if (nextHp > 0) {
    return {
      ...state,
      player: {
        ...state.player,
        hp: nextHp,
      },
    };
  }

  if (state.run.checkpointZone > 1) {
    return {
      ...state,
      projectiles: [],
      player: {
        ...state.player,
        hp: Math.round(state.player.maxHp * 0.68),
        energy: state.player.maxEnergy,
        position: getCheckpointPosition(state.run.checkpointZone),
        elevation: 0,
        verticalVelocity: 0,
        isGrounded: true,
      },
      run: {
        ...state.run,
        score: Math.max(0, state.run.score - 60),
      },
      message: 'Checkpoint rescue',
    };
  }

  return {
    ...state,
    projectiles: [],
    player: {
      ...state.player,
      hp: 0,
      elevation: 0,
      verticalVelocity: 0,
      isGrounded: true,
    },
    run: {
      ...state.run,
      phase: 'failed',
      endedAt: now,
    },
    message: 'You were defeated',
  };
}

export function startRun(now: number): AdventureWorldState {
  return {
    run: {
      ...createInitialRunState(),
      phase: 'running',
      startedAt: now,
    },
    player: {
      ...DEFAULT_PLAYER_STATE,
      position: { ...DEFAULT_PLAYER_STATE.position },
    },
    enemies: createZoneEnemies(1),
    projectiles: [],
    enemyProjectionMarks: [],
    gatherNodes: createGatherNodes(),
    loot: {
      myth: 0,
      shell: 0,
      essence: 0,
      relic: 0,
    },
    targetEnemyId: null,
    message: 'Expedition started',
    lastAttackAt: 0,
    lastGatherAt: 0,
  };
}

export function pauseRun(state: AdventureWorldState): AdventureWorldState {
  if (state.run.phase !== 'running') {
    return state;
  }
  return {
    ...state,
    run: {
      ...state.run,
      phase: 'paused',
    },
    message: 'Paused',
  };
}

export function resumeRun(state: AdventureWorldState): AdventureWorldState {
  if (state.run.phase !== 'paused') {
    return state;
  }
  return {
    ...state,
    run: {
      ...state.run,
      phase: 'running',
    },
    message: 'Resumed',
  };
}

export function resetRun(): AdventureWorldState {
  return createInitialWorldState();
}

export function cycleTarget(state: AdventureWorldState): AdventureWorldState {
  const alive = state.enemies.filter(isEnemyAlive);
  if (alive.length === 0) {
    return {
      ...state,
      targetEnemyId: null,
      message: 'No target',
    };
  }

  const currentIndex = alive.findIndex((enemy) => enemy.id === state.targetEnemyId);
  const nextEnemy = alive[(currentIndex + 1) % alive.length];

  return {
    ...state,
    targetEnemyId: nextEnemy.id,
    message: `Target: ${nextEnemy.kind}`,
  };
}

export function applyAttack(state: AdventureWorldState, now: number): AdventureWorldState {
  if (state.run.phase !== 'running') {
    return state;
  }

  if (now - state.lastAttackAt < state.player.attackCooldownMs) {
    return state;
  }

  const targetId = ensureTargetEnemyId(state);
  if (!targetId) {
    return {
      ...state,
      message: 'No enemy nearby',
      lastAttackAt: now,
    };
  }

  const targetEnemy = state.enemies.find((enemy) => enemy.id === targetId && isEnemyAlive(enemy));
  if (!targetEnemy) {
    return {
      ...state,
      targetEnemyId: null,
      message: 'Target lost',
      lastAttackAt: now,
    };
  }

  const targetDistance = distance(targetEnemy.position, state.player.position);
  if (targetDistance > PLAYER_PROJECTILE_MAX_TARGET_RANGE) {
    return {
      ...state,
      message: 'Target out of range',
      lastAttackAt: now,
    };
  }

  const direction = normalizeVec({
    x: targetEnemy.position.x - state.player.position.x,
    z: targetEnemy.position.z - state.player.position.z,
  });
  const projectile: ProjectileState = {
    id: createProjectileId('player'),
    owner: 'player',
    position: { ...state.player.position },
    velocity: {
      x: direction.x * PLAYER_PROJECTILE_SPEED,
      z: direction.z * PLAYER_PROJECTILE_SPEED,
    },
    radius: PLAYER_PROJECTILE_RADIUS,
    damage: Math.max(1, Math.round(state.player.attack + Math.random() * 5)),
    ttlMs: PLAYER_PROJECTILE_TTL_MS,
  };

  return {
    ...state,
    projectiles: [...state.projectiles, projectile],
    targetEnemyId: targetEnemy.id,
    lastAttackAt: now,
    player: {
      ...state.player,
      energy: Math.max(0, state.player.energy - 7),
    },
    message: `Fired cannon at ${targetEnemy.kind}`,
  };
}

export function applyGather(state: AdventureWorldState, now: number): AdventureWorldState {
  if (state.run.phase !== 'running') {
    return state;
  }

  if (now - state.lastGatherAt < GATHER_COOLDOWN_MS) {
    return state;
  }

  const result = tryGatherAtPosition(state.gatherNodes, state.player.position);
  if (!result.loot) {
    return {
      ...state,
      lastGatherAt: now,
      message: 'No gather node in range',
    };
  }

  const nextState: AdventureWorldState = {
    ...state,
    gatherNodes: result.nextNodes,
    loot: mergeLoot(state.loot, result.loot),
    lastGatherAt: now,
    message: `Gathered +${result.loot.myth} MYTH`,
  };

  return recalculateScore(nextState, now);
}

export function applyJump(state: AdventureWorldState): AdventureWorldState {
  if (state.run.phase !== 'running') {
    return state;
  }

  if (!state.player.isGrounded) {
    return state;
  }

  return {
    ...state,
    player: {
      ...state.player,
      elevation: Math.max(0, state.player.elevation),
      verticalVelocity: PLAYER_JUMP_POWER,
      isGrounded: false,
    },
    message: 'Jump',
  };
}

function stepProjectiles(
  enemies: EnemyState[],
  player: AdventureWorldState['player'],
  projectiles: ProjectileState[],
  deltaSec: number,
): {
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  incomingDamage: number;
} {
  let nextEnemies = enemies.map((enemy) => ({ ...enemy }));
  let incomingDamage = 0;
  const remainingProjectiles: ProjectileState[] = [];

  for (const projectile of projectiles) {
    const nextTtl = projectile.ttlMs - deltaSec * 1000;
    if (nextTtl <= 0) {
      continue;
    }

    const nextPosition = {
      x: projectile.position.x + projectile.velocity.x * deltaSec,
      z: projectile.position.z + projectile.velocity.z * deltaSec,
    };

    const outOfBounds = Math.hypot(nextPosition.x, nextPosition.z) > ADVENTURE_MAP_BOUNDARY + 2;
    if (outOfBounds) {
      continue;
    }

    if (isPositionBlockedByCoral(nextPosition, projectile.radius)) {
      continue;
    }

    if (projectile.owner === 'player') {
      const hitIndex = nextEnemies.findIndex((enemy) => {
        if (!enemy.isAlive || enemy.hp <= 0) {
          return false;
        }
        const hitDistance = projectile.radius + getEnemyHitRadius(enemy);
        return distance(nextPosition, enemy.position) <= hitDistance;
      });

      if (hitIndex >= 0) {
        const enemy = nextEnemies[hitIndex];
        const rawDamage = Math.max(1, Math.round(projectile.damage - enemy.defense * 0.65));
        const nextHp = Math.max(0, enemy.hp - rawDamage);
        const nextAlive = nextHp > 0;
        nextEnemies[hitIndex] = {
          ...enemy,
          hp: nextHp,
          isAlive: nextAlive,
          state: nextAlive ? 'chase' : 'return',
          activeBossSkill: nextAlive ? enemy.activeBossSkill : null,
          telegraphMsLeft: nextAlive ? enemy.telegraphMsLeft : 0,
          telegraphRadius: nextAlive ? enemy.telegraphRadius : 0,
          telegraphPowerScale: nextAlive ? enemy.telegraphPowerScale : 1,
          attackPulseMs: nextAlive ? enemy.attackPulseMs : 0,
          hitPulseMs: nextAlive ? Math.max(enemy.hitPulseMs, hitPulseDurationMs(enemy)) : 0,
        };
        continue;
      }
    } else {
      const playerHitDistance = projectile.radius + 0.58;
      const canHitPlayer = player.elevation <= 0.95;
      if (canHitPlayer && distance(nextPosition, player.position) <= playerHitDistance) {
        incomingDamage += projectile.damage;
        continue;
      }
    }

    remainingProjectiles.push({
      ...projectile,
      position: nextPosition,
      ttlMs: nextTtl,
    });
  }

  return {
    enemies: nextEnemies,
    projectiles: remainingProjectiles,
    incomingDamage,
  };
}

export function applyTick(state: AdventureWorldState, args: TickArgs): AdventureWorldState {
  if (state.run.phase !== 'running') {
    return state;
  }

  const movementInput: MovementInput = {
    ...args.input,
    sprint: args.input.sprint && state.player.energy > 1,
  };

  const movedPlayer = stepPlayerMovement(
    state.player,
    movementInput,
    args.deltaSec,
    args.cameraYaw,
  );

  let nextElevation = movedPlayer.elevation;
  let nextVerticalVelocity = movedPlayer.verticalVelocity;
  let nextGrounded = movedPlayer.isGrounded;

  if (!nextGrounded || nextElevation > 0 || nextVerticalVelocity !== 0) {
    nextVerticalVelocity -= PLAYER_GRAVITY * args.deltaSec;
    nextElevation = Math.max(0, nextElevation + nextVerticalVelocity * args.deltaSec);

    if (nextElevation <= 0) {
      nextElevation = 0;
      nextVerticalVelocity = 0;
      nextGrounded = true;
    } else {
      nextGrounded = false;
    }
  }

  const movedPlayerWithJump = {
    ...movedPlayer,
    elevation: nextElevation,
    verticalVelocity: nextVerticalVelocity,
    isGrounded: nextGrounded,
  };
  const isSprinting = movementInput.sprint && hasMovementInput(movementInput);
  const sprintEnergyCost = isSprinting ? SPRINT_ENERGY_COST_PER_SEC * args.deltaSec : 0;
  const movedPlayerWithResources = {
    ...movedPlayerWithJump,
    energy: Math.max(0, movedPlayerWithJump.energy - sprintEnergyCost),
  };

  const aiResult = updateEnemyAi(state.enemies, movedPlayerWithResources.position, args.deltaSec);
  const projectilesForStep = [
    ...state.projectiles,
    ...aiResult.spawnedProjectiles.map(createProjectileFromEnemySpawn),
  ];
  const projectileStep = stepProjectiles(
    aiResult.enemies,
    movedPlayerWithResources,
    projectilesForStep,
    args.deltaSec,
  );
  const previousAliveById = new Map(state.enemies.map((enemy) => [enemy.id, enemy.isAlive]));
  const newlyDefeated = projectileStep.enemies.filter(
    (enemy) => previousAliveById.get(enemy.id) && !enemy.isAlive,
  );
  const nextProjectionMarks: EnemyProjectionMark[] = [
    ...state.enemyProjectionMarks
      .map((mark) => ({
        ...mark,
        ttlMs: mark.ttlMs - args.deltaSec * 1000,
      }))
      .filter((mark) => mark.ttlMs > 0),
    ...newlyDefeated.map((enemy) => ({
      id: `dead-shadow-${enemy.id}-${args.now}`,
      position: { ...enemy.position },
      ttlMs: ENEMY_PROJECTION_MARK_TTL_MS,
    })),
  ];

  const droppedLoot = newlyDefeated.reduce((acc, enemy) => mergeLoot(acc, rollLootForEnemy(enemy.kind, enemy.zone)), {
    myth: 0,
    shell: 0,
    essence: 0,
    relic: 0,
  });

  const withDamage = applyPlayerDamage(
    {
      ...state,
      player: movedPlayerWithResources,
      enemies: projectileStep.enemies,
      projectiles: projectileStep.projectiles,
      enemyProjectionMarks: nextProjectionMarks,
      loot: mergeLoot(state.loot, droppedLoot),
      run: {
        ...state.run,
        kills: state.run.kills + newlyDefeated.length,
      },
    },
    aiResult.damageToPlayer + projectileStep.incomingDamage,
    args.now,
  );

  const canRecover = withDamage.run.phase === 'running' && !isPlayerInCombat(withDamage.enemies, withDamage.player.position);
  const passiveRecoverPerSec = OUT_OF_COMBAT_RECOVERY_PER_MIN / 60;
  const recoveredPlayer = canRecover
    ? {
        ...withDamage.player,
        hp: Math.min(withDamage.player.maxHp, withDamage.player.hp + passiveRecoverPerSec * args.deltaSec),
        energy: Math.min(
          withDamage.player.maxEnergy,
          withDamage.player.energy + passiveRecoverPerSec * args.deltaSec,
        ),
      }
    : withDamage.player;

  const targetEnemyId = ensureTargetEnemyId(withDamage);
  const aliveEnemies = withDamage.enemies.filter(isEnemyAlive);

  let nextState: AdventureWorldState = {
    ...withDamage,
    player: recoveredPlayer,
    enemies: aliveEnemies,
    targetEnemyId,
  };

  nextState = advanceZoneIfNeeded(nextState);
  nextState = settleBossStatus(nextState, args.now);
  nextState = recalculateScore(nextState, args.now);

  return nextState;
}

export function computeRunSummary(state: AdventureWorldState, now: number): RunSummary {
  const endedAt = state.run.endedAt ?? now;
  const startedAt = state.run.startedAt ?? endedAt;
  const durationMs = Math.max(0, endedAt - startedAt);

  const completionBonus = state.run.phase === 'completed' ? RUN_RESULT_BONUS.completion : 0;
  const consolation = state.run.phase === 'failed' ? RUN_RESULT_BONUS.failureConsolationMin : 0;
  const mythReward = Math.max(0, Math.round(state.loot.myth + state.run.score / 100 + completionBonus + consolation));

  return {
    completed: state.run.phase === 'completed',
    score: state.run.score,
    durationMs,
    zone: state.run.zone,
    kills: state.run.kills,
    mythReward,
  };
}
