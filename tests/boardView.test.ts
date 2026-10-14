/**
 * 棋盘视图测试：验证自适应尺寸测量与消除特效节点。
 * 创建者：zhenghq
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { BoardView } from '../src/ui/boardView';
import { makeBoard, makeLevel } from './helpers';

/** 为元素模拟一个固定的可用尺寸。 */
function stubSize(node: HTMLElement, width: number, height: number): void {
  Object.defineProperty(node, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(node, 'clientHeight', { configurable: true, value: height });
}

describe('BoardView 自适应与特效', () => {
  it('按照外部可用容器放大棋盘，而不是被棋盘自身尺寸限制', () => {
    const measure = document.createElement('div');
    stubSize(measure, 900, 760);
    document.body.appendChild(measure);

    const board = makeBoard(makeLevel(8, 8));
    const view = new BoardView(
      board,
      () => ({ valid: false, events: [], gained: 0, combo: false }),
      measure,
    );

    expect(parseFloat(view.root.style.width)).toBeGreaterThan(600);
    expect(parseFloat(view.root.style.height)).toBeGreaterThan(600);
    view.destroy();
    measure.remove();
  });

  it('消除时生成冲击波、闪光、碎片与粒子特效', () => {
    const measure = document.createElement('div');
    stubSize(measure, 700, 700);
    document.body.appendChild(measure);

    const board = makeBoard(makeLevel(8, 8));
    const view = new BoardView(
      board,
      () => ({ valid: false, events: [], gained: 0, combo: false }),
      measure,
    );

    view.impactAt(3, 4, 'var(--candy-0)', 'none', 8);

    expect(view.root.querySelectorAll('.impact-ring').length).toBeGreaterThan(0);
    expect(view.root.querySelectorAll('.impact-flash').length).toBeGreaterThan(0);
    expect(view.root.querySelectorAll('.shard').length).toBeGreaterThan(0);
    expect(view.root.querySelectorAll('.spark').length).toBeGreaterThan(0);

    view.destroy();
    measure.remove();
  });

  it('条纹糖激活时生成贯穿棋盘的光束特效', () => {
    const measure = document.createElement('div');
    stubSize(measure, 700, 700);
    document.body.appendChild(measure);

    const board = makeBoard(makeLevel(8, 8));
    const view = new BoardView(
      board,
      () => ({ valid: false, events: [], gained: 0, combo: false }),
      measure,
    );

    view.beamAt(2, 5, 'row', 'var(--candy-4)');
    expect(view.root.querySelectorAll('.beam-row').length).toBe(1);

    view.beamAt(2, 5, 'col', 'var(--candy-4)');
    expect(view.root.querySelectorAll('.beam-col').length).toBe(1);

    view.destroy();
    measure.remove();
  });
});
