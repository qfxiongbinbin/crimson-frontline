import type { BuildingKind, Faction, UnitKind } from './config';

export interface TilePos {
  tx: number;
  ty: number;
}

export interface QueueItem {
  kind: UnitKind;
  progress: number; // 秒
}

export interface EntitySnapshot {
  id: number;
  faction: Faction;
  kind: string;
  name: string;
  isBuilding: boolean;
  isProducer: boolean;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
}

export interface HudSnapshot {
  credits: number;
  powerGen: number;
  powerUse: number;
  lowPower: boolean;
  queue: { kind: UnitKind; name: string; ratio: number }[];
  selected: EntitySnapshot[];
  placement: BuildingKind | null;
  canDeploy: boolean;
  gameOver: 'victory' | 'defeat' | null;
}
