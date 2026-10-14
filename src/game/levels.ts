/**
 * 关卡配置数据。
 * 创建者：zhenghq
 */
import type { Level } from './types';

/**
 * 关卡布局图例：
 * `.` 普通格  `#` 空洞  `i` 单层冰  `I` 双层冰
 * `j` 单层果冻  `J` 双层果冻  `s` 食材出生点  `e` 食材出口
 */
export const LAYOUT_LEGEND: Record<string, string> = {
  '.': '普通格',
  '#': '空洞',
  i: '冰层',
  I: '厚冰层',
  j: '果冻',
  J: '厚果冻',
  s: '食材出生点',
  e: '食材出口',
};

/** 全部关卡列表。 */
export const LEVELS: Level[] = [
  {
    id: 1,
    name: '甜蜜起步',
    mode: 'moves',
    colors: 4,
    moves: 22,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'score', target: 1200 }],
    starScores: [1200, 2000, 3000],
    hint: '交换相邻糖果，连成三个或以上即可消除。',
  },
  {
    id: 2,
    name: '果冻初现',
    mode: 'clear',
    colors: 5,
    moves: 24,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'jelly', target: 12 }],
    starScores: [2000, 3200, 4600],
    layout: [
      '........',
      '..jjjj..',
      '..j..j..',
      '..j..j..',
      '..j..j..',
      '..jjjj..',
      '........',
      '........',
    ],
    hint: '在果冻格上完成消除，即可清除果冻。',
  },
  {
    id: 3,
    name: '红色风暴',
    mode: 'collect',
    colors: 5,
    moves: 26,
    rows: 8,
    cols: 8,
    objectives: [
      { type: 'collect', color: 0, target: 24 },
      { type: 'collect', color: 1, target: 18 },
    ],
    starScores: [2500, 4000, 5600],
    dropRate: 0.12,
    hint: '四消可以生成条纹糖，五消生成彩虹糖。',
  },
  {
    id: 4,
    name: '极速冲刺',
    mode: 'timed',
    colors: 5,
    time: 70,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'score', target: 2600 }],
    starScores: [2600, 4200, 6000],
    hint: '限时模式！尽可能快速连续消除。',
  },
  {
    id: 5,
    name: '破冰行动',
    mode: 'clear',
    colors: 5,
    moves: 28,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'ice', target: 16 }],
    starScores: [2600, 4200, 6000],
    layout: [
      '........',
      '.iiiiii.',
      '.i####i.',
      '.i#..#i.',
      '.i#..#i.',
      '.i####i.',
      '.iiiiii.',
      '........',
    ],
    hint: '在被冰封的格子旁消除，即可击碎冰层。',
  },
  {
    id: 6,
    name: '彩虹工坊',
    mode: 'moves',
    colors: 6,
    moves: 24,
    rows: 8,
    cols: 8,
    objectives: [
      { type: 'collect', color: 5, target: 20 },
      { type: 'score', target: 3000 },
    ],
    starScores: [3000, 4800, 6800],
    hint: '六种颜色登场！彩虹糖可以消除全场同色糖果。',
  },
  {
    id: 7,
    name: '果冻迷宫',
    mode: 'clear',
    colors: 5,
    moves: 30,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'jelly', target: 24 }],
    starScores: [3200, 5000, 7200],
    layout: [
      'jjjjjjjj',
      'j......j',
      'j.jjjj.j',
      'j.j..j.j',
      'j.j..j.j',
      'j.jjjj.j',
      'j......j',
      'jjjjjjjj',
    ],
    hint: '清除所有果冻即可通关，善用条纹糖。',
  },
  {
    id: 8,
    name: '传送蛋糕',
    mode: 'moves',
    colors: 5,
    moves: 24,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'ingredient', target: 2 }],
    starScores: [2800, 4400, 6400],
    layout: [
      's......s',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'e......e',
    ],
    hint: '让食材从顶部掉落到底部出口即可收集。',
  },
  {
    id: 9,
    name: '双重夹击',
    mode: 'clear',
    colors: 6,
    moves: 28,
    rows: 8,
    cols: 8,
    objectives: [
      { type: 'ice', target: 12 },
      { type: 'jelly', target: 12 },
    ],
    starScores: [3400, 5200, 7600],
    layout: [
      'IiiiiiiI',
      'ijjjjjji',
      'ij....ji',
      'ij....ji',
      'ij....ji',
      'ij....ji',
      'ijjjjjji',
      'IiiiiiiI',
    ],
    hint: '冰层与果冻同时出现，规划好每一步。',
  },
  {
    id: 10,
    name: '时光沙漏',
    mode: 'timed',
    colors: 6,
    time: 60,
    rows: 8,
    cols: 8,
    objectives: [{ type: 'score', target: 4000 }],
    starScores: [4000, 6200, 8800],
    hint: '倒计时压力更大，优先制造连锁。',
  },
  {
    id: 11,
    name: '食材远征',
    mode: 'collect',
    colors: 6,
    moves: 30,
    rows: 8,
    cols: 8,
    objectives: [
      { type: 'ingredient', target: 3 },
      { type: 'collect', color: 3, target: 22 },
    ],
    starScores: [4200, 6400, 9200],
    layout: [
      's......s',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'e......e',
    ],
    hint: '兼顾食材与收集目标，注意出口位置。',
  },
  {
    id: 12,
    name: '终极挑战',
    mode: 'clear',
    colors: 6,
    moves: 32,
    rows: 8,
    cols: 8,
    objectives: [
      { type: 'jelly', target: 20 },
      { type: 'ice', target: 10 },
      { type: 'score', target: 5000 },
    ],
    starScores: [5000, 7600, 11000],
    layout: [
      'IIIIIIII',
      'IJjjjjJI',
      'Ij....jI',
      'Ij....jI',
      'Ij....jI',
      'Ij....jI',
      'IJjjjjJI',
      'IIIIIIII',
    ],
    hint: '最终关卡！冰、果冻与分数三重挑战。',
  },
];

/**
 * 按编号获取关卡定义。
 * @param id 关卡编号
 * @returns 关卡定义，不存在时返回第一关
 */
export function getLevel(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

/** 关卡总数。 */
export const LEVEL_COUNT = LEVELS.length;
