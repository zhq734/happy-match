/**
 * 游戏界面：串联棋盘视图与游戏会话，渲染 HUD、目标、计时与结算弹窗。
 * 创建者：zhenghq
 */
import { GameSession, type ObjectiveProgress, type SessionSummary } from '../game/session';
import type { Level, Pos } from '../game/types';
import { audio } from '../audio/sound';
import { BoardView, type SwapOutcome } from './boardView';
import { clear, el, sleep } from './dom';

/** 模式显示名。 */
const MODE_LABEL: Record<Level['mode'], string> = {
  moves: '步数挑战',
  timed: '限时冲刺',
  collect: '收集目标',
  clear: '清障挑战',
  relax: '轻松模式',
};

/** 目标图标。 */
const OBJ_ICON: Record<string, string> = {
  score: '🏆',
  jelly: '🟣',
  ice: '❄️',
  ingredient: '🍰',
  collect: '🍬',
  teddy: '🧸',
};

/** 目标名称。 */
const OBJ_NAME: Record<string, string> = {
  score: '分数',
  jelly: '果冻',
  ice: '冰层',
  ingredient: '食材',
  collect: '收集',
  teddy: '小熊',
};

/** 结果回调。 */
export type ResultHandler = (summary: SessionSummary) => void;

/**
 * 游戏界面控制器。
 * 创建者：zhenghq
 */
export class GameScreen {
  readonly root: HTMLElement;
  private session: GameSession;
  private view: BoardView | null = null;
  private readonly level: Level;
  private readonly onExit: () => void;
  private readonly onResult: ResultHandler;
  private readonly onRestart: () => void;
  private rafId = 0;
  private lastTs = 0;
  private paused = false;
  private finished = false;
  private hudMoves!: HTMLSpanElement;
  private hudTime!: HTMLSpanElement;
  private hudScore!: HTMLSpanElement;
  private hudCombo!: HTMLSpanElement;
  private objectivesBox!: HTMLDivElement;
  private boardArea!: HTMLDivElement;
  private topbarTitle!: HTMLHeadingElement;
  private readonly onResize = (): void => this.view?.layout();
  private resizeObserver: ResizeObserver | null = null;

