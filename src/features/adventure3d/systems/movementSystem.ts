import { ADVENTURE_MAP_BOUNDARY } from '@/features/adventure3d/config/gameBalance';
import type { MovementInput, PlayerState, Vec2 } from '@/features/adventure3d/core/types';
import { resolvePositionWithCoralObstacles } from '@/features/adventure3d/systems/coralObstacleSystem';

const PLAYER_COLLISION_RADIUS = 0.82;
const PLAYER_MOVE_SUBSTEP_DISTANCE = PLAYER_COLLISION_RADIUS * 0.52;

export function clampToMap(position: Vec2): Vec2 {
  const dist = Math.hypot(position.x, position.z);
  if (dist <= ADVENTURE_MAP_BOUNDARY || dist <= 0.0001) {
    return position;
  }
  const ratio = ADVENTURE_MAP_BOUNDARY / dist;
  return {
    x: position.x * ratio,
    z: position.z * ratio,
  };
}

function normalizeDirection(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len <= 0.0001) {
    return { x: 0, z: 0 };
  }
  return { x: x / len, z: z / len };
}

export function getMovementDirection(input: MovementInput): Vec2 {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const z = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  return normalizeDirection(x, z);
}

export function stepPlayerMovement(
  player: PlayerState,
  input: MovementInput,
  deltaSec: number,
  cameraYaw: number,
): PlayerState {
  const direction = getMovementDirection(input);
  const isMoving = direction.x !== 0 || direction.z !== 0;
  const speed = input.sprint ? player.sprintSpeed : player.moveSpeed;

  const forward = { x: -Math.sin(cameraYaw), z: -Math.cos(cameraYaw) };
  const right = { x: Math.cos(cameraYaw), z: -Math.sin(cameraYaw) };
  const worldDirection = normalizeDirection(
    right.x * direction.x + forward.x * direction.z,
    right.z * direction.x + forward.z * direction.z,
  );

  let nextPosition = { ...player.position };
  if (isMoving) {
    const travelDistance = speed * Math.max(0, deltaSec);
    const subSteps = Math.max(1, Math.min(14, Math.ceil(travelDistance / PLAYER_MOVE_SUBSTEP_DISTANCE)));
    const stepDistance = travelDistance / subSteps;

    for (let step = 0; step < subSteps; step += 1) {
      const stepPosition = {
        x: nextPosition.x + worldDirection.x * stepDistance,
        z: nextPosition.z + worldDirection.z * stepDistance,
      };
      const clampedPosition = clampToMap(stepPosition);
      const obstacleResolvedPosition = resolvePositionWithCoralObstacles(clampedPosition, PLAYER_COLLISION_RADIUS, 0.16);
      nextPosition = clampToMap(obstacleResolvedPosition);
    }
  }

  const energyDelta = input.sprint && isMoving ? -18 * deltaSec : 13 * deltaSec;
  const nextEnergy = Math.max(0, Math.min(player.maxEnergy, player.energy + energyDelta));
  const nextHeading = isMoving ? Math.atan2(worldDirection.x, worldDirection.z) : player.heading;

  return {
    ...player,
    position: nextPosition,
    heading: nextHeading,
    energy: nextEnergy,
  };
}
