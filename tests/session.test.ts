/**
 * 游戏会话单元测试。
 * 创建者：zhenghq
 */
import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { LEVELS, getLevel } from '../src/game/levels';
import { makeLevel, setGrid } from './helpers';

describe('GameSession 目标与胜负', () => {
  it('限时模式随时间递减并在归零时失败', () => {
    const level = makeLevel(8, 8, { mode: 'timed', time: 5, moves: undefined });
    const session = new GameSession(level, 1);
    expect(session.tick(2)).toBe(true);
    expect(session.timeLeft).toBeCloseTo(3, 5);
    expect(session.tick(4)).toBe(false);
    expect(session.currentStatus).toBe('lost');
  });

  it('步数模式在步数耗尽且目标未达成时失败', () => {
    const level = makeLevel(6, 6, { moves: 1 });
    const session = new GameSession(level, 9);
    setGrid(session.board, [
      [0, 0, 1, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    const result = session.play({ r: 0, c: 2 }, { r: 0, c: 3 });
    expect(result.valid).toBe(true);
    expect(session.movesLeft).toBe(0);
    expect(session.currentStatus).toBe('lost');
  });

  it('达成分数目标后判定胜利', () => {
    const level = makeLevel(6, 6, { moves: 30, objectives: [{ type: 'score', target: 100 }] });
    const session = new GameSession(level, 3);
    setGrid(session.board, [
      [0, 0, 1, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    session.play({ r: 0, c: 2 }, { r: 0, c: 3 });
    expect(session.currentStatus).toBe('won');
  });

  it('非法交换不消耗步数', () => {
    const level = makeLevel(4, 4, { moves: 10 });
    const session = new GameSession(level, 1);
    setGrid(session.board, [
      [0, 1, 2, 0],
      [1, 2, 0, 1],
      [2, 0, 1, 2],
      [0, 1, 2, 0],
    ]);
    const before = session.movesLeft;
    const result = session.play({ r: 0, c: 0 }, { r: 0, c: 1 });
    expect(result.valid).toBe(false);
    expect(session.movesLeft).toBe(before);
    expect(session.usedMoves).toBe(0);
  });

  it('不相邻的交换被拒绝', () => {
    const session = new GameSession(makeLevel(6, 6), 2);
    const result = session.play({ r: 0, c: 0 }, { r: 2, c: 2 });
    expect(result.valid).toBe(false);
  });
});

describe('目标进度', () => {
  it('小熊目标随消除增长并在达成后判定胜利', () => {
    const level = makeLevel(6, 6, {
      moves: 20,
      objectives: [{ type: 'teddy', target: 3 }],
    });
    const session = new GameSession(level, 3);
    setGrid(session.board, [
      [3, 0, 1, -2, 2, 3],
      [3, 1, 0, -2, 2, 0],
      [2, 2, 0, -2, 1, 3],
      [1, 3, 2, 0, 3, 1],
      [2, 0, 1, 3, 2, 0],
      [3, 1, 3, 2, 0, 2],
    ]);
    // 三只小熊竖向相邻，三消后依次连带清除，直接达成收集目标。
    const result = session.play({ r: 0, c: 1 }, { r: 0, c: 2 });
    expect(result.valid).toBe(true);
    const progress = session.progress()[0];
    expect(progress.type).toBe('teddy');
    expect(progress.current).toBeGreaterThan(0);
    expect(progress.done).toBe(true);
    expect(session.currentStatus).toBe('won');
  });

  it('收集类目标随消除增长并封顶', () => {
    const level = makeLevel(6, 6, {
      moves: 20,
      objectives: [{ type: 'collect', color: 2, target: 3 }],
    });
    const session = new GameSession(level, 3);
    setGrid(session.board, [
      [0, 0, 1, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    session.play({ r: 0, c: 2 }, { r: 0, c: 3 });
    const p = session.progress()[0];
    expect(p.current).toBe(3);
    expect(p.current).toBeLessThanOrEqual(p.target);
    expect(p.done).toBe(true);
  });

  it('果冻目标统计已清除层数', () => {
    const level = makeLevel(6, 6, {
      moves: 20,
      objectives: [{ type: 'jelly', target: 2 }],
      layout: ['jj....', '......', '......', '......', '......', '......'],
    });
    const session = new GameSession(level, 3);
    setGrid(session.board, [
      [0, 0, 1, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    // 在果冻格上构造一次消除。
    setGrid(session.board, [
      [3, 3, 3, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    session.play({ r: 1, c: 2 }, { r: 1, c: 3 });
    const p = session.progress()[0];
    expect(p.current).toBeGreaterThan(0);
  });

  it('提示功能返回可行交换', () => {
    const session = new GameSession(makeLevel(8, 8), 5);
    const hint = session.findHint();
    expect(hint).not.toBeNull();
    if (hint) {
      expect(session.board.isValidSwap(hint.a, hint.b)).toBe(true);
    }
  });
});

describe('关卡配置', () => {
  it('所有关卡配置合法', () => {
    for (const level of LEVELS) {
      expect(level.colors).toBeGreaterThanOrEqual(4);
      expect(level.colors).toBeLessThanOrEqual(6);
      expect(level.objectives.length).toBeGreaterThan(0);
      expect(level.starScores[0]).toBeLessThan(level.starScores[1]);
      expect(level.starScores[1]).toBeLessThan(level.starScores[2]);
      if (level.layout) {
        expect(level.layout.length).toBe(level.rows);
        for (const row of level.layout) expect(row.length).toBe(level.cols);
      }
    }
  });

  it('至少包含四种不同玩法模式', () => {
    const modes = new Set(LEVELS.map((l) => l.mode));
    expect(modes.size).toBeGreaterThanOrEqual(4);
  });

  it('分数门槛足够高，单次消除无法直接过关', () => {
    for (const level of LEVELS) {
      const scoreObjective = level.objectives.find((o) => o.type === 'score');
      if (scoreObjective) expect(scoreObjective.target).toBeGreaterThanOrEqual(2000);
    }
  });

  it('包含消除小熊的关卡且配置了小熊产出概率', () => {
    const teddyLevels = LEVELS.filter((l) => l.objectives.some((o) => o.type === 'teddy'));
    expect(teddyLevels.length).toBeGreaterThanOrEqual(3);
    for (const level of teddyLevels) {
      expect(level.bearRate ?? 0).toBeGreaterThan(0);
      expect(level.objectives.some((o) => o.type === 'teddy' && o.target > 0)).toBe(true);
    }
  });

  it('获胜时至少获得一星，保证后续关卡可以解锁', () => {
    const level = makeLevel(6, 6, {
      moves: 20,
      objectives: [{ type: 'score', target: 10 }],
      starScores: [999999, 1000000, 1000001],
    });
    const session = new GameSession(level, 3);
    setGrid(session.board, [
      [0, 0, 1, 0, 1, 2],
      [1, 2, 2, 2, 0, 1],
      [2, 1, 0, 1, 2, 0],
      [1, 2, 1, 0, 1, 2],
      [0, 1, 2, 1, 0, 1],
      [2, 0, 1, 2, 1, 0],
    ]);
    session.play({ r: 0, c: 2 }, { r: 0, c: 3 });
    expect(session.currentStatus).toBe('won');
    expect(session.stars()).toBeGreaterThanOrEqual(1);
  });

  it('按编号取关卡且越界回退', () => {
    expect(getLevel(1).id).toBe(1);
    expect(getLevel(999).id).toBe(1);
  });
});