  /**
   * 构造游戏界面。
   * @param level 关卡定义
   * @param seed 随机种子
   * @param onExit 退出回调
   * @param onResult 结算回调
   * @param onRestart 重开回调
   */
  constructor(
    level: Level,
    seed: number,
    onExit: () => void,
    onResult: ResultHandler,
    onRestart: () => void,
  ) {
    this.level = level;
    this.session = new GameSession(level, seed);
    this.onExit = onExit;
    this.onResult = onResult;
    this.onRestart = onRestart;
    this.root = el('section', { className: 'screen game-screen' });
    this.build();
    window.addEventListener('resize', this.onResize);
    // 监听可用区域变化（HUD 换行、目标增减等），保证棋盘始终铺满空间。
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.view?.layout());
      this.resizeObserver.observe(this.boardArea);
    }
  }

  /** 构建界面结构。 */
  private build(): void {
    this.topbarTitle = el('h2', { text: this.level.name });

    const back = el('button', {
      className: 'btn btn-icon btn-ghost',
      text: '←',
      attrs: { 'aria-label': '返回' },
      onClick: () => this.handleExit(),
    });
    const soundBtn = el('button', {
      className: 'btn btn-icon btn-ghost',
      text: '🔊',
      attrs: { 'aria-label': '音效开关' },
      onClick: () => {
        const enabled = audio.toggleSfx();
        soundBtn.textContent = enabled ? '🔊' : '🔇';
        audio.play('click');
      },
    });

    this.hudScore = el('span', { className: 'num', text: '0' });
    const topbar = el('header', {
      className: 'topbar',
      children: [
        back,
        this.topbarTitle,
        el('span', { className: 'spacer' }),
        el('span', {
          className: 'chip',
          children: [el('span', { text: '总分' }), this.hudScore],
        }),
        soundBtn,
      ],
    });

    this.hudMoves = el('span', { className: 'hud-value', text: '0' });
    this.hudTime = el('span', { className: 'hud-value', text: '0' });
    this.hudCombo = el('span', { className: 'hud-value', text: '1' });

    const hud = el('div', { className: 'hud' });
    if (Number.isFinite(this.session.movesLeft)) {
      hud.appendChild(
        el('div', {
          className: 'hud-group',
          children: [el('span', { className: 'hud-label', text: '剩余步数' }), this.hudMoves],
        }),
      );
    }
    if (Number.isFinite(this.session.timeLeft)) {
      hud.appendChild(
        el('div', {
          className: 'hud-group',
          children: [el('span', { className: 'hud-label', text: '剩余时间' }), this.hudTime],
        }),
      );
    }
    hud.appendChild(
      el('div', {
        className: 'hud-group',
        children: [el('span', { className: 'hud-label', text: '最高连锁' }), this.hudCombo],
      }),
    );

    this.objectivesBox = el('div', { className: 'objectives' });
    this.boardArea = el('div', { className: 'board-area' });

    const actions = el('div', {
      className: 'action-bar',
      children: [
        this.actionButton('💡 提示', () => this.useHint()),
        this.actionButton('🔀 洗牌', () => this.useShuffle()),
        this.actionButton('🔄 重开', () => this.handleRestart()),
        this.actionButton('⏸ 暂停', () => this.togglePause(true)),
      ],
    });

    const shell = el('div', {
      className: 'game-shell',
      children: [hud, this.objectivesBox, this.boardArea, actions],
    });

    this.root.appendChild(topbar);
    this.root.appendChild(shell);
  }

  /**
   * 创建一个操作按钮。
   * @param label 文案
   * @param handler 点击处理
   * @returns 按钮
   */
  private actionButton(label: string, handler: () => void): HTMLButtonElement {
    return el('button', {
      className: 'btn',
      text: label,
      onClick: () => {
        audio.play('click');
        handler();
      },
    });
  }

  /** 挂载到页面并启动。 */
  mount(container: HTMLElement): void {
    container.appendChild(this.root);
    this.createBoardView();
    this.refreshObjectives();
    this.refreshHud();
    this.startLoop();
    // 首次进入给出模式提示。
    if (this.level.hint) {
      window.setTimeout(() => this.toast(this.level.hint as string), 400);
    }
  }

  /** 创建棋盘视图。 */
  private createBoardView(): void {
    // 用 boardArea 作为测量基准，避免棋盘尺寸自我锁死。
    this.view = new BoardView(this.session.board, (a, b) => this.handleSwap(a, b), this.boardArea);
    const frame = el('div', { className: 'board-frame', children: [this.view.root] });
    clear(this.boardArea);
    this.boardArea.appendChild(frame);
    // 等待布局完成后按容器尺寸自适应。
    requestAnimationFrame(() => this.view?.layout());
  }

  /**
   * 处理一次交换请求。
   * @param a 起点
   * @param b 终点
   * @returns 交换结果
   */
  private handleSwap(a: Pos, b: Pos): SwapOutcome {
    const result = this.session.play(a, b);
    if (!result.valid) {
      audio.play('swap');
      return { valid: false, events: [], gained: 0, combo: false };
    }
    audio.play(result.combo ? 'combo' : 'swap');
    if (result.events.length > 0) {
      const maxCascade = Math.max(...result.events.map((e) => e.cascade));
      window.setTimeout(() => audio.play('match', maxCascade), 120);
      if (result.events.some((e) => e.created.length > 0 || e.activated.length > 0)) {
        window.setTimeout(() => audio.play('special'), 200);
      }
      if (maxCascade >= 3) {
        window.setTimeout(() => audio.play('combo'), 260);
      }
    }
    // 先刷新目标进度，再在动画期间刷新 HUD，避免结算瞬间集中触发样式计算。
    this.refreshObjectives();
    window.setTimeout(() => this.refreshHud(), 0);
    return {
      valid: true,
      events: result.events,
      gained: result.gained,
      combo: result.combo,
    };
  }

  /** 刷新 HUD 数值。 */
  private refreshHud(): void {
    this.hudScore.textContent = String(this.session.board.score);
    if (Number.isFinite(this.session.movesLeft)) {
      this.hudMoves.textContent = String(this.session.movesLeft);
      const danger = this.session.movesLeft <= 3;
      if (this.hudMoves.classList.contains('danger') !== danger) {
        this.hudMoves.classList.toggle('danger', danger);
      }
    }
    if (Number.isFinite(this.session.timeLeft)) {
      this.hudTime.textContent = String(Math.ceil(this.session.timeLeft));
      const danger = this.session.timeLeft <= 10;
      if (this.hudTime.classList.contains('danger') !== danger) {
        this.hudTime.classList.toggle('danger', danger);
      }
    }
    this.hudCombo.textContent = String(Math.max(1, this.session.board.maxCascade));
  }

  /** 刷新目标进度。 */
  private refreshObjectives(): void {
    const progress = this.session.progress();
    // 目标数量通常很少且结构稳定，原地更新可避免每步重建 DOM。
    if (this.objectivesBox.childElementCount !== progress.length) {
      clear(this.objectivesBox);
      for (const p of progress) this.objectivesBox.appendChild(this.objectiveNode(p));
      return;
    }
    progress.forEach((p, index) => {
      const node = this.objectivesBox.children[index] as HTMLElement;
      const ratio = p.target > 0 ? Math.min(1, p.current / p.target) : 0;
      const count = node.querySelector<HTMLElement>('.obj-count');
      const current = count?.firstElementChild as HTMLElement | null;
      const fill = node.querySelector<HTMLElement>('.progress-fill');
      if (current) current.textContent = String(p.current);
      if (fill) fill.style.width = `${ratio * 100}%`;
      node.classList.toggle('done', p.done);
    });
  }

  /**
   * 构建单个目标展示节点。
   * @param p 目标进度
   * @returns 目标节点
   */
  private objectiveNode(p: ObjectiveProgress): HTMLDivElement {
    const icon = el('div', {
      className: 'obj-icon',
      text: OBJ_ICON[p.type] ?? '🎯',
      style: {
        background: p.type === 'collect' && p.color !== undefined
          ? `var(--candy-${p.color})`
          : 'var(--bg-tertiary)',
      },
    });
    const ratio = p.target > 0 ? Math.min(1, p.current / p.target) : 0;
    const title =
      p.type === 'collect' ? '收集颜色' : p.type === 'teddy' ? '消除小熊' : (OBJ_NAME[p.type] ?? '目标');
    const text = el('div', {
      className: 'obj-text',
      children: [
        el('span', { className: 'obj-title', text: title }),
        el('span', {
          className: 'obj-count',
          children: [
            el('span', { text: String(p.current) }),
            el('span', { className: 'of', text: ` / ${p.target}` }),
          ],
        }),
        el('div', {
          className: 'progress-track',
          children: [el('div', { className: 'progress-fill', style: { width: `${ratio * 100}%` } })],
        }),
      ],
    });
    return el('div', {
      className: `objective${p.done ? ' done' : ''}`,
      children: [icon, text],
    });
  }

  /** 启动计时循环。 */
  private startLoop(): void {
    this.lastTs = performance.now();
    const step = (ts: number): void => {
      const dt = Math.min(0.25, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      if (!this.paused && !this.finished) {
        const alive = this.session.tick(dt);
        this.refreshHud();
        if (!alive) {
          void this.finish();
          return;
        }
      }
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** 使用提示功能。 */
  private useHint(): void {
    if (this.finished || this.paused) return;
    const hint = this.session.findHint();
    if (!hint) {
      this.toast('暂时没有可行的移动，正在洗牌…');
      this.session.board.shuffleColors();
      this.view?.sync(true);
      return;
    }
    this.view?.highlightHint(hint.a, hint.b);
    this.toast('试试交换高亮的两个糖果');
  }

  /** 主动洗牌（消耗一次机会，不扣步数）。 */
  private useShuffle(): void {
    if (this.finished || this.paused) return;
    this.session.board.shuffleColors();
    this.view?.sync(true);
    audio.play('special');
    this.toast('棋盘已重新排列');
  }

  /**
   * 切换暂停状态。
   * @param value 是否暂停
   */
  private togglePause(value: boolean): void {
    if (this.finished) return;
    this.paused = value;
    this.view?.setLocked(value);
    if (value) this.showPauseModal();
    else this.closeModal();
  }

  /** 显示暂停弹窗。 */
  private showPauseModal(): void {
    const modal = el('div', {
      className: 'modal',
      children: [
        el('h2', { text: '已暂停' }),
        el('p', { className: 'subtitle', text: '休息一下，随时回来继续挑战。' }),
        el('div', {
          className: 'modal-actions',
          children: [
            el('button', {
              className: 'btn btn-primary',
              text: '继续游戏',
              onClick: () => {
                audio.play('click');
                this.togglePause(false);
              },
            }),
            el('button', {
              className: 'btn',
              text: '重开本关',
              onClick: () => {
                audio.play('click');
                this.handleRestart();
              },
            }),
            el('button', {
              className: 'btn btn-ghost',
              text: '返回关卡',
              onClick: () => {
                audio.play('click');
                this.handleExit();
              },
            }),
          ],
        }),
      ],
    });
    this.openModal(modal);
  }

  /**
   * 打开弹窗。
   * @param content 弹窗内容
   */
  private openModal(content: HTMLElement): void {
    this.closeModal();
    const backdrop = el('div', {
      className: 'modal-backdrop',
      children: [content],
    });
    backdrop.dataset.role = 'modal';
    this.root.appendChild(backdrop);
  }

  /** 关闭弹窗。 */
  private closeModal(): void {
    this.root.querySelectorAll('[data-role="modal"]').forEach((n) => n.remove());
  }

  /** 结算本局并展示结果弹窗。 */
  private async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.view?.setLocked(true);
    const summary = this.session.summary();
    this.onResult(summary);
    if (summary.status === 'won') {
      audio.play('win');
      await sleep(260);
      audio.play('star');
    } else {
      audio.play('lose');
    }
    this.showResultModal(summary);
  }

  /**
   * 展示结算弹窗。
   * @param summary 结算数据
   */
  private showResultModal(summary: SessionSummary): void {
    const won = summary.status === 'won';
    const stars = el('div', { className: 'result-stars' });
    for (let i = 0; i < 3; i++) {
      const filled = i < summary.stars;
      stars.appendChild(
        el('span', {
          className: `star ${filled ? 'star-on' : 'star-off'}`,
          text: filled ? '★' : '☆',
          style: { animationDelay: `${i * 0.18}s` },
        }),
      );
    }

    const objList = el('div', { className: 'obj-result-list' });
    for (const p of summary.progress) {
      const name =
        p.type === 'collect'
          ? `收集 ${p.target} 个糖果`
          : p.type === 'teddy'
            ? `消除 ${p.target} 只小熊`
            : `${OBJ_NAME[p.type]} ${p.target}`;
      objList.appendChild(
        el('div', {
          className: 'obj-result',
          children: [
            el('span', { className: p.done ? 'check' : 'cross', text: p.done ? '✔' : '✘' }),
            el('span', { text: `${name}（${p.current}/${p.target}）` }),
          ],
        }),
      );
    }

    const stats = el('div', {
      className: 'result-stats',
      children: [
        this.statBox('得分', String(summary.score)),
        this.statBox('最高连锁', String(Math.max(1, summary.maxCascade))),
        Number.isFinite(summary.movesLeft)
          ? this.statBox('剩余步数', String(summary.movesLeft))
          : this.statBox('剩余时间', `${Math.ceil(summary.timeLeft)}s`),
      ],
    });

    const actions: HTMLElement[] = [];
    if (won) {
      actions.push(
        el('button', {
          className: 'btn btn-primary btn-lg',
          text: '下一关 →',
          onClick: () => {
            audio.play('click');
            // 只派发下一关事件，由主控制器统一负责界面切换；
            // 这里若先调用 onExit 会提前销毁当前会话，导致无法读取当前关卡编号。
            window.dispatchEvent(
              new CustomEvent<number>('happy-match:next-level', { detail: summary.levelId }),
            );
          },
        }),
      );
    } else {
      actions.push(
        el('button', {
          className: 'btn btn-primary btn-lg',
          text: '再试一次',
          onClick: () => {
            audio.play('click');
            this.handleRestart();
          },
        }),
      );
    }
    actions.push(
      el('button', {
        className: 'btn',
        text: '选择关卡',
        onClick: () => {
          audio.play('click');
          this.handleExit();
        },
      }),
    );

    const modal = el('div', {
      className: 'modal',
      children: [
        el('h2', { text: won ? '关卡通过！' : '挑战失败' }),
        el('p', {
          className: 'subtitle',
          text: won
            ? `第 ${summary.levelId} 关 · ${this.level.name} · ${MODE_LABEL[this.level.mode]}`
            : '目标未完成，再试一次吧！',
        }),
        stars,
        stats,
        objList,
        el('div', { className: 'modal-actions', children: actions }),
      ],
    });
    this.openModal(modal);
  }

  /**
   * 创建一个统计盒子。
   * @param key 名称
   * @param value 数值
   * @returns 统计节点
   */
  private statBox(key: string, value: string): HTMLDivElement {
    return el('div', {
      className: 'stat-box',
      children: [el('div', { className: 'k', text: key }), el('div', { className: 'v', text: value })],
    });
  }

  /**
   * 显示一条提示。
   * @param message 文案
   */
  private toast(message: string): void {
    const node = el('div', { className: 'toast', text: message });
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    window.setTimeout(() => {
      node.classList.remove('show');
      window.setTimeout(() => node.remove(), 300);
    }, 2200);
  }

  /** 处理退出。 */
  private handleExit(): void {
    this.dispose();
    this.onExit();
  }

  /** 处理重开。 */
  private handleRestart(): void {
    this.dispose();
    this.onRestart();
  }

  /** 销毁界面并释放资源。 */
  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.view?.destroy();
    this.view = null;
    this.closeModal();
    this.root.remove();
  }

  /** 当前关卡。 */
  get currentLevel(): Level {
    return this.level;
  }
}
