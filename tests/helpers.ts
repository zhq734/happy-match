/**
 * 测试辅助工具。
 * 创建者：zhenghq
 */
import { Board } from '../src/game/board';
import { createRng } from '../src/game/rng';
import type { Cell, Color, Level, Special, Tile } from '../src/game/types';

/**
 * 构造一个纯色测试关卡。
 * @param rows 行数
 * @param cols 列数
 * @param extra 覆盖字段
 * @returns 关卡定义
 */
export function makeLevel(rows: number, cols: number, extra: Partial<Level> = {}): Level {
  return {
    id: 999,
    name: '测试关卡',
    mode: 'moves',
    colors: 4,
    moves: 30,
    rows,
    cols,
    objectives: [{ type: 'score', target: 100000 }],
    starScores: [1000, 2000, 3000],
    ...extra,
  };
}

/**
 * 用数值矩阵填充棋盘；-1 表示空格。
 * @param board 棋盘
 * @param grid 数值矩阵
 * @param specials 特殊糖果映射，键为 `r,c`
 */
export function setGrid(
  board: Board,
  grid: number[][],
  specials: Record<string, Special> = {},
): void {
  let id = 10000;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = board.cellAt(r, c) as Cell;
      const v = grid[r][c];
      if (v < 0) {
        cell.tile = null;
        continue;
      }
      const special = specials[`${r},${c}`] ?? 'none';
      const tile: Tile = { id: id++, kind: 'candy', color: v as Color, special };
      cell.tile = tile;
    }
  }
}

/**
 * 创建指定种子与布局的棋盘。
 * @param level 关卡
 * @param seed 随机种子
 * @returns 棋盘实例
 */
export function makeBoard(level: Level, seed = 1): Board {
  return new Board(level, createRng(seed));
}
