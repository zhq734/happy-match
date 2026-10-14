/**
 * 棋盘引擎单元测试。
 * 创建者：zhenghq
 */
import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/board';
import { makeBoard, makeLevel, setGrid } from './helpers';

describe('Board 初始化', () => {
  it('填充所有非空洞格子', () => {
    const level = makeLevel(8, 8, { layout: ['....', '.##.', '.##.', '....'] , cols: 4, rows: 4 });
    const board = makeBoard(level, 7);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = board.cellAt(r, c)!;
        if (cell.hole) expect(cell.tile).toBeNull();
        else expect(cell.tile).not.toBeNull();
      }
    }
  });

  it('初始棋盘不含现成三消', () => {
    const board = makeBoard(makeLevel(8, 8), 42);
    expect(board.findMatchGroups()).toHaveLength(0);
  });

  it('初始棋盘存在可行移动', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const board = makeBoard(makeLevel(8, 8), seed);
      expect(board.hasPossibleMove()).toBe(true);
    }
  });

  it('相同种子产生相同棋盘', () => {
    const a = makeBoard(makeLevel(8, 8), 123);
    const b = makeBoard(makeLevel(8, 8), 123);
    const gridA = a.cells.map((c) => c.tile?.color ?? -1);
    const gridB = b.cells.map((c) => c.tile?.color ?? -1);
    expect(gridA).toEqual(gridB);
  });
});

describe('匹配检测', () => {
  it('识别横向三消', () => {
    const board = makeBoard(makeLevel(4, 4), 1);
    setGrid(board, [
      [0, 0, 0, 1],
      [1, 2, 1, 2],
      [2, 1, 2, 1],
      [1, 2, 1, 2],
    ]);
    const groups = board.findMatchGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(3);
    expect(groups[0].horizontalMax).toBe(3);
  });

  it('识别纵向三消', () => {
    const board = makeBoard(makeLevel(4, 4), 1);
    setGrid(board, [
      [0, 1, 2, 1],
      [0, 2, 1, 2],
      [0, 1, 2, 1],
      [1, 2, 1, 2],
    ]);
    const groups = board.findMatchGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].verticalMax).toBe(3);
  });

  it('L 形匹配合并为同一分组', () => {
    const board = makeBoard(makeLevel(4, 4), 1);
    setGrid(board, [
      [0, 0, 0, 1],
      [0, 2, 1, 2],
      [0, 1, 2, 1],
      [1, 2, 1, 2],
    ]);
    const groups = board.findMatchGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].hasBoth).toBe(true);
    expect(groups[0].cells).toHaveLength(5);
  });
});

