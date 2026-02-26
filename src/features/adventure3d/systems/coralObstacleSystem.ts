import { ADVENTURE_MAP_BOUNDARY } from '@/features/adventure3d/config/gameBalance';
import type { Vec2 } from '@/features/adventure3d/core/types';

export interface CoralObstacle {
  id: string;
  position: Vec2;
  radius: number;
  height: number;
}

interface CoralObstacleBlueprint {
  id: string;
  xRatio: number;
  zRatio: number;
  radius: number;
  height: number;
}

const CORAL_OBSTACLE_BLUEPRINTS: CoralObstacleBlueprint[] = [
  { id: 'coral-ob-1', xRatio: -0.48, zRatio: 0.15, radius: 2.2, height: 2.7 },
  { id: 'coral-ob-2', xRatio: -0.34, zRatio: 0.31, radius: 1.8, height: 2.1 },
  { id: 'coral-ob-3', xRatio: -0.21, zRatio: -0.03, radius: 1.9, height: 2.4 },
  { id: 'coral-ob-4', xRatio: -0.08, zRatio: 0.22, radius: 2.1, height: 2.5 },
  { id: 'coral-ob-5', xRatio: 0.07, zRatio: -0.14, radius: 1.7, height: 2.1 },
  { id: 'coral-ob-6', xRatio: 0.22, zRatio: 0.19, radius: 2.4, height: 2.9 },
  { id: 'coral-ob-7', xRatio: 0.36, zRatio: 0.35, radius: 2.05, height: 2.4 },
  { id: 'coral-ob-8', xRatio: 0.44, zRatio: -0.06, radius: 2.25, height: 2.8 },
  { id: 'coral-ob-9', xRatio: 0.3, zRatio: -0.29, radius: 1.95, height: 2.2 },
  { id: 'coral-ob-10', xRatio: -0.12, zRatio: -0.34, radius: 2.15, height: 2.6 },
  { id: 'coral-ob-11', xRatio: -0.38, zRatio: -0.27, radius: 1.82, height: 2.0 },
  { id: 'coral-ob-12', xRatio: 0.02, zRatio: 0.04, radius: 1.55, height: 1.9 },
];
const CORAL_OBSTACLE_RADIUS_SCALE = 1.12;
const CORAL_OBSTACLE_HEIGHT_SCALE = 1.32;

function clampObstacleToMap(position: Vec2, radius: number): Vec2 {
  const limit = Math.max(2, ADVENTURE_MAP_BOUNDARY - radius - 0.8);
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

function angleFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 6283) / 1000;
}

export const CORAL_OBSTACLES: CoralObstacle[] = CORAL_OBSTACLE_BLUEPRINTS.map((blueprint) => {
  const scaledRadius = blueprint.radius * CORAL_OBSTACLE_RADIUS_SCALE;
  const scaledHeight = blueprint.height * CORAL_OBSTACLE_HEIGHT_SCALE;
  const rawPosition = {
    x: blueprint.xRatio * ADVENTURE_MAP_BOUNDARY,
    z: blueprint.zRatio * ADVENTURE_MAP_BOUNDARY,
  };
  return {
    id: blueprint.id,
    position: clampObstacleToMap(rawPosition, scaledRadius),
    radius: scaledRadius,
    height: scaledHeight,
  };
});

export function resolvePositionWithCoralObstacles(
  position: Vec2,
  colliderRadius: number,
  extraPadding = 0.16,
): Vec2 {
  let resolved = { ...position };
  const minColliderRadius = Math.max(0, colliderRadius);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    for (const obstacle of CORAL_OBSTACLES) {
      const dx = resolved.x - obstacle.position.x;
      const dz = resolved.z - obstacle.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = obstacle.radius + minColliderRadius + extraPadding;

      if (dist >= minDist) {
        continue;
      }

      if (dist <= 0.0001) {
        const angle = angleFromId(obstacle.id);
        resolved = {
          x: obstacle.position.x + Math.cos(angle) * minDist,
          z: obstacle.position.z + Math.sin(angle) * minDist,
        };
        continue;
      }

      const nx = dx / dist;
      const nz = dz / dist;
      resolved = {
        x: obstacle.position.x + nx * minDist,
        z: obstacle.position.z + nz * minDist,
      };
    }
  }

  return resolved;
}

export function isPositionBlockedByCoral(position: Vec2, colliderRadius = 0): boolean {
  const safeRadius = Math.max(0, colliderRadius);
  return CORAL_OBSTACLES.some((obstacle) => {
    const minDist = obstacle.radius + safeRadius;
    return Math.hypot(position.x - obstacle.position.x, position.z - obstacle.position.z) <= minDist;
  });
}
