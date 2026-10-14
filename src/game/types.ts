/**
 * 游戏核心类型定义。
 * 创建者：zhenghq
 */

/** 糖果颜色索引，-1 表示无颜色（如彩虹糖或食材）。 */
export type Color = 0 | 1 | 2 | 3 | 4 | 5;

/** 特殊糖果类型：普通 / 横向条 / 纵向条 / 包装（爆炸）/ 彩虹。 */
export type Special = 'none' | 'row' | 'col' | 'wrap' | 'rainbow';

/** 方块大类：糖果、食材或小熊（小熊不参与颜色匹配，需靠相邻消除或特效清除）。 */
export type TileKind = 'candy' | 'ingredient' | 'teddy';

/** 棋盘上的一个方块。 */
export interface Tile {
  id: number;
  kind: TileKind;
  color: Color | -1;
  special: Special;
}

/** 棋盘单元格：承载方块、冰层、果冻、出生点与出口等状态。 */
export interface Cell {
  /** 是否为空洞（不可放置方块、不参与消除）。 */
  hole: boolean;
  /** 冰层数量，>0 时该格方块被冻结且需要相邻消除来破冰。 */
  ice: number;
  /** 果冻层数量，>0 时需在此格完成消除来清除。 */
  jelly: number;
  /** 是否为食材出生点。 */
  spawn: boolean;
  /** 是否为食材出口。 */
  exit: boolean;
  /** 当前方块，null 表示空格。 */
  tile: Tile | null;
}

/** 二维坐标。 */
export interface Pos {
  r: number;
  c: number;
}

/** 关卡玩法模式。 */
export type GameMode = 'moves' | 'timed' | 'collect' | 'clear' | 'relax';

/** 关卡目标类型。 */
export type ObjectiveType = 'score' | 'collect' | 'jelly' | 'ice' | 'ingredient' | 'teddy';

/** 单条关卡目标。 */
export interface LevelObjective {
  type: ObjectiveType;
  /** 收集类目标限定的颜色。 */
  color?: Color;
  /** 目标数量。 */
  target: number;
}

/** 关卡定义。 */
export interface Level {
  id: number;
  name: string;
  mode: GameMode;
  /** 使用的糖果颜色数量（4~6）。 */
  colors: number;
  /** 步数限制（moves / collect / clear 模式）。 */
  moves?: number;
  /** 时间限制，单位秒（timed 模式）。 */
  time?: number;
  rows: number;
  cols: number;
  objectives: LevelObjective[];
  /** ASCII 布局，用于描述空洞、冰、果冻、出生点与出口。 */
  layout?: string[];
  /** 三星分数门槛。 */
  starScores: [number, number, number];
  /** 掉落权重调整：值越高越容易出现该颜色。 */
  dropRate?: number;
  /** 小熊方块产出概率（0~1），仅配置了 teddy 目标的关卡会使用。 */
  bearRate?: number;
  /** 关卡提示文案。 */
  hint?: string;
}

/** 单次消除产生的得分事件，供 UI 播放特效。 */
export interface ClearEvent {
  cells: Pos[];
  /** 连锁层级，从 1 开始。 */
  cascade: number;
  /** 本次连锁获得的分数。 */
  score: number;
  /** 本次新生成的特殊糖果位置。 */
  created: { pos: Pos; special: Special }[];
  /** 本次被消除的方块（用于播放动画）。 */
  removed: { pos: Pos; tile: Tile }[];
  /** 本次被激活的特殊糖果位置。 */
  activated: Pos[];
}

/** 一次交换的完整结算结果。 */
export interface MoveResult {
  valid: boolean;
  /** 是否交换了两个特殊糖果（触发组合技）。 */
  combo: boolean;
  events: ClearEvent[];
  /** 本步累计得分。 */
  gained: number;
}
