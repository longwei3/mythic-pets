'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Clone, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Group, Material, Mesh, Object3D } from 'three';
import { Box3, Color, Vector3 } from 'three';
import { getCheckpointPosition } from '@/features/adventure3d/core/runStore';
import { ADVENTURE_MAP_BOUNDARY } from '@/features/adventure3d/config/gameBalance';
import { CORAL_OBSTACLES } from '@/features/adventure3d/systems/coralObstacleSystem';
import type {
  BossSkillType,
  CameraViewMode,
  EnemyProjectionMark,
  EnemyState,
  GatherNode,
  PlayerState,
  ProjectileState,
  QualityMode,
  Vec2,
} from '@/features/adventure3d/core/types';

interface AdventureSceneProps {
  player: PlayerState;
  enemies: EnemyState[];
  enemyProjectionMarks: EnemyProjectionMark[];
  gatherNodes: GatherNode[];
  projectiles: ProjectileState[];
  activeTargetId: string | null;
  zone: number;
  checkpointZone: number;
  quality: QualityMode;
  cameraSensitivity: number;
  gameMode: boolean;
  viewMode: CameraViewMode;
  engageHint: string;
  onEngageGameMode: () => void;
  onPrimaryFire: () => void;
  onCameraYawChange: (yaw: number) => void;
}

const SEA_MODEL_PATHS = {
  scout: '/models/adventure3d/barramundi-fish.glb',
  hunter: '/models/adventure3d/reef-duck.glb',
  crusher: '/models/adventure3d/reef-fox.glb',
  boss: '/models/adventure3d/sea-dragon.glb',
} as const;

const NPC_MODEL_TARGET_SIZE = 1.34;

function colorByEnemy(enemy: EnemyState): string {
  if (enemy.kind === 'boss') {
    return '#f97316';
  }
  if (enemy.kind === 'crusher') {
    return '#f43f5e';
  }
  if (enemy.kind === 'hunter') {
    return '#f59e0b';
  }
  return '#38bdf8';
}

function enemyProjectionRadius(enemy: EnemyState): number {
  if (enemy.kind === 'boss') {
    return 1.5;
  }
  if (enemy.kind === 'crusher') {
    return 1.02;
  }
  if (enemy.kind === 'hunter') {
    return 0.92;
  }
  return 0.86;
}

function colorByGather(type: GatherNode['type']): string {
  if (type === 'relic') {
    return '#fbbf24';
  }
  if (type === 'coral') {
    return '#22d3ee';
  }
  return '#a78bfa';
}

function bossSkillLabel(skill: BossSkillType | null): string {
  if (skill === 'clawSweep') {
    return 'Claw Sweep';
  }
  if (skill === 'shockSlam') {
    return 'Shock Slam';
  }
  if (skill === 'tidalBurst') {
    return 'Tidal Burst';
  }
  return '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pseudoNoise(index: number, seed: number): number {
  const raw = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function attackPulseDurationByKind(kind: EnemyState['kind']): number {
  if (kind === 'boss') {
    return 620;
  }
  if (kind === 'crusher') {
    return 360;
  }
  if (kind === 'hunter') {
    return 300;
  }
  return 240;
}

function hitPulseDurationByKind(kind: EnemyState['kind']): number {
  if (kind === 'boss') {
    return 520;
  }
  if (kind === 'crusher') {
    return 360;
  }
  if (kind === 'hunter') {
    return 300;
  }
  return 260;
}

function CameraRig({
  playerPosition,
  yaw,
  pitch,
  viewMode,
  playerElevation,
}: {
  playerPosition: Vec2;
  yaw: number;
  pitch: number;
  viewMode: CameraViewMode;
  playerElevation: number;
}) {
  const { camera } = useThree();

  useFrame((_, delta) => {
    const clampedPitch = clamp(pitch, -0.52, 1.08);
    const forward = {
      x: -Math.sin(yaw) * Math.cos(clampedPitch),
      y: Math.sin(clampedPitch),
      z: -Math.cos(yaw) * Math.cos(clampedPitch),
    };

    if (viewMode === 'fps') {
      const eye = {
        x: playerPosition.x,
        y: 1.32 + playerElevation,
        z: playerPosition.z,
      };
      const lookTarget = {
        x: eye.x + forward.x * 8,
        y: eye.y + forward.y * 8,
        z: eye.z + forward.z * 8,
      };
      const factor = 1 - Math.exp(-delta * 14);
      const nextX = camera.position.x + (eye.x - camera.position.x) * factor;
      const nextY = camera.position.y + (eye.y - camera.position.y) * factor;
      const nextZ = camera.position.z + (eye.z - camera.position.z) * factor;
      camera.position.set(nextX, nextY, nextZ);
      camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
      return;
    }

    const distance = 9.8;
    const shoulderOffset = 0.95;
    const follow = {
      x: playerPosition.x - forward.x * distance + Math.cos(yaw) * shoulderOffset,
      y: 2.25 + playerElevation + Math.sin(clampedPitch) * 1.8,
      z: playerPosition.z - forward.z * distance + Math.sin(yaw) * shoulderOffset,
    };

    const lookTarget = {
      x: playerPosition.x + forward.x * 6,
      y: 1 + playerElevation + forward.y * 2.3,
      z: playerPosition.z + forward.z * 6,
    };

    const factor = 1 - Math.exp(-delta * 8.8);
    const nextX = camera.position.x + (follow.x - camera.position.x) * factor;
    const nextY = camera.position.y + (follow.y - camera.position.y) * factor;
    const nextZ = camera.position.z + (follow.z - camera.position.z) * factor;
    camera.position.set(nextX, nextY, nextZ);
    camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
  });

  return null;
}

function SeaParticles({ count }: { count: number }) {
  const groupRef = useRef<Group>(null);
  const span = ADVENTURE_MAP_BOUNDARY * 1.9;
  const half = span / 2;
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: ((i * 13) % span) - half,
      y: 0.5 + ((i * 7) % 18) * 0.22,
      z: ((i * 19) % span) - half,
      s: 0.03 + ((i * 11) % 4) * 0.02,
      p: i * 0.37,
    }));
  }, [count, half, span]);

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.04;
    groupRef.current.position.y = Math.sin(t * 0.42) * 0.08;
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, index) => (
        <mesh key={`particle-${index}`} position={[p.x, p.y + Math.sin(p.p) * 0.14, p.z]}>
          <sphereGeometry args={[p.s, 6, 6]} />
          <meshStandardMaterial color="#93c5fd" emissive="#22d3ee" emissiveIntensity={0.4} transparent opacity={0.48} />
        </mesh>
      ))}
    </group>
  );
}