describe('交换合法性', () => {
  it('拒绝无法形成匹配的交换', () => {
    const board = makeBoard(makeLevel(4, 4), 1);
    setGrid(board, [
      [0, 1, 2, 0],
      [1, 2, 0, 1],
      [2, 0, 1, 2],
      [0, 1, 2, 0],
    ]);
    expect(board.isValidSwap({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe(false);
  });

  it('接受可以形成匹配的交换', () => {
    const board = makeBoard(makeLevel(4, 4), 1);
    setGrid(board, [
      [0, 0, 1, 0],
      [1, 2, 2, 2],
      [2, 1, 0, 1],
      [1, 2, 1, 0],
    ]);
    expect(board.isValidSwap({ r: 0, c: 2 }, { r: 0, c: 3 })).toBe(true);
  });

  it('相邻判定正确', () => {
    expect(Board.isAdjacent({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe(true);
    expect(Board.isAdjacent({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe(false);
  });
});

describe('消除结算', () => {
  it('三消后清除对应格子并得分', () => {
    const board = makeBoard(makeLevel(6, 6), 3);
    setGrid(board, [
      [0, 0, 1, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    const result = board.resolveSwap({ r: 0, c: 2 }, { r: 0, c: 3 });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.gained).toBeGreaterThan(0);
    expect(board.findMatchGroups()).toHaveLength(0);
  });

  it('非法交换会还原棋盘', () => {
    const board = makeBoard(makeLevel(4, 4), 1);
    setGrid(board, [
      [0, 1, 2, 0],
      [1, 2, 0, 1],
      [2, 0, 1, 2],
      [0, 1, 2, 0],
    ]);
    const before = board.cells.map((c) => c.tile?.color ?? -1);
    const result = board.resolveSwap({ r: 0, c: 0 }, { r: 0, c: 1 });
    expect(result.events).toHaveLength(0);
    const after = board.cells.map((c) => c.tile?.color ?? -1);
    expect(after).toEqual(before);
  });

  it('四消生成条纹糖果', () => {
    const board = makeBoard(makeLevel(6, 6), 5);
    setGrid(board, [
      [0, 0, 0, 1, 0, 2],
      [1, 2, 1, 2, 1, 0],
      [2, 1, 2, 1, 2, 1],
      [1, 2, 1, 2, 1, 2],
      [2, 1, 2, 1, 2, 1],
      [1, 2, 1, 2, 1, 2],
    ]);
    const result = board.resolveSwap({ r: 0, c: 3 }, { r: 0, c: 4 });
    expect(result.events.length).toBeGreaterThan(0);
    const created = result.events.flatMap((e) => e.created);
    expect(created.length).toBeGreaterThan(0);
    expect(created.some((c) => c.special === 'row' || c.special === 'col')).toBe(true);
  });

  it('结算后不再残留三消', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const board = makeBoard(makeLevel(8, 8), seed);
      let guard = 0;
      while (board.findMatchGroups().length === 0 && guard++ < 50) {
        // 找到任意可行交换并执行，直到产生消除。
        let done = false;
        for (let r = 0; r < board.rows && !done; r++) {
          for (let c = 0; c < board.cols && !done; c++) {
            const pairs = [
              [{ r, c }, { r, c: c + 1 }],
              [{ r, c }, { r: r + 1, c }],
            ];
            for (const [a, b] of pairs) {
              if (!board.isPlayable(b.r, b.c)) continue;
              if (board.isValidSwap(a, b)) {
                board.resolveSwap(a, b);
                done = true;
                break;
              }
            }
          }
        }
        if (!done) break;
      }
      expect(board.findMatchGroups()).toHaveLength(0);
    }
  });
});

describe('特殊玩法机制', () => {
  it('食材在出生点生成并向下掉落', () => {
    const level = makeLevel(4, 4, { layout: ['s...', '....', '....', '....'] });
    const board = makeBoard(level, 1);
    setGrid(board, [
      [0, 0, 1, 0],
      [1, 2, 1, 2],
      [2, 1, 2, 1],
      [1, 2, 1, 2],
    ]);
    board.resolveSwap({ r: 0, c: 2 }, { r: 0, c: 3 }, 1);
    const spawned = board.tileAt(0, 0);
    expect(spawned).not.toBeNull();
    expect(spawned?.kind).toBe('ingredient');
  });

  it('食材抵达出口格后被收集', () => {
    const level = makeLevel(4, 4, {
      layout: ['s...', '....', '....', 'e...'],
      objectives: [{ type: 'ingredient', target: 1 }],
    });
    const board = makeBoard(level, 2);
    setGrid(board, [
      [1, 1, 0, 1],
      [2, 1, 2, 1],
      [1, 2, 1, 2],
      [2, 0, 0, 1],
    ]);
    // 手动在出口格放入食材，再触发一次有效消除使其结算收集。
    const exitCell = board.cellAt(3, 0)!;
    exitCell.tile = { id: 777, kind: 'ingredient', color: -1, special: 'none' };
    board.resolveSwap({ r: 0, c: 2 }, { r: 0, c: 3 }, 1);
    expect(board.ingredientsCollected).toBeGreaterThanOrEqual(1);
  });

  it('彩虹糖与普通糖果交换会清除全场同色糖果', () => {
    const level = makeLevel(6, 6, { colors: 5 });
    const board = makeBoard(level, 8);
    setGrid(
      board,
      [
        [4, 2, 0, 1, 3, 0],
        [0, 2, 1, 0, 2, 1],
        [1, 0, 2, 3, 1, 0],
        [2, 1, 0, 2, 0, 1],
        [0, 3, 1, 0, 3, 2],
        [1, 0, 3, 1, 0, 3],
      ],
      { '0,0': 'rainbow' },
    );
    const before = board.colorCollected[2];
    board.resolveSwap({ r: 0, c: 0 }, { r: 0, c: 1 });
    // 棋盘上共有 6 个颜色 2 的糖果，应被彩虹糖全部清除。
    expect(board.colorCollected[2] - before).toBeGreaterThanOrEqual(5);
  });

  it('条纹糖与包装糖组合清除多行多列', () => {
    const level = makeLevel(6, 6, { colors: 5 });
    const board = makeBoard(level, 4);
    setGrid(
      board,
      [
        [1, 2, 0, 1, 2, 0],
        [0, 1, 2, 0, 1, 2],
        [2, 0, 1, 2, 0, 1],
        [1, 2, 0, 1, 2, 0],
        [0, 1, 2, 0, 1, 2],
        [2, 0, 1, 2, 0, 1],
      ],
      { '2,2': 'row', '2,3': 'wrap' },
    );
    const result = board.resolveSwap({ r: 2, c: 2 }, { r: 2, c: 3 });
    expect(result.combo).toBe(true);
    const cleared = result.events.reduce((sum, e) => sum + e.cells.length, 0);
    expect(cleared).toBeGreaterThanOrEqual(12);
  });
});
