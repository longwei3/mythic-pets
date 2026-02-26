import { ENEMY_BALANCE } from '@/features/adventure3d/config/gameBalance';
import type { EnemyKind, LootState } from '@/features/adventure3d/core/types';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createEmptyLoot(): LootState {
  return {
    myth: 0,
    shell: 0,
    essence: 0,
    relic: 0,
  };
}

export function mergeLoot(base: LootState, patch: Partial<LootState>): LootState {
  return {
    myth: base.myth + (patch.myth || 0),
    shell: base.shell + (patch.shell || 0),
    essence: base.essence + (patch.essence || 0),
    relic: base.relic + (patch.relic || 0),
  };
}

export function rollLootForEnemy(kind: EnemyKind, zone: number): LootState {
  const cfg = ENEMY_BALANCE[kind];
  const myth = randomInt(cfg.mythDropMin, cfg.mythDropMax) + (zone - 1);

  if (kind === 'boss') {
    return {
      myth,
      shell: randomInt(8, 13),
      essence: randomInt(6, 10),
      relic: randomInt(2, 3),
    };
  }

  return {
    myth,
    shell: randomInt(1, 2) + (zone > 1 ? 1 : 0),
    essence: randomInt(0, 1) + (kind === 'crusher' ? 1 : 0),
    relic: zone >= 3 && kind === 'crusher' && Math.random() < 0.18 ? 1 : 0,
  };
}
