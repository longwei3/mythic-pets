export type AdventurePhase = 'idle' | 'running' | 'paused' | 'failed' | 'completed';

export type EnemyKind = 'scout' | 'hunter' | 'crusher' | 'boss';

export type EnemyAiState = 'patrol' | 'alert' | 'chase' | 'attack' | 'return';
export type BossSkillType = 'clawSweep' | 'shockSlam' | 'tidalBurst';

export type GatherNodeType = 'pearl' | 'coral' | 'relic';

export type QualityMode = 'high' | 'low';
export type CameraViewMode = 'tps' | 'fps';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PlayerState {
  position: Vec2;
  heading: number;
  elevation: number;
  verticalVelocity: number;
  isGrounded: boolean;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  level: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  sprintSpeed: number;
  attackRange: number;
  attackCooldownMs: number;
}

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  zone: number;
  position: Vec2;
  spawnPosition: Vec2;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  attackWindupMs: number;
  state: EnemyAiState;
  cooldownLeftMs: number;
  isAlive: boolean;
  bossSkillCycle: number;
  activeBossSkill: BossSkillType | null;
  telegraphMsLeft: number;
  telegraphRadius: number;
  telegraphPowerScale: number;
  attackPulseMs: number;
  hitPulseMs: number;
}

export interface GatherNode {
  id: string;
  zone: number;
  type: GatherNodeType;
  position: Vec2;
  collected: boolean;
}

export interface LootState {
  myth: number;
  shell: number;
  essence: number;
  relic: number;
}

export type ProjectileOwner = 'player' | 'enemy';

export interface ProjectileState {
  id: string;
  owner: ProjectileOwner;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  damage: number;
  ttlMs: number;
}

export interface EnemyProjectionMark {
  id: string;
  position: Vec2;
  ttlMs: number;
}

export interface RunState {
  phase: AdventurePhase;
  startedAt: number | null;
  endedAt: number | null;
  zone: number;
  checkpointZone: number;
  kills: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  score: number;
}

export interface AdventureWorldState {
  run: RunState;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  enemyProjectionMarks: EnemyProjectionMark[];
  gatherNodes: GatherNode[];
  loot: LootState;
  targetEnemyId: string | null;
  message: string | null;
  lastAttackAt: number;
  lastGatherAt: number;
}

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

export interface TickArgs {
  deltaSec: number;
  now: number;
  input: MovementInput;
  cameraYaw: number;
}

export interface RunSummary {
  completed: boolean;
  score: number;
  durationMs: number;
  zone: number;
  kills: number;
  mythReward: number;
}

export interface AdventureRunRecord extends RunSummary {
  id: string;
  playedAt: number;
}

export interface AdventureProfile {
  version: number;
  bestScore: number;
  totalRuns: number;
  totalMythEarned: number;
  highestZone: number;
  updatedAt: number;
  runHistory: AdventureRunRecord[];
  settings: {
    quality: QualityMode;
    musicEnabled: boolean;
    sfxEnabled: boolean;
    sensitivity: number;
  };
}
