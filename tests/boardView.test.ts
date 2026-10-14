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
  beforeEach(() => {
    // jsdom 默认不实现 canvas 2D，桩一个最小上下文以验证粒子系统。
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        fillRect: () => {},
        translate: () => {},
        rotate: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        setTransform: () => {},
      }),
    });
  });

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

  it('消除时使用 Canvas 粒子绘制特效，避免大量 DOM 节点造成卡顿', () => {
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

    expect(view.root.querySelector('canvas.fx-canvas')).not.toBeNull();
    expect(view.fxParticleCount).toBeGreaterThan(0);
    // 特效不应再以大量 DOM 节点的形式存在。
    expect(view.root.querySelectorAll('.spark, .shard, .impact-ring, .impact-flash').length).toBe(0);

    view.destroy();
    measure.remove();
  });

  it('条纹糖激活时生成贯穿棋盘的 Canvas 光束粒子', () => {
    const measure = document.createElement('div');
    stubSize(measure, 700, 700);
    document.body.appendChild(measure);

    const board = makeBoard(makeLevel(8, 8));
    const view = new BoardView(
      board,
      () => ({ valid: false, events: [], gained: 0, combo: false }),
      measure,
    );

    const before = view.fxParticleCount;
    view.beamAt(2, 5, 'row', 'var(--candy-4)');
    expect(view.fxParticleCount).toBeGreaterThan(before);
    expect(view.root.querySelectorAll('.beam').length).toBe(0);

    view.destroy();
    measure.remove();
  });

  it('销毁视图后停止特效循环并清空粒子', () => {
    const measure = document.createElement('div');
    stubSize(measure, 700, 700);
    document.body.appendChild(measure);

    const board = makeBoard(makeLevel(8, 8));
    const view = new BoardView(
      board,
      () => ({ valid: false, events: [], gained: 0, combo: false }),
      measure,
    );
    view.impactAt(1, 1, 'var(--candy-1)', 'none', 6);
    expect(view.fxParticleCount).toBeGreaterThan(0);

    view.destroy();
    expect(view.fxParticleCount).toBe(0);
    measure.remove();
  });
});
