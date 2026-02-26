import {
  ADVENTURE_LAYOUT_SCALE,
  ADVENTURE_MAP_BOUNDARY,
  GATHER_INTERACT_RANGE,
  GATHER_POPULATION_SCALE,
  GATHER_REWARD_BY_TYPE,
} from '@/features/adventure3d/config/gameBalance';
import type { GatherNode, GatherNodeType, LootState, Vec2 } from '@/features/adventure3d/core/types';

const ZONE_GATHER_SPAWNS: Record<number, Vec2[]> = {
  1: [
    { x: -10, z: 18 },
    { x: -2, z: 12 },
    { x: 9, z: 17 },
  ],
  2: [
    { x: -16, z: -1 },
    { x: -3, z: 1 },
    { x: 12, z: 0 },
  ],
  3: [
    { x: -9, z: -16 },
    { x: 2, z: -19 },
    { x: 15, z: -14 },
  ],
};

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nodeTypeByZone(zone: number, index: number): GatherNodeType {
  if (zone >= 3 && index % 2 === 0) {
    return 'relic';
  }
  if (zone >= 2) {
    return index % 2 === 0 ? 'coral' : 'pearl';
  }
  return 'pearl';
}

function scaleAnchor(anchor: Vec2): Vec2 {
  return {
    x: anchor.x * ADVENTURE_LAYOUT_SCALE,
    z: anchor.z * ADVENTURE_LAYOUT_SCALE,
  };
}

function clampToBoundary(position: Vec2, padding = 1.8): Vec2 {
  const limit = Math.max(3.2, ADVENTURE_MAP_BOUNDARY - padding);
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

function getZoneNodeCount(zone: number, baseCount: number): number {
  if (zone <= 1) {
    return Math.max(baseCount, Math.round(baseCount * GATHER_POPULATION_SCALE));
  }
  if (zone === 2) {
    return Math.max(baseCount, Math.round(baseCount * (GATHER_POPULATION_SCALE + 0.12)));
  }
  return Math.max(baseCount, Math.round(baseCount * (GATHER_POPULATION_SCALE + 0.24)));
}

function buildScaledNodeAnchor(anchor: Vec2, index: number, total: number, zone: number): Vec2 {
  const scaled = scaleAnchor(anchor);
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + zone * 0.44;
  const radiusBase = (1.8 + zone * 0.72) * ADVENTURE_LAYOUT_SCALE;
  const radiusOsc = radiusBase * (0.55 + ((Math.sin(index * 1.73 + zone * 1.41) + 1) / 2) * 0.68);

  return clampToBoundary({
    x: scaled.x + Math.cos(angle) * radiusOsc,
    z: scaled.z + Math.sin(angle) * radiusOsc,
  });
}

export function createGatherNodes(): GatherNode[] {
  const nodes: GatherNode[] = [];

  Object.entries(ZONE_GATHER_SPAWNS).forEach(([zoneText, baseAnchors]) => {
    const zone = Number.parseInt(zoneText, 10);
    const nodeCount = getZoneNodeCount(zone, baseAnchors.length);

    Array.from({ length: nodeCount }, (_, index) => {
      const anchor = baseAnchors[index % baseAnchors.length];
      const position = buildScaledNodeAnchor(anchor, index, nodeCount, zone);
      nodes.push({
        id: `gather-${zone}-${index}`,
        zone,
        type: nodeTypeByZone(zone, index),
        position,
        collected: false,
      });
    });
  });

  return nodes;
}

export function tryGatherAtPosition(nodes: GatherNode[], playerPosition: Vec2): {
  nextNodes: GatherNode[];
  loot?: LootState;
} {
  const candidate = nodes.find((node) => !node.collected && distance(node.position, playerPosition) <= GATHER_INTERACT_RANGE);

  if (!candidate) {
    return { nextNodes: nodes };
  }

  const nextNodes = nodes.map((node) =>
    node.id === candidate.id
      ? {
          ...node,
          collected: true,
        }
      : node,
  );

  return {
    nextNodes,
    loot: GATHER_REWARD_BY_TYPE[candidate.type],
  };
}
