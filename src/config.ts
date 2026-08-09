// 全局平衡数值与常量 —— 所有数据均为原创设定
export const TILE = 32;
export const MAP_W = 64;
export const MAP_H = 64;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const START_CREDITS = 4000;
export const ENEMY_START_CREDITS = 5000;
export const BUILD_RADIUS = 8; // 指挥中心提供的固定建造半径（格）
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
  | 'repairFactory'
  | 'turret'
  | 'groundPatch'
  | 'rockBarrier'
  | 'oreDeposit'
  | 'sandbags'
  | 'antiTank'
  | 'crater'
  | 'wreck'
  | 'supplyCrates'
  | 'wall'
  | 'beacon';

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
  repairRange?: number; // 维修工厂作用半径（像素）
  repairRate?: number; // 每个单位每秒恢复生命值
  textureKey?: string; // 无阵营差异的工事素材
  visualSize?: [number, number]; // 视觉尺寸（像素），可与占地不同
  blocksMovement?: boolean; // 默认阻挡
  terrainEffect?: 'ground' | 'ore'; // 放置后直接修改地图格
  orePerTile?: number;
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
  repairFactory: {
    name: '维修工厂',
    desc: '自动维修范围内受伤的作战单位，需要电力',
    cost: 1000,
    buildTime: 12,
    hp: 760,
    size: [3, 2],
    power: -45,
    sight: 5,
    repairRange: 176,
    repairRate: 20,
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
  groundPatch: {
    name: '工兵路面',
    desc: '铺设一块低矮战场路面，不阻挡单位',
    cost: 60,
    buildTime: 0,
    hp: 1,
    size: [2, 2],
    power: 0,
    sight: 0,
    textureKey: 'tile-ground-0',
    blocksMovement: false,
    terrainEffect: 'ground',
  },
  rockBarrier: {
    name: '岩石路障',
    desc: '高耐久天然障碍，能够封锁道路',
    cost: 260,
    buildTime: 3,
    hp: 620,
    size: [1, 1],
    power: 0,
    sight: 1,
    textureKey: 'tile-rock',
    visualSize: [38, 38],
  },
  oreDeposit: {
    name: '人工矿脉',
    desc: '部署四格小型矿脉，共含 1200 资源',
    cost: 1500,
    buildTime: 0,
    hp: 1,
    size: [2, 2],
    power: 0,
    sight: 0,
    textureKey: 'tile-ore',
    blocksMovement: false,
    terrainEffect: 'ore',
    orePerTile: 300,
  },
  sandbags: {
    name: '沙袋墙',
    desc: '廉价防线，阻挡单位并吸收伤害',
    cost: 120,
    buildTime: 2,
    hp: 360,
    size: [2, 1],
    power: 0,
    sight: 1,
    textureKey: 'prop-sandbags',
    visualSize: [58, 39],
  },
  antiTank: {
    name: '反坦克拒马',
    desc: '钢制反装甲障碍，封锁狭窄通路',
    cost: 150,
    buildTime: 2,
    hp: 300,
    size: [1, 1],
    power: 0,
    sight: 1,
    textureKey: 'prop-anti-tank',
    visualSize: [36, 36],
  },
  crater: {
    name: '爆破弹坑',
    desc: '低矮伪装工事，不会阻挡单位',
    cost: 80,
    buildTime: 1,
    hp: 100,
    size: [1, 1],
    power: 0,
    sight: 1,
    textureKey: 'prop-crater',
    visualSize: [38, 38],
    blocksMovement: false,
  },
  wreck: {
    name: '装甲残骸',
    desc: '利用废弃装甲形成临时掩体',
    cost: 180,
    buildTime: 2.5,
    hp: 420,
    size: [1, 1],
    power: 0,
    sight: 1,
    textureKey: 'prop-wreck',
    visualSize: [34, 43],
  },
  supplyCrates: {
    name: '补给箱',
    desc: '堆叠军需物资形成轻型障碍',
    cost: 100,
    buildTime: 1.5,
    hp: 190,
    size: [1, 1],
    power: 0,
    sight: 1,
    textureKey: 'prop-crates',
    visualSize: [42, 34],
  },
  wall: {
    name: '加固城墙',
    desc: '重型基地城墙，拥有极高耐久',
    cost: 300,
    buildTime: 4,
    hp: 900,
    size: [2, 1],
    power: 0,
    sight: 1,
    textureKey: 'prop-wall',
    visualSize: [62, 41],
  },
  beacon: {
    name: '警戒灯',
    desc: '不阻挡单位的小型警戒照明设施',
    cost: 120,
    buildTime: 2,
    hp: 140,
    size: [1, 1],
    power: -2,
    sight: 5,
    textureKey: 'prop-beacon',
    visualSize: [26, 26],
    blocksMovement: false,
  },
};

// 建筑解锁条件（需要先拥有哪种已完工建筑）
export const BUILD_PREREQ: Partial<Record<BuildingKind, BuildingKind>> = {
  barracks: 'powerPlant',
  refinery: 'powerPlant',
  warFactory: 'refinery',
  repairFactory: 'warFactory',
  turret: 'barracks',
};

export const FACTION_COLORS = {
  player: { main: 0xb02e26, dark: 0x701d18, light: 0xe0503f, accent: 0xffd27a },
  enemy: { main: 0x5a3fb0, dark: 0x39247a, light: 0x8a68e0, accent: 0xc3b2ff },
} as const;

export const UNIT_KINDS: UnitKind[] = ['infantry', 'rocket', 'lightTank', 'heavyTank', 'harvester', 'mcv'];
export const BUILDING_KINDS: BuildingKind[] = [
  'powerPlant',
  'refinery',
  'barracks',
  'warFactory',
  'repairFactory',
  'turret',
];
export const FORTIFICATION_KINDS: BuildingKind[] = [
  'groundPatch',
  'rockBarrier',
  'oreDeposit',
  'sandbags',
  'antiTank',
  'crater',
  'wreck',
  'supplyCrates',
  'wall',
  'beacon',
];
export const BUILDABLE_KINDS: BuildingKind[] = [...BUILDING_KINDS, ...FORTIFICATION_KINDS];