function EdgeWaterBelt() {
  const primaryRingRef = useRef<Group>(null);
  const secondaryRingRef = useRef<Group>(null);
  const foamRingRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (primaryRingRef.current) {
      primaryRingRef.current.rotation.y = t * 0.05;
      primaryRingRef.current.position.y = -0.01 + Math.sin(t * 0.55) * 0.015;
    }
    if (secondaryRingRef.current) {
      secondaryRingRef.current.rotation.y = -t * 0.07;
      secondaryRingRef.current.position.y = 0.02 + Math.sin(t * 0.72 + 0.8) * 0.012;
    }
    if (foamRingRef.current) {
      foamRingRef.current.rotation.y = t * 0.11;
      foamRingRef.current.position.y = 0.035 + Math.sin(t * 1.2) * 0.01;
    }
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <ringGeometry args={[ADVENTURE_MAP_BOUNDARY * 0.96, ADVENTURE_MAP_BOUNDARY + 7.8, 160]} />
        <meshStandardMaterial color="#0b3d6e" emissive="#082f49" emissiveIntensity={0.24} roughness={0.88} transparent opacity={0.92} />
      </mesh>

      <group ref={primaryRingRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[ADVENTURE_MAP_BOUNDARY - 0.5, ADVENTURE_MAP_BOUNDARY + 2.4, 160]} />
          <meshStandardMaterial color="#1d4ed8" emissive="#1e3a8a" emissiveIntensity={0.26} roughness={0.52} transparent opacity={0.38} />
        </mesh>
      </group>

      <group ref={secondaryRingRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[ADVENTURE_MAP_BOUNDARY + 1.8, ADVENTURE_MAP_BOUNDARY + 6.4, 160]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.2} roughness={0.5} transparent opacity={0.24} />
        </mesh>
      </group>

      <group ref={foamRingRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[ADVENTURE_MAP_BOUNDARY - 0.18, ADVENTURE_MAP_BOUNDARY + 0.55, 160]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={0.36} />
        </mesh>
      </group>
    </group>
  );
}

