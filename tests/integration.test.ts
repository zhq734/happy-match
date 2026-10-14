/**
 * 界面集成冒烟测试：在 jsdom 中真实渲染应用并模拟用户操作。
 * 创建者：zhenghq
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVELS } from '../src/game/levels';

/** 等待若干个动画帧与微任务完成。 */
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** 安装浏览器 API 桩，弥补 jsdom 缺失的能力。 */
function installStubs(): void {
  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    });
  }
  if (!('AudioContext' in window)) {
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createGain() {
        return { gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', { writable: true, value: FakeAudioContext });
  }
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 8)) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
  // jsdom 不实现 canvas 2D，桩一个最小上下文，避免特效绘制产生告警。
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
}

/**
 * 在测试环境中引导应用启动。
 * @returns 根容器
 */
async function bootstrap(): Promise<HTMLDivElement> {
  document.body.innerHTML = '<div id="app"></div>';
  installStubs();
  localStorage.clear();
  vi.resetModules();
  await import('../src/main');
  await settle();
  return document.getElementById('app') as HTMLDivElement;
}

describe('应用集成冒烟测试', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('首页正确渲染标题与操作按钮', async () => {
    const app = await bootstrap();
    expect(app.querySelector('h1')?.textContent).toContain('开心消消乐');
    const labels = [...app.querySelectorAll('.home-actions .btn')].map((b) => b.textContent ?? '');
    expect(labels.some((t) => t.includes('开始游戏'))).toBe(true);
    expect(labels.some((t) => t.includes('玩法说明'))).toBe(true);
    expect(labels.some((t) => t.includes('设置'))).toBe(true);
  });

  it('点击开始游戏进入关卡地图并渲染全部关卡卡片', async () => {
    const app = await bootstrap();
    const startBtn = [...app.querySelectorAll<HTMLButtonElement>('.home-actions .btn')].find((b) =>
      b.textContent?.includes('开始游戏'),
    );
    startBtn?.click();
    await settle();
    const cards = app.querySelectorAll('.level-card');
    expect(cards.length).toBe(LEVELS.length);
    // 第一关解锁，第二关锁定。
    expect(cards[0].classList.contains('locked')).toBe(false);
    expect(cards[1].classList.contains('locked')).toBe(true);
  });

  it('进入第一关后渲染棋盘与方块', async () => {
    const app = await bootstrap();
    [...app.querySelectorAll<HTMLButtonElement>('.home-actions .btn')]
      .find((b) => b.textContent?.includes('开始游戏'))
      ?.click();
    await settle();
    (app.querySelectorAll<HTMLButtonElement>('.level-card')[0]).click();
    await settle(10);
    expect(app.querySelector('.board')).not.toBeNull();
    expect(app.querySelectorAll('.tile').length).toBeGreaterThan(40);
    expect(app.querySelectorAll('.objective').length).toBeGreaterThan(0);
  });

  it('点击两个相邻方块能触发一次有效交换并更新分数', async () => {
    const app = await bootstrap();
    [...app.querySelectorAll<HTMLButtonElement>('.home-actions .btn')]
      .find((b) => b.textContent?.includes('开始游戏'))
      ?.click();
    await settle();
    (app.querySelectorAll<HTMLButtonElement>('.level-card')[0]).click();
    await settle(10);

    const boardEl = app.querySelector('.board') as HTMLElement;
    const session = (
      window as unknown as {
        happyMatch: { game: { session: { findHint(): { a: { r: number; c: number }; b: { r: number; c: number } } | null; board: { score: number } } } };
      }
    ).happyMatch.game.session;
    const hint = session.findHint();
    expect(hint).not.toBeNull();
    const { a, b } = hint as NonNullable<typeof hint>;

    const cell = parseFloat(boardEl.style.width) / 8;
    const rect = boardEl.getBoundingClientRect();
    const clickAt = (r: number, c: number): void => {
      const x = rect.left + c * cell + cell / 2;
      const y = rect.top + r * cell + cell / 2;
      boardEl.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }),
      );
    };
    const before = session.board.score;
    clickAt(a.r, a.c);
    clickAt(b.r, b.c);
    await settle(24);
    expect(session.board.score).toBeGreaterThan(before);
  });

  it('玩法说明与设置弹窗可以打开', async () => {
    const app = await bootstrap();
    const howBtn = [...app.querySelectorAll<HTMLButtonElement>('.home-actions .btn')].find((b) =>
      b.textContent?.includes('玩法说明'),
    );
    howBtn?.click();
    await settle();
    expect(app.querySelector('.modal')).not.toBeNull();
    expect(app.textContent).toContain('拖动或点击相邻糖果');
  });

  it('重置进度事件可清空存档', async () => {
    const app = await bootstrap();
    [...app.querySelectorAll<HTMLButtonElement>('.home-actions .btn')]
      .find((b) => b.textContent?.includes('开始游戏'))
      ?.click();
    await settle();
    window.dispatchEvent(new CustomEvent('happy-match:reset-progress'));
    await settle();
    const raw = localStorage.getItem('happy-match-save-v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.totalStars).toBe(0);
    expect(app.querySelectorAll('.level-card').length).toBe(LEVELS.length);
  });

  it('结算弹窗点击“下一关”后应进入下一关而非重开当前关', async () => {
    const app = await bootstrap();
    [...app.querySelectorAll<HTMLButtonElement>('.home-actions .btn')]
      .find((b) => b.textContent?.includes('开始游戏'))
      ?.click();
    await settle();
    (app.querySelectorAll<HTMLButtonElement>('.level-card')[0]).click();
    await settle(10);

    // 直接将会话标记为通关，触发结算弹窗。
    const instance = (
      window as unknown as {
        happyMatch: { game: { session: { forceEnd(status: 'won'): void } } };
      }
    ).happyMatch;
    instance.game.session.forceEnd('won');
    await settle(30);

    const nextBtn = [...app.querySelectorAll<HTMLButtonElement>('.modal .btn')].find((b) =>
      b.textContent?.includes('下一关'),
    );
    expect(nextBtn).toBeDefined();
    nextBtn?.click();
    await settle(12);

    const game = (
      window as unknown as {
        happyMatch: { game: { currentLevel: { id: number } } };
      }
    ).happyMatch.game;
    expect(game.currentLevel.id).toBe(2);
    expect(app.querySelector('.topbar h2')?.textContent).toContain('果冻初现');
  });
});
