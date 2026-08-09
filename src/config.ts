// 全局平衡数值与常量 —— 所有数据均为原创设定
export const TILE = 32;
export const MAP_W = 64;
export const MAP_H = 64;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const START_CREDITS = 4000;
export const ENEMY_START_CREDITS = 5000;
export const BUILD_RADIUS = 8; // 建造范围（格）
export const MAX_QUEUE = 5; // 生产队列上限
export const ORE_PER_TILE = 350; // 每格矿石价值
export const HARVEST_RATE = 140; // 采矿速度（资金/秒）
export const LOW_POWER_FACTOR = 0.5; // 电力不足时生产速度系数

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyParams {
  name: string;
  enemyCredits: number; // AI 初始资金
  thinkInterval: number; // AI 决策间隔（秒）
  waveBase: number; // 首波进攻兵力门槛
  waveCap: number; // 单波兵力上限
  heavyWave: number; // 第几波后开始掺入重型坦克
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { name: '简单', enemyCredits: 3000, thinkInterval: 2.2, waveBase: 8, waveCap: 10, heavyWave: 999 },
  normal: { name: '普通', enemyCredits: 5000, thinkInterval: 1.5, waveBase: 5, waveCap: 12, heavyWave: 2 },
  hard: { name: '困难', enemyCredits: 7500, thinkInterval: 1.0, waveBase: 4, waveCap: 14, heavyWave: 1 },
};

export type Faction = 'player' | 'enemy';

export type UnitKind =
  | 'mcv'
  | 'harvester'
  | 'infantry'
  | 'rocket'
  | 'lightTank'
  | 'heavyTank';

export type BuildingKind =
  | 'constructionYard'
  | 'powerPlant'
  | 'refinery'
  | 'barracks'
  | 'warFactory'
  | 'turret';

export interface UnitStats {
  name: string;
  desc: string;
  cost: number;
  buildTime: number; // 秒
  hp: number;
  speed: number; // 像素/秒
  sight: number; // 视野（格）
  range: number; // 射程（像素），0 表示非战斗单位
  damage: number;
  cooldown: number; // 攻击间隔（秒）
  capacity?: number; // 采矿车载矿量
  producer: BuildingKind | null; // 生产建筑
  texSize: number; // 贴图尺寸
}

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  mcv: {
    name: '基地工程车',
    desc: '可部署为指挥中心',
    cost: 1500,
    buildTime: 20,
    hp: 400,
    speed: 46,
    sight: 5,
    range: 0,
    damage: 0,
    cooldown: 1,
    producer: 'warFactory',
    texSize: 50,
  },
  harvester: {
    name: '采矿车',
    desc: '自动采集矿石',
    cost: 700,
    buildTime: 12,
    hp: 260,
    speed: 56,
    sight: 4,
    range: 0,
    damage: 0,
    cooldown: 1,
    capacity: 700,
    producer: 'warFactory',
    texSize: 44,
  },
  infantry: {
    name: '步兵',
    desc: '廉价的基础作战单位',
    cost: 100,
    buildTime: 4,
    hp: 55,
    speed: 62,
    sight: 5,
    range: 95,
    damage: 7,
    cooldown: 0.55,
    producer: 'barracks',
    texSize: 26,
  },
  rocket: {
    name: '火箭兵',
    desc: '对装甲与建筑造成重创',
    cost: 200,
    buildTime: 6,
    hp: 48,
    speed: 56,
    sight: 6,
    range: 135,
    damage: 22,
    cooldown: 1.25,
    producer: 'barracks',
    texSize: 28,
  },
  lightTank: {
    name: '轻型坦克',
    desc: '快速机动的主力战车',
    cost: 500,
    buildTime: 9,
    hp: 190,
    speed: 76,
    sight: 6,
    range: 145,
    damage: 20,
    cooldown: 1.0,
    producer: 'warFactory',
    texSize: 40,
  },
  heavyTank: {
    name: '重型坦克',
    desc: '厚重装甲的攻坚利器',
    cost: 900,
    buildTime: 14,
    hp: 400,
    speed: 50,
    sight: 6,
    range: 155,
    damage: 44,
    cooldown: 1.7,
    producer: 'warFactory',
    texSize: 48,
  },
};

export interface BuildingStats {
  name: string;
  desc: string;
  cost: number;
  buildTime: number; // 秒
  hp: number;
  size: [number, number]; // 占地（格）
  power: number; // 正数为发电，负数为耗电
  sight: number; // 格
  range?: number; // 防御塔射程
  damage?: number;
  cooldown?: number;
}

export const BUILDING_STATS: Record<BuildingKind, BuildingStats> = {
  constructionYard: {
    name: '指挥中心',
    desc: '基地核心，被摧毁即战败',
    cost: 0,
    buildTime: 0,
    hp: 1100,
    size: [3, 3],
    power: 20,
    sight: 7,
  },
  powerPlant: {
    name: '发电站',
    desc: '提供电力',
    cost: 300,
    buildTime: 6,
    hp: 420,
    size: [2, 2],
    power: 100,
    sight: 4,
  },
  refinery: {
    name: '资源精炼厂',
    desc: '接收矿石并附赠一辆采矿车',
    cost: 600,
    buildTime: 8,
    hp: 650,
    size: [3, 2],
    power: -30,
    sight: 5,
  },
  barracks: {
    name: '兵营',
    desc: '训练步兵与火箭兵',
    cost: 500,
    buildTime: 8,
    hp: 520,
    size: [2, 2],
    power: -20,
    sight: 4,
  },
  warFactory: {
    name: '战车工厂',
    desc: '生产坦克与工程车辆',
    cost: 800,
    buildTime: 10,
    hp: 720,
    size: [3, 2],
    power: -40,
    sight: 5,
  },
  turret: {
    name: '防御塔',
    desc: '自动攻击来犯之敌，需要电力',
    cost: 500,
    buildTime: 7,
    hp: 380,
    size: [1, 1],
    power: -25,
    sight: 7,
    range: 175,
    damage: 24,
    cooldown: 0.9,
  },
};

// 建筑解锁条件（需要先拥有哪种已完工建筑）
export const BUILD_PREREQ: Partial<Record<BuildingKind, BuildingKind>> = {
  barracks: 'powerPlant',
  refinery: 'powerPlant',
  warFactory: 'refinery',
  turret: 'barracks',
};

export const FACTION_COLORS = {
  player: { main: 0xb02e26, dark: 0x701d18, light: 0xe0503f, accent: 0xffd27a },
  enemy: { main: 0x5a3fb0, dark: 0x39247a, light: 0x8a68e0, accent: 0xc3b2ff },
} as const;

export const UNIT_KINDS: UnitKind[] = ['infantry', 'rocket', 'lightTank', 'heavyTank', 'harvester', 'mcv'];
export const BUILDING_KINDS: BuildingKind[] = ['powerPlant', 'refinery', 'barracks', 'warFactory', 'turret'];