function ZoneRings({ activeZone }: { activeZone: number }) {
  const zoneRadius = [
    ADVENTURE_MAP_BOUNDARY * 0.33,
    ADVENTURE_MAP_BOUNDARY * 0.56,
    ADVENTURE_MAP_BOUNDARY * 0.82,
  ];

  return (
    <group>
      {[1, 2, 3].map((zone, index) => (
        <mesh key={`zone-ring-${zone}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <torusGeometry args={[zoneRadius[index], 0.12, 12, 120]} />
          <meshBasicMaterial color={zone <= activeZone ? '#34d399' : '#334155'} transparent opacity={0.65} />
        </mesh>
      ))}
    </group>
  );
}

function SeafloorDecor({ quality }: { quality: QualityMode }) {
  const count = quality === 'high' ? 92 : 46;
  const grassCount = quality === 'high' ? 64 : 28;
  const causticBands = quality === 'high' ? 4 : 2;

  const rocks = useMemo(() => {
    return Array.from({ length: count }, (_, index) => {
      const angle = pseudoNoise(index, 0.32) * Math.PI * 2;
      const radius = Math.sqrt(pseudoNoise(index, 0.66)) * ADVENTURE_MAP_BOUNDARY * 0.9;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.12 + pseudoNoise(index, 0.91) * 0.34;
      const height = 0.08 + pseudoNoise(index, 1.2) * 0.3;
      const rotY = pseudoNoise(index, 1.73) * Math.PI;
      const tint = pseudoNoise(index, 2.11);
      return { x, z, scale, height, rotY, tint };
    });
  }, [count]);

  const seaweed = useMemo(() => {
    return Array.from({ length: grassCount }, (_, index) => {
      const angle = pseudoNoise(index, 2.94) * Math.PI * 2;
      const radius = Math.sqrt(pseudoNoise(index, 3.12)) * ADVENTURE_MAP_BOUNDARY * 0.84;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 0.48 + pseudoNoise(index, 3.66) * 0.66;
      const sway = 0.08 + pseudoNoise(index, 4.22) * 0.18;
      const rotY = pseudoNoise(index, 5.01) * Math.PI * 2;
      return { x, z, height, sway, rotY, phase: index * 0.37 };
    });
  }, [grassCount]);

  const causticRefs = useRef<Array<Group | null>>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    causticRefs.current.forEach((ref, index) => {
      if (!ref) {
        return;
      }
      const dir = index % 2 === 0 ? 1 : -1;
      ref.rotation.y = dir * t * (0.05 + index * 0.012);
      ref.position.y = 0.035 + Math.sin(t * (0.7 + index * 0.15)) * 0.015;
    });
  });

  return (
    <group>
      {rocks.map((rock, index) => (
        <mesh
          key={`floor-rock-${index}`}
          castShadow
          receiveShadow
          position={[rock.x, rock.height * 0.5, rock.z]}
          rotation={[0, rock.rotY, 0]}
          scale={[rock.scale, rock.height, rock.scale]}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={rock.tint > 0.55 ? '#0f766e' : '#115e59'}
            emissive={rock.tint > 0.75 ? '#155e75' : '#0f3f46'}
            emissiveIntensity={0.09}
            roughness={0.86}
            metalness={0.05}
          />
        </mesh>
      ))}

      {seaweed.map((grass, index) => (
        <group
          key={`floor-seaweed-${index}`}
          position={[grass.x, grass.height * 0.5, grass.z]}
          rotation={[Math.sin(grass.phase) * grass.sway, grass.rotY, 0]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[0.03, 0.05, grass.height, 7]} />
            <meshStandardMaterial color="#22c55e" emissive="#0f766e" emissiveIntensity={0.12} roughness={0.5} />
          </mesh>
          <mesh position={[0, grass.height * 0.38, 0.04]} castShadow>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color="#4ade80" emissive="#14532d" emissiveIntensity={0.18} roughness={0.44} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: causticBands }, (_, index) => {
        const inner = ADVENTURE_MAP_BOUNDARY * (0.22 + index * 0.14);
        const outer = inner + ADVENTURE_MAP_BOUNDARY * 0.1;
        return (
          <group
            key={`caustic-band-${index}`}
            ref={(node) => {
              causticRefs.current[index] = node;
            }}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
              <ringGeometry args={[inner, outer, 96]} />
              <meshBasicMaterial color="#67e8f9" transparent opacity={0.08} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function LobsterClaw({ side }: { side: -1 | 1 }) {
  const sideRotation = side * 0.24;
  const sideOffset = side * 1.02;
  const clawRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!clawRef.current) {
      return;
    }
    const t = clock.elapsedTime * 4.6 + (side === 1 ? 0.4 : 0);
    clawRef.current.rotation.x = Math.sin(t) * 0.08;
    clawRef.current.rotation.z = side * (0.12 + Math.sin(t * 0.7) * 0.1);
  });

  return (
    <group ref={clawRef} position={[sideOffset, 0.08, 0.22]} rotation={[0, sideRotation, side * 0.12]}>
      <mesh position={[side * 0.28, 0.02, 0.08]} rotation={[0, 0, side * 0.34]} castShadow>
        <cylinderGeometry args={[0.08, 0.07, 0.56, 10]} />
        <meshStandardMaterial color="#ef4444" roughness={0.42} />
      </mesh>

      <mesh position={[side * 0.62, 0.12, 0.14]} rotation={[0, side * 0.2, side * 0.25]} castShadow>
        <capsuleGeometry args={[0.11, 0.24, 4, 10]} />
        <meshStandardMaterial color="#fb7185" roughness={0.4} />
      </mesh>

      <mesh position={[side * 0.68, -0.06, 0.12]} rotation={[0, side * 0.2, side * -0.18]} castShadow>
        <capsuleGeometry args={[0.1, 0.2, 4, 10]} />
        <meshStandardMaterial color="#fb7185" roughness={0.4} />
      </mesh>

      <mesh position={[side * 0.78, 0.03, 0.18]} castShadow>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshStandardMaterial color="#be123c" emissive="#7f1d1d" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function LobsterLeg({ side, index }: { side: -1 | 1; index: number }) {
  const legRef = useRef<Group>(null);
  const z = 0.06 - index * 0.34;
  const x = side * (0.4 + index * 0.14);
  const y = 0.04 - index * 0.01;

  useFrame(({ clock }) => {
    if (!legRef.current) {
      return;
    }
    const t = clock.elapsedTime * 5.5 + index * 0.92 + (side === 1 ? 0.55 : 0);
    legRef.current.rotation.x = Math.sin(t) * 0.22;
    legRef.current.rotation.y = side * (0.22 + index * 0.05);
    legRef.current.rotation.z = side * (0.78 + Math.sin(t + 0.4) * 0.16);
    legRef.current.position.y = y + Math.sin(t) * 0.012;
  });

  return (
    <group ref={legRef} position={[x, y, z]}>
      <mesh castShadow position={[side * 0.16, 0, 0.05]}>
        <capsuleGeometry args={[0.03, 0.34, 4, 8]} />
        <meshStandardMaterial color="#f87171" roughness={0.44} />
      </mesh>
      <mesh castShadow position={[side * 0.28, -0.08, 0.12]} rotation={[0, 0, side * 0.2]}>
        <capsuleGeometry args={[0.025, 0.24, 4, 8]} />
        <meshStandardMaterial color="#fb7185" roughness={0.46} />
      </mesh>
    </group>
  );
}

function PlayerAvatar({ player }: { player: PlayerState }) {
  const avatarRef = useRef<Group>(null);
  const tailRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!avatarRef.current) {
      return;
    }
    const t = clock.elapsedTime;
    avatarRef.current.position.y = 0.68 + player.elevation + Math.sin(t * 3.1) * 0.03;
    avatarRef.current.rotation.y = player.heading + Math.sin(t * 1.3) * 0.08;
    if (tailRef.current) {
      tailRef.current.rotation.x = Math.sin(t * 4.8) * 0.2;
    }
  });

  return (
    <group ref={avatarRef} position={[player.position.x, 0.68 + player.elevation, player.position.z]}>
      <mesh castShadow position={[0, 0.18, 0.26]} rotation={[0.1, 0, 0]}>
        <sphereGeometry args={[0.62, 24, 24]} />
        <meshStandardMaterial color="#fb7185" emissive="#be123c" emissiveIntensity={0.2} roughness={0.34} />
      </mesh>

      <mesh castShadow position={[0, 0.16, -0.08]}>
        <sphereGeometry args={[0.53, 20, 20]} />
        <meshStandardMaterial color="#f43f5e" roughness={0.4} />
      </mesh>

      {[0, 1, 2].map((line) => (
        <mesh key={`ridge-${line}`} castShadow position={[0, 0.28 + line * 0.06, -0.18 - line * 0.16]} rotation={[0.12, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.56 - line * 0.08, 8]} />
          <meshStandardMaterial color="#fb7185" roughness={0.36} />
        </mesh>
      ))}

      <mesh castShadow position={[0, 0.14, -0.42]}>
        <sphereGeometry args={[0.44, 18, 18]} />
        <meshStandardMaterial color="#f43f5e" roughness={0.42} />
      </mesh>

      <mesh castShadow position={[0, 0.13, -0.67]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#e11d48" roughness={0.45} />
      </mesh>

      <group ref={tailRef} position={[0, 0.11, -0.92]}>
        <mesh castShadow rotation={[0, 0, 0]}>
          <coneGeometry args={[0.31, 0.44, 3]} />
          <meshStandardMaterial color="#fb7185" roughness={0.42} />
        </mesh>

        <mesh castShadow position={[-0.24, 0.01, -0.04]} rotation={[0, 0.25, 0.1]}>
          <coneGeometry args={[0.22, 0.36, 3]} />
          <meshStandardMaterial color="#fb7185" roughness={0.42} />
        </mesh>

        <mesh castShadow position={[0.24, 0.01, -0.04]} rotation={[0, -0.25, -0.1]}>
          <coneGeometry args={[0.22, 0.36, 3]} />
          <meshStandardMaterial color="#fb7185" roughness={0.42} />
        </mesh>
      </group>

      <LobsterClaw side={-1} />
      <LobsterClaw side={1} />
      {[0, 1, 2, 3].map((index) => (
        <LobsterLeg key={`leg-left-${index}`} side={-1} index={index} />
      ))}
      {[0, 1, 2, 3].map((index) => (
        <LobsterLeg key={`leg-right-${index}`} side={1} index={index} />
      ))}

      <mesh position={[-0.19, 0.66, 0.62]} rotation={[0.1, 0.06, -0.06]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 8]} />
        <meshStandardMaterial color="#fb7185" />
      </mesh>
      <mesh position={[0.19, 0.66, 0.62]} rotation={[0.1, -0.06, 0.06]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 8]} />
        <meshStandardMaterial color="#fb7185" />
      </mesh>

      <mesh position={[-0.19, 0.82, 0.72]} castShadow>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0.19, 0.82, 0.72]} castShadow>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-0.19, 0.82, 0.8]} castShadow>
        <sphereGeometry args={[0.04, 10, 10]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.19, 0.82, 0.8]} castShadow>
        <sphereGeometry args={[0.04, 10, 10]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <mesh position={[-0.32, 0.52, 0.72]} rotation={[0.22, 0.16, -0.46]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.72, 8]} />
        <meshStandardMaterial color="#fda4af" />
      </mesh>
      <mesh position={[0.32, 0.52, 0.72]} rotation={[0.22, -0.16, 0.46]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.72, 8]} />
        <meshStandardMaterial color="#fda4af" />
      </mesh>
    </group>
  );
}

function ScoutFishModel({ color, isTarget }: { color: string; isTarget: boolean }) {
  return (
    <group>
      <mesh castShadow rotation={[0, Math.PI / 2, 0]}>
        <capsuleGeometry args={[0.2, 0.62, 8, 12]} />
        <meshStandardMaterial
          color={color}
          roughness={0.45}
          emissive={isTarget ? '#fef08a' : '#111827'}
          emissiveIntensity={isTarget ? 0.42 : 0.1}
        />
      </mesh>
      <mesh castShadow position={[0, 0, -0.45]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.21, 0.3, 3]} />
        <meshStandardMaterial color="#7dd3fc" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.11, 0.35]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh castShadow position={[0, 0.11, 0.4]}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function HunterJellyModel({ color, isTarget }: { color: string; isTarget: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.38, 18, 14]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.92}
          roughness={0.38}
          emissive={isTarget ? '#fef08a' : '#111827'}
          emissiveIntensity={isTarget ? 0.35 : 0.08}
        />
      </mesh>
      {[-0.2, -0.07, 0.07, 0.2].map((x) => (
        <mesh key={`tentacle-${x}`} castShadow position={[x, -0.22, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
          <meshStandardMaterial color="#a5b4fc" roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function CrusherRayModel({ color, isTarget }: { color: string; isTarget: boolean }) {
  return (
    <group>
      <mesh castShadow rotation={[0.2, 0, 0]}>
        <sphereGeometry args={[0.34, 18, 16]} />
        <meshStandardMaterial
          color={color}
          roughness={0.48}
          emissive={isTarget ? '#fef08a' : '#111827'}
          emissiveIntensity={isTarget ? 0.35 : 0.08}
        />
      </mesh>
      <mesh castShadow position={[-0.42, 0, 0]} rotation={[0, 0, 0.18]}>
        <sphereGeometry args={[0.2, 14, 10]} />
        <meshStandardMaterial color="#fda4af" roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0.42, 0, 0]} rotation={[0, 0, -0.18]}>
        <sphereGeometry args={[0.2, 14, 10]} />
        <meshStandardMaterial color="#fda4af" roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0, -0.03, -0.44]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.1, 0.38, 3]} />
        <meshStandardMaterial color="#fb7185" roughness={0.52} />
      </mesh>
    </group>
  );
}

function BossWhaleModel({ color, isTarget }: { color: string; isTarget: boolean }) {
  return (
    <group>
      <mesh castShadow rotation={[0, Math.PI / 2, 0]}>
        <capsuleGeometry args={[0.6, 1.75, 12, 18]} />
        <meshStandardMaterial
          color={color}
          roughness={0.42}
          emissive={isTarget ? '#fde68a' : '#0f172a'}
          emissiveIntensity={isTarget ? 0.4 : 0.1}
        />
      </mesh>
      <mesh castShadow position={[0, 0.24, 0.12]} rotation={[0.2, 0, 0]}>
        <sphereGeometry args={[0.38, 16, 16]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, 0.15, -1.05]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.16, 0.62, 0.34]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0.17, 0.15, -1.28]} rotation={[0, 0, 0.34]}>
        <coneGeometry args={[0.16, 0.34, 3]} />
        <meshStandardMaterial color="#fb923c" roughness={0.42} />
      </mesh>
      <mesh castShadow position={[-0.17, 0.15, -1.28]} rotation={[0, 0, -0.34]}>
        <coneGeometry args={[0.16, 0.34, 3]} />
        <meshStandardMaterial color="#fb923c" roughness={0.42} />
      </mesh>
    </group>
  );
}

function EnemyFallbackCreatureModel({ enemy, isTarget }: { enemy: EnemyState; isTarget: boolean }) {
  const color = colorByEnemy(enemy);
  if (enemy.kind === 'boss') {
    return <BossWhaleModel color={color} isTarget={isTarget} />;
  }
  if (enemy.kind === 'crusher') {
    return <CrusherRayModel color={color} isTarget={isTarget} />;
  }
  if (enemy.kind === 'hunter') {
    return <HunterJellyModel color={color} isTarget={isTarget} />;
  }
  return <ScoutFishModel color={color} isTarget={isTarget} />;
}

function creatureModelKey(kind: EnemyState['kind']): keyof typeof SEA_MODEL_PATHS {
  return kind;
}

function normalizedNpcScaleAndOffset(source: Object3D): { scale: number; liftY: number } {
  const box = new Box3().setFromObject(source);
  const size = new Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim <= 0.0001) {
    return { scale: 1, liftY: 0 };
  }

  const scale = NPC_MODEL_TARGET_SIZE / maxDim;
  const liftY = -box.min.y * scale;
  return { scale, liftY };
}

function creatureModelRotation(kind: EnemyState['kind']): [number, number, number] {
  if (kind === 'boss') {
    return [0, -Math.PI / 2, 0];
  }
  if (kind === 'crusher') {
    return [0, Math.PI / 2, 0];
  }
  if (kind === 'hunter') {
    return [0, -Math.PI / 2, 0];
  }
  return [0, Math.PI, 0];
}

function creatureAnimationSpeed(kind: EnemyState['kind']): number {
  if (kind === 'boss') {
    return 0.74;
  }
  if (kind === 'crusher') {
    return 0.95;
  }
  if (kind === 'hunter') {
    return 1.08;
  }
  return 1.22;
}

function creatureTintColor(kind: EnemyState['kind']): Color {
  if (kind === 'boss') {
    return new Color('#f97316');
  }
  if (kind === 'crusher') {
    return new Color('#fb7185');
  }
  if (kind === 'hunter') {
    return new Color('#38bdf8');
  }
  return new Color('#22d3ee');
}

function creatureHitFlashColor(kind: EnemyState['kind']): Color {
  if (kind === 'boss') {
    return new Color('#fef08a');
  }
  if (kind === 'crusher') {
    return new Color('#fecdd3');
  }
  if (kind === 'hunter') {
    return new Color('#bfdbfe');
  }
  return new Color('#bae6fd');
}

function pickCreatureActionName(
  kind: EnemyState['kind'],
  available: string[],
  attackActive: boolean,
  hitActive: boolean,
  bossSkill: BossSkillType | null,
): string | null {
  if (available.length === 0) {
    return null;
  }

  const has = (name: string) => available.includes(name);

  if (kind === 'crusher') {
    if (hitActive && has('Survey')) {
      return 'Survey';
    }
    if (attackActive && has('Run')) {
      return 'Run';
    }
    if (has('Walk')) {
      return 'Walk';
    }
  }

  if (kind === 'boss') {
    if (bossSkill === 'clawSweep' && has('Run')) {
      return 'Run';
    }
    if (bossSkill === 'shockSlam' && has('Survey')) {
      return 'Survey';
    }
    if (bossSkill === 'tidalBurst' && has('Walk')) {
      return 'Walk';
    }
  }

  return available[0] ?? null;
}

interface CreatureMaterialRef {
  material: Material & { color: Color; emissive: Color; emissiveIntensity: number };
  baseColor: Color;
  baseEmissive: Color;
  baseEmissiveIntensity: number;
}

function collectCreatureMaterials(root: Object3D): CreatureMaterialRef[] {
  const refs: CreatureMaterialRef[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (
        material &&
        typeof material === 'object' &&
        'color' in material &&
        'emissive' in material &&
        'emissiveIntensity' in material
      ) {
        const typed = material as Material & { color: Color; emissive: Color; emissiveIntensity: number };
        refs.push({
          material: typed,
          baseColor: typed.color.clone(),
          baseEmissive: typed.emissive.clone(),
          baseEmissiveIntensity: typed.emissiveIntensity,
        });
      }
    });
  });
  return refs;
}

function EnemyGlbCreature({ enemy, isTarget }: { enemy: EnemyState; isTarget: boolean }) {
  const modelPath = SEA_MODEL_PATHS[creatureModelKey(enemy.kind)];
  const gltf = useGLTF(modelPath);
  const groupRef = useRef<Group>(null);
  const materialRefs = useRef<CreatureMaterialRef[]>([]);
  const tintRef = useRef<Color>(creatureTintColor(enemy.kind));
  const hitFlashRef = useRef<Color>(creatureHitFlashColor(enemy.kind));
  const { actions } = useAnimations(gltf.animations, groupRef);

  useEffect(() => {
    tintRef.current = creatureTintColor(enemy.kind);
    hitFlashRef.current = creatureHitFlashColor(enemy.kind);
  }, [enemy.kind]);

  const actionNames = useMemo(() => Object.keys(actions), [actions]);
  const attackActive = enemy.attackPulseMs > 0;
  const hitActive = enemy.hitPulseMs > 0;
  const normalizedTransform = useMemo(() => normalizedNpcScaleAndOffset(gltf.scene), [gltf.scene]);
  const selectedActionName = useMemo(
    () => pickCreatureActionName(enemy.kind, actionNames, attackActive, hitActive, enemy.activeBossSkill),
    [enemy.kind, actionNames, attackActive, hitActive, enemy.activeBossSkill],
  );

  useEffect(() => {
    const allActions = Object.values(actions).filter((action): action is NonNullable<typeof action> => Boolean(action));
    allActions.forEach((action) => {
      action.enabled = false;
      action.stop();
    });

    if (!selectedActionName || !actions[selectedActionName]) {
      return () => {
        allActions.forEach((action) => action.stop());
      };
    }

    const selected = actions[selectedActionName]!;
    selected.reset();
    selected.timeScale = creatureAnimationSpeed(enemy.kind) * (attackActive ? 1.25 : 1);
    selected.enabled = true;
    selected.play();

    return () => {
      allActions.forEach((action) => {
        action.stop();
      });
    };
  }, [actions, enemy.kind, selectedActionName, attackActive]);

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }
    materialRefs.current = collectCreatureMaterials(groupRef.current);
  }, [enemy.id]);

  useFrame(() => {
    const attackRatio = clamp(enemy.attackPulseMs / attackPulseDurationByKind(enemy.kind), 0, 1);
    const hitRatio = clamp(enemy.hitPulseMs / hitPulseDurationByKind(enemy.kind), 0, 1);
    const hitFlash = Math.max(0, Math.sin((1 - hitRatio) * Math.PI * 5)) * hitRatio;
    const targetGlow = isTarget ? 0.26 : 0;

    materialRefs.current.forEach((entry) => {
      entry.material.color.copy(entry.baseColor).lerp(tintRef.current, enemy.kind === 'boss' ? 0.26 : 0.16);
      entry.material.emissive.copy(entry.baseEmissive).lerp(hitFlashRef.current, Math.min(1, targetGlow + hitFlash * 0.82));
      entry.material.emissiveIntensity =
        entry.baseEmissiveIntensity + targetGlow * 0.45 + hitFlash * (enemy.kind === 'boss' ? 1.35 : 1.05) + attackRatio * 0.12;
    });
  });

  return (
    <group ref={groupRef} rotation={creatureModelRotation(enemy.kind)}>
      <group
        scale={[normalizedTransform.scale, normalizedTransform.scale, normalizedTransform.scale]}
        position={[0, normalizedTransform.liftY, 0]}
      >
        <Clone object={gltf.scene} deep="materialsOnly" />
      </group>
    </group>
  );
}

function EnemyCreatureModel({ enemy, isTarget }: { enemy: EnemyState; isTarget: boolean }) {
  return (
    <Suspense fallback={<EnemyFallbackCreatureModel enemy={enemy} isTarget={isTarget} />}>
      <EnemyGlbCreature enemy={enemy} isTarget={isTarget} />
    </Suspense>
  );
}

useGLTF.preload(SEA_MODEL_PATHS.scout);
useGLTF.preload(SEA_MODEL_PATHS.hunter);
useGLTF.preload(SEA_MODEL_PATHS.crusher);
useGLTF.preload(SEA_MODEL_PATHS.boss);

function seedFromEnemyId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 10000;
  }
  return hash / 1000;
}

function EnemyUnit({ enemy, isTarget }: { enemy: EnemyState; isTarget: boolean }) {
  const unitRef = useRef<Group>(null);
  const baseY = 0.66;
  const seed = useMemo(() => seedFromEnemyId(enemy.id), [enemy.id]);
  const bossClipRef = useRef<'idle' | BossSkillType>('idle');
  const bossClipStartRef = useRef(0);

  useFrame(({ clock }) => {
    if (!unitRef.current) {
      return;
    }
    const t = clock.elapsedTime + seed;
    const bobAmp = enemy.kind === 'boss' ? 0.065 : 0.048;
    const bobSpeed = enemy.kind === 'hunter' ? 2.9 : 2.4;
    const bob = Math.sin(t * bobSpeed) * bobAmp;
    const swayAmp = enemy.kind === 'boss' ? 0.08 : 0.15;
    const sway = Math.sin(t * 2 + seed * 0.6) * swayAmp;
    const attackRatio = clamp(enemy.attackPulseMs / attackPulseDurationByKind(enemy.kind), 0, 1);
    const attackWave = Math.sin((1 - attackRatio) * Math.PI);
    const hitRatio = clamp(enemy.hitPulseMs / hitPulseDurationByKind(enemy.kind), 0, 1);
    const hitWave = Math.sin((1 - hitRatio) * Math.PI * 4) * hitRatio;
    const nextBossClip: 'idle' | BossSkillType =
      enemy.kind === 'boss' && enemy.activeBossSkill && enemy.telegraphMsLeft > 0
        ? enemy.activeBossSkill
        : 'idle';

    if (enemy.kind === 'boss' && nextBossClip !== bossClipRef.current) {
      bossClipRef.current = nextBossClip;
      bossClipStartRef.current = clock.elapsedTime;
    }

    const bossClipElapsed = Math.max(0, clock.elapsedTime - bossClipStartRef.current);

    let localOffsetX = 0;
    let localOffsetY = 0;
    let localOffsetZ = 0;
    let yawOffset = 0;
    let rollOffset = 0;
    let pitchOffset = 0;
    let scaleX = 1;
    let scaleY = 1;
    let scaleZ = 1;

    if (enemy.kind === 'scout') {
      localOffsetZ = attackWave * 0.22 - Math.abs(hitWave) * 0.06;
      yawOffset = attackWave * 0.16 + hitWave * 0.2;
      rollOffset = hitWave * 0.08;
      scaleX = 1 + attackWave * 0.04;
      scaleY = 1 - attackWave * 0.03;
      scaleZ = 1 + attackWave * 0.05;
    } else if (enemy.kind === 'hunter') {
      localOffsetY = attackWave * 0.16;
      localOffsetX = hitWave * 0.09;
      pitchOffset = attackWave * 0.2;
      yawOffset = hitWave * 0.16;
      scaleX = 1 - attackWave * 0.06;
      scaleY = 1 + attackWave * 0.12;
      scaleZ = 1 - attackWave * 0.04;
    } else if (enemy.kind === 'crusher') {
      localOffsetX = attackWave * 0.14;
      localOffsetZ = attackWave * 0.09;
      yawOffset = attackWave * 0.22 + hitWave * 0.14;
      rollOffset = attackWave * 0.16 + hitWave * 0.12;
      scaleX = 1 + attackWave * 0.08;
      scaleY = 1 - attackWave * 0.05;
      scaleZ = 1 + attackWave * 0.03;
    } else {
      localOffsetZ = attackWave * 0.18;
      localOffsetY = attackWave * 0.08;
      yawOffset = attackWave * 0.18 + hitWave * 0.09;
      rollOffset = hitWave * 0.07;
      pitchOffset = attackWave * 0.08;
      scaleX = 1 + attackWave * 0.05;
      scaleY = 1 + attackWave * 0.03;
      scaleZ = 1 + attackWave * 0.06;

      if (bossClipRef.current === 'clawSweep') {
        const phase = Math.sin(bossClipElapsed * 8.2);
        yawOffset += phase * 0.5;
        rollOffset += phase * 0.16;
        localOffsetX += phase * 0.22;
      } else if (bossClipRef.current === 'shockSlam') {
        const phase = Math.min(1, bossClipElapsed / 0.55);
        const plunge = phase < 0.5 ? -phase * 0.42 : -(1 - phase) * 0.38;
        pitchOffset += phase * 0.32;
        localOffsetY += plunge;
        scaleY = 1 + phase * 0.11;
      } else if (bossClipRef.current === 'tidalBurst') {
        const phase = Math.sin(bossClipElapsed * 6.4);
        yawOffset += phase * 0.28;
        rollOffset += phase * 0.2;
        scaleX = 1.08 + Math.abs(phase) * 0.07;
        scaleZ = 1.08 + Math.abs(phase) * 0.08;
      }
    }

    unitRef.current.position.set(
      enemy.position.x + localOffsetX,
      baseY + bob + localOffsetY,
      enemy.position.z + localOffsetZ,
    );
    unitRef.current.rotation.set(pitchOffset, sway + yawOffset, rollOffset);
    unitRef.current.scale.set(scaleX, scaleY, scaleZ);
  });

  const hpRatio = enemy.hp / enemy.maxHp;

  return (
    <group ref={unitRef} position={[enemy.position.x, baseY, enemy.position.z]}>
      <EnemyCreatureModel enemy={enemy} isTarget={isTarget} />
      <mesh position={[0, enemy.kind === 'boss' ? 1.45 : 1.02, 0]}>
        <planeGeometry args={[enemy.kind === 'boss' ? 2.05 : 1.2, 0.1]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.9} />
      </mesh>
      <mesh position={[-(1 - hpRatio) * (enemy.kind === 'boss' ? 1.02 : 0.58), enemy.kind === 'boss' ? 1.46 : 1.03, 0.01]}>
        <planeGeometry args={[(enemy.kind === 'boss' ? 2.04 : 1.16) * hpRatio, 0.06]} />
        <meshBasicMaterial color={hpRatio > 0.45 ? '#22c55e' : '#ef4444'} />
      </mesh>
      {enemy.kind === 'boss' && enemy.activeBossSkill && enemy.telegraphMsLeft > 0 && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.82, 0]}>
            <ringGeometry args={[Math.max(0.4, enemy.telegraphRadius - 0.25), enemy.telegraphRadius, 64]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.5} />
          </mesh>
          <mesh position={[0, 1.95, 0]}>
            <planeGeometry args={[2.2, 0.2]} />
            <meshBasicMaterial color="#7f1d1d" transparent opacity={0.75} />
          </mesh>
          <mesh position={[0, 1.95, 0.01]}>
            <planeGeometry args={[Math.max(0.4, (enemy.telegraphMsLeft / 1200) * 2.2), 0.14]} />
            <meshBasicMaterial color="#fb923c" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function EnemyMeshes({ enemies, activeTargetId }: { enemies: EnemyState[]; activeTargetId: string | null }) {
  return (
    <group>
      {enemies
        .filter((enemy) => enemy.isAlive && enemy.hp > 0)
        .map((enemy) => (
          <EnemyUnit key={enemy.id} enemy={enemy} isTarget={enemy.id === activeTargetId} />
        ))}
    </group>
  );
}

function EnemyGroundProjections({
  enemies,
  deadMarks,
}: {
  enemies: EnemyState[];
  deadMarks: EnemyProjectionMark[];
}) {
  return (
    <group>
      {enemies
        .filter((enemy) => enemy.isAlive && enemy.hp > 0)
        .map((enemy) => (
          <mesh
            key={`projection-live-${enemy.id}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[enemy.position.x, 0.03, enemy.position.z]}
          >
            <circleGeometry args={[enemyProjectionRadius(enemy), 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={enemy.kind === 'boss' ? 0.54 : 0.44} />
          </mesh>
        ))}

      {deadMarks.map((mark) => (
        <mesh
          key={`projection-dead-${mark.id}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[mark.position.x, 0.032, mark.position.z]}
        >
          <circleGeometry args={[0.9, 28]} />
          <meshBasicMaterial color="#020617" transparent opacity={Math.max(0.12, Math.min(0.6, mark.ttlMs / 4600))} />
        </mesh>
      ))}
    </group>
  );
}

function GatherMeshes({ nodes }: { nodes: GatherNode[] }) {
  return (
    <group>
      {nodes
        .filter((node) => !node.collected)
        .map((node) => (
          <mesh key={node.id} position={[node.position.x, 0.5, node.position.z]}>
            <octahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color={colorByGather(node.type)} emissive={colorByGather(node.type)} emissiveIntensity={0.22} />
          </mesh>
        ))}
    </group>
  );
}

function CoralObstacleMeshes() {
  const coralColors = ['#fb7185', '#f472b6', '#22d3ee', '#a78bfa', '#f97316'] as const;

  return (
    <group>
      {CORAL_OBSTACLES.map((obstacle, index) => {
        const color = coralColors[index % coralColors.length];
        const branchCount = 3 + (index % 3);
        return (
          <group key={obstacle.id} position={[obstacle.position.x, 0, obstacle.position.z]} rotation={[0, index * 0.56, 0]}>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[obstacle.radius * 1.03, 28]} />
              <meshStandardMaterial color="#0f172a" roughness={0.98} transparent opacity={0.46} />
            </mesh>

            <mesh castShadow position={[0, obstacle.height * 0.34, 0]}>
              <cylinderGeometry args={[obstacle.radius * 0.34, obstacle.radius * 0.46, obstacle.height * 0.68, 10]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.52} />
            </mesh>

            <mesh castShadow position={[0, obstacle.height * 0.78, 0]}>
              <sphereGeometry args={[obstacle.radius * 0.36, 12, 12]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.45} />
            </mesh>

            {Array.from({ length: branchCount }, (_, branchIndex) => {
              const angle = (Math.PI * 2 * branchIndex) / branchCount + index * 0.3;
              const reach = obstacle.radius * (0.28 + (branchIndex % 2) * 0.17);
              const lift = obstacle.height * (0.42 + (branchIndex % 3) * 0.08);
              const size = obstacle.radius * (0.1 + (branchIndex % 2) * 0.04);
              return (
                <mesh
                  key={`${obstacle.id}-branch-${branchIndex}`}
                  castShadow
                  position={[Math.cos(angle) * reach, lift, Math.sin(angle) * reach]}
                >
                  <sphereGeometry args={[size, 10, 10]} />
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.26} roughness={0.4} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function ProjectileMeshes({ projectiles }: { projectiles: ProjectileState[] }) {
  return (
    <group>
      {projectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.position.x, 0.78, projectile.position.z]}>
          <sphereGeometry args={[projectile.owner === 'player' ? 0.2 : 0.18, 12, 12]} />
          <meshStandardMaterial
            color={projectile.owner === 'player' ? '#fbbf24' : '#60a5fa'}
            emissive={projectile.owner === 'player' ? '#f97316' : '#1d4ed8'}
            emissiveIntensity={0.58}
          />
        </mesh>
      ))}
    </group>
  );
}

function CheckpointBeacon({ checkpointZone }: { checkpointZone: number }) {
  const position = getCheckpointPosition(checkpointZone);
  return (
    <group position={[position.x, 0, position.z]}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.75, 1.15, 48]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.65} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.9, 10]} />
        <meshStandardMaterial color="#67e8f9" emissive="#0891b2" emissiveIntensity={0.55} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export default function AdventureScene({
  player,
  enemies,
  enemyProjectionMarks,
  gatherNodes,
  projectiles,
  activeTargetId,
  zone,
  checkpointZone,
  quality,
  cameraSensitivity,
  gameMode,
  viewMode,
  engageHint,
  onEngageGameMode,
  onPrimaryFire,
  onCameraYawChange,
}: AdventureSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cameraAngles, setCameraAngles] = useState({ yaw: 0.78, pitch: 0.42 });
  const pointerLockSupported = useMemo(() => {
    if (typeof document === 'undefined') {
      return false;
    }
    return typeof document.exitPointerLock === 'function';
  }, []);

  const bossSignal = useMemo(
    () => enemies.find((enemy) => enemy.kind === 'boss' && enemy.activeBossSkill && enemy.telegraphMsLeft > 0) ?? null,
    [enemies],
  );

  useEffect(() => {
    onCameraYawChange(cameraAngles.yaw);
  }, [cameraAngles.yaw, onCameraYawChange]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container || document.pointerLockElement !== container) {
        return;
      }
      const sensitivity = 0.0026 * Math.max(0.35, cameraSensitivity);
      setCameraAngles((prev) => ({
        yaw: prev.yaw - event.movementX * sensitivity,
        pitch: clamp(prev.pitch - event.movementY * sensitivity, -0.52, 1.08),
      }));
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [cameraSensitivity]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (pointerLockSupported && !gameMode && document.pointerLockElement === container) {
      document.exitPointerLock();
    }
  }, [gameMode, pointerLockSupported]);

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) {
      return;
    }
    const container = containerRef.current;
    if (!gameMode) {
      onEngageGameMode();
      if (pointerLockSupported && container && document.pointerLockElement !== container && typeof container.requestPointerLock === 'function') {
        container.requestPointerLock();
      }
      return;
    }

    if (!container) {
      return;
    }
    if (pointerLockSupported && document.pointerLockElement !== container && typeof container.requestPointerLock === 'function') {
      container.requestPointerLock();
      return;
    }

    onPrimaryFire();
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[56vh] min-h-[330px] w-full rounded-2xl overflow-hidden border border-cyan-500/30 bg-slate-900/30 select-none sm:h-[66vh] sm:min-h-[460px]"
      onPointerDown={onPointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        shadows={quality === 'high'}
        dpr={quality === 'high' ? [1, 1.5] : 1}
        camera={{ position: [8, 8, 14], fov: 50 }}
      >
        <color attach="background" args={['#041827']} />
        <fog attach="fog" args={['#041827', ADVENTURE_MAP_BOUNDARY * 0.76, ADVENTURE_MAP_BOUNDARY * 2.45]} />

        <ambientLight intensity={0.4} />
        <hemisphereLight args={['#67e8f9', '#020617', 0.48]} />
        <directionalLight
          castShadow={quality === 'high'}
          intensity={1.18}
          position={[6, 18, 10]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <spotLight
          position={[-12, 20, -6]}
          angle={0.46}
          penumbra={0.55}
          intensity={0.6}
          color="#22d3ee"
        />
        <pointLight position={[0, 5, 0]} intensity={0.3} distance={34} color="#38bdf8" />

        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[ADVENTURE_MAP_BOUNDARY, 128]} />
          <meshStandardMaterial color="#0f766e" roughness={0.85} metalness={0.06} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[ADVENTURE_MAP_BOUNDARY - 0.22, ADVENTURE_MAP_BOUNDARY, 128]} />
          <meshBasicMaterial color="#0ea5a8" transparent opacity={0.45} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]}>
          <circleGeometry args={[ADVENTURE_MAP_BOUNDARY * 0.72, 128]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.08} />
        </mesh>

        <EdgeWaterBelt />

        <ZoneRings activeZone={zone} />
        <CheckpointBeacon checkpointZone={checkpointZone} />
        <SeafloorDecor quality={quality} />
        <CoralObstacleMeshes />
        <EnemyGroundProjections enemies={enemies} deadMarks={enemyProjectionMarks} />
        <PlayerAvatar player={player} />
        <EnemyMeshes enemies={enemies} activeTargetId={activeTargetId} />
        <GatherMeshes nodes={gatherNodes} />
        <ProjectileMeshes projectiles={projectiles} />
        {quality === 'high' && <SeaParticles count={74} />}
        {quality === 'low' && <SeaParticles count={28} />}
        <CameraRig
          playerPosition={player.position}
          yaw={cameraAngles.yaw}
          pitch={cameraAngles.pitch}
          viewMode={viewMode}
          playerElevation={player.elevation}
        />
      </Canvas>
      {bossSignal && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-rose-400/50 bg-rose-950/65 px-4 py-1 text-xs text-rose-100">
          Boss: {bossSkillLabel(bossSignal.activeBossSkill)} ({Math.ceil(bossSignal.telegraphMsLeft / 100) / 10}s)
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(56,189,248,0.15),transparent_45%),radial-gradient(circle_at_80%_14%,rgba(34,211,238,0.12),transparent_44%),linear-gradient(to_bottom,rgba(2,132,199,0.08),rgba(2,6,23,0.34))]" />
      {!gameMode && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/30">
          <div className="rounded-xl border border-cyan-400/60 bg-slate-900/80 px-5 py-3 text-sm text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
            {engageHint}
          </div>
        </div>
      )}
    </div>
  );
}
