/**
 * 棋盘视图：负责渲染方块、拖拽/点击交互、消除动画与粒子特效。
 * 创建者：zhenghq
 */
import { Board } from '../game/board';
import type { Cell, ClearEvent, Pos, Tile } from '../game/types';
import { el, rand, sleep } from './dom';

/** 一次交换的处理结果。 */
export interface SwapOutcome {
  valid: boolean;
  events: ClearEvent[];
  gained: number;
  combo: boolean;
}

/** 交换回调。 */
export type SwapHandler = (a: Pos, b: Pos) => SwapOutcome;

/**
 * 棋盘渲染器。
 * 创建者：zhenghq
 */
export class BoardView {
  readonly root: HTMLDivElement;
  private readonly board: Board;
  private readonly tileLayer: HTMLDivElement;
  private readonly cellLayer: HTMLDivElement;
  private readonly fxLayer: HTMLDivElement;
  private readonly tileNodes = new Map<number, HTMLDivElement>();
  private readonly cellNodes: HTMLDivElement[] = [];
  private selected: Pos | null = null;
  private dragFrom: Pos | null = null;
  private dragStart = { x: 0, y: 0 };
  private locked = false;
  private readonly onSwap: SwapHandler;
  private cellSize = 48;
  private gap = 4;

  /**
   * 构造棋盘视图。
   * @param board 棋盘数据
   * @param onSwap 交换回调
   */
  constructor(board: Board, onSwap: SwapHandler) {
    this.board = board;
    this.onSwap = onSwap;

    this.cellLayer = el('div', { className: 'cell-layer' });
    this.tileLayer = el('div', { className: 'tile-layer' });
    this.fxLayer = el('div', { className: 'fx-layer' });
    this.root = el('div', {
      className: 'board',
      children: [this.cellLayer, this.tileLayer, this.fxLayer],
    });

    this.buildCells();
    this.buildTiles();
    this.attachEvents();
    this.layout();
  }

  /** 构建格子背景层。 */
  private buildCells(): void {
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const cell = this.board.cellAt(r, c) as Cell;
        const node = el('div', {
          className: ['cell', (r + c) % 2 === 0 ? '' : 'alt', cell.hole ? 'hole' : '']
            .filter(Boolean)
            .join(' '),
        });
        if (cell.jelly > 0) node.classList.add('jelly');
        if (cell.ice > 0) node.classList.add('ice');
        if (cell.ice > 1) node.classList.add('thick');
        if (cell.exit) node.classList.add('exit');
        if (cell.spawn) node.classList.add('spawn');
        this.cellNodes.push(node);
        this.cellLayer.appendChild(node);
      }
    }
  }

  /** 构建方块层。 */
  private buildTiles(): void {
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const tile = this.board.tileAt(r, c);
        if (tile) this.createTileNode(tile, r, c, false);
      }
    }
  }

  /**
   * 为方块创建 DOM 节点。
   * @param tile 方块数据
   * @param r 行
   * @param c 列
   * @param animate 是否播放出生动画
   * @returns 创建的节点
   */
  private createTileNode(tile: Tile, r: number, c: number, animate: boolean): HTMLDivElement {
    const body = el('div', { className: 'body' });
    const node = el('div', {
      className: this.tileClass(tile),
      children: [body],
      attrs: { 'data-id': String(tile.id) },
    });
    if (animate) node.classList.add('spawning');
    this.tileNodes.set(tile.id, node);
    this.tileLayer.appendChild(node);
    this.positionTile(node, r, c);
    if (animate) {
      const done = (): void => node.classList.remove('spawning');
      node.addEventListener('animationend', done, { once: true });
      window.setTimeout(done, 420);
    }
    return node;
  }

  /**
   * 计算方块对应的 CSS 类名。
   * @param tile 方块
   * @returns 类名
   */
  private tileClass(tile: Tile): string {
    const parts = ['tile'];
    if (tile.kind === 'ingredient') parts.push('ingredient');
    else parts.push(`c${tile.color}`);
    if (tile.special !== 'none') parts.push(tile.special);
    return parts.join(' ');
  }

  /** 依据容器尺寸计算格子大小并刷新所有节点位置。 */
  layout(): void {
    const wrap = this.root.parentElement;
    const wrapWidth = wrap?.clientWidth ?? window.innerWidth;
    const wrapHeight = wrap?.clientHeight ?? window.innerHeight;
    const maxW = Math.max(180, Math.min(wrapWidth - 16, 620));
    const maxH = Math.max(180, Math.min(wrapHeight - 16, 620));
    const byWidth = Math.floor(maxW / this.board.cols);
    const byHeight = Math.floor(maxH / this.board.rows);
    this.cellSize = Math.max(24, Math.min(byWidth, byHeight, 76));
    this.gap = Math.max(2, Math.round(this.cellSize * 0.08));
    this.root.style.width = `${this.cellSize * this.board.cols}px`;
    this.root.style.height = `${this.cellSize * this.board.rows}px`;

    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const node = this.cellNodes[r * this.board.cols + c];
        this.positionCell(node, r, c);
      }
    }
    this.sync(false);
  }

  /**
   * 设置格子节点位置与尺寸。
   * @param node 节点
   * @param r 行
   * @param c 列
   */
  private positionCell(node: HTMLElement, r: number, c: number): void {
    node.style.left = `${c * this.cellSize + this.gap / 2}px`;
    node.style.top = `${r * this.cellSize + this.gap / 2}px`;
    node.style.width = `${this.cellSize - this.gap}px`;
    node.style.height = `${this.cellSize - this.gap}px`;
  }

  /**
   * 设置方块节点位置与尺寸。
   * @param node 节点
   * @param r 行
   * @param c 列
   */
  private positionTile(node: HTMLElement, r: number, c: number): void {
    node.style.left = `${c * this.cellSize + this.gap / 2}px`;
    node.style.top = `${r * this.cellSize + this.gap / 2}px`;
    node.style.width = `${this.cellSize - this.gap}px`;
    node.style.height = `${this.cellSize - this.gap}px`;
  }

  /**
   * 同步 DOM 与棋盘数据：新增缺失方块、移动已有方块、移除多余节点。
   * @param animateNew 是否播放新方块出生动画
   */
  sync(animateNew = true): void {
    const alive = new Set<number>();
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const tile = this.board.tileAt(r, c);
        if (!tile) continue;
        alive.add(tile.id);
        const node = this.tileNodes.get(tile.id);
        if (!node) {
          this.createTileNode(tile, r, c, animateNew);
        } else {
          node.className = this.tileClass(tile);
          this.positionTile(node, r, c);
        }
      }
    }
    for (const [id, node] of [...this.tileNodes.entries()]) {
      if (!alive.has(id)) {
        node.remove();
        this.tileNodes.delete(id);
      }
    }
  }

  /**
   * 将像素坐标换算为棋盘行列。
   * @param clientX 视口 X
   * @param clientY 视口 Y
   * @returns 棋盘坐标，越界返回 null
   */
  private posFromPoint(clientX: number, clientY: number): Pos | null {
    const rect = this.root.getBoundingClientRect();
    const c = Math.floor((clientX - rect.left) / this.cellSize);
    const r = Math.floor((clientY - rect.top) / this.cellSize);
    if (!this.board.isPlayable(r, c)) return null;
    return { r, c };
  }

  /** 绑定指针交互事件。 */
  private attachEvents(): void {
    this.root.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      const pos = this.posFromPoint(e.clientX, e.clientY);
      if (!pos || !this.board.tileAt(pos.r, pos.c)) return;
      this.dragFrom = pos;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.select(pos);
      this.root.setPointerCapture(e.pointerId);
    });

    this.root.addEventListener('pointermove', (e) => {
      if (this.locked || !this.dragFrom) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      if (Math.hypot(dx, dy) < this.cellSize * 0.4) return;
      const dir: Pos = Math.abs(dx) > Math.abs(dy)
        ? { r: 0, c: dx > 0 ? 1 : -1 }
        : { r: dy > 0 ? 1 : -1, c: 0 };
      const target = { r: this.dragFrom.r + dir.r, c: this.dragFrom.c + dir.c };
      const from = this.dragFrom;
      this.dragFrom = null;
      this.clearSelection();
      void this.attemptSwap(from, target);
    });

    const endDrag = (): void => {
      this.dragFrom = null;
    };
    this.root.addEventListener('pointerup', endDrag);
    this.root.addEventListener('pointercancel', endDrag);

    this.root.addEventListener('click', (e) => {
      if (this.locked) return;
      const pos = this.posFromPoint(e.clientX, e.clientY);
      if (!pos || !this.board.tileAt(pos.r, pos.c)) return;
      if (!this.selected) {
        this.select(pos);
        return;
      }
      const prev = this.selected;
      if (prev.r === pos.r && prev.c === pos.c) {
        this.clearSelection();
        return;
      }
      this.clearSelection();
      if (Board.isAdjacentPublic(prev, pos)) {
        void this.attemptSwap(prev, pos);
      } else {
        this.select(pos);
      }
    });
  }

  /**
   * 选中某个格子。
   * @param pos 坐标
   */
  private select(pos: Pos): void {
    this.clearSelection();
    this.selected = pos;
    const tile = this.board.tileAt(pos.r, pos.c);
    if (!tile) return;
    this.tileNodes.get(tile.id)?.classList.add('selected');
  }

  /** 清除当前选中状态。 */
  private clearSelection(): void {
    if (this.selected) {
      const tile = this.board.tileAt(this.selected.r, this.selected.c);
      if (tile) this.tileNodes.get(tile.id)?.classList.remove('selected');
    }
    this.selected = null;
  }

  /**
   * 以视觉方式交换两个节点的位置（不改动数据）。
   * @param a 起点
   * @param b 终点
   */
  private visualSwap(a: Pos, b: Pos): void {
    const ta = this.board.tileAt(a.r, a.c);
    const tb = this.board.tileAt(b.r, b.c);
    if (!ta || !tb) return;
    const na = this.tileNodes.get(ta.id);
    const nb = this.tileNodes.get(tb.id);
    if (na) this.positionTile(na, b.r, b.c);
    if (nb) this.positionTile(nb, a.r, a.c);
  }

  /**
   * 尝试执行一次交换，包含交换动画、消除动画与无效回弹。
   * @param a 起点
   * @param b 终点
   */
  private async attemptSwap(a: Pos, b: Pos): Promise<void> {
    if (this.locked) return;
    if (!this.board.inBounds(b.r, b.c) || !this.board.isPlayable(b.r, b.c)) return;
    const ta = this.board.tileAt(a.r, a.c);
    const tb = this.board.tileAt(b.r, b.c);
    if (!ta || !tb) return;

    this.locked = true;
    this.visualSwap(a, b);
    await sleep(150);

    const result = this.onSwap(a, b);
    if (!result.valid) {
      this.visualSwap(b, a);
      const na = this.tileNodes.get(ta.id);
      const nb = this.tileNodes.get(tb.id);
      na?.classList.add('selected');
      nb?.classList.add('selected');
      await sleep(200);
      na?.classList.remove('selected');
      nb?.classList.remove('selected');
      this.locked = false;
      return;
    }

    await this.replay(result.events);
    this.sync(true);
    this.locked = false;
  }

  /**
   * 按顺序播放一组消除事件的动画。
   * @param events 消除事件列表
   */
  private async replay(events: ClearEvent[]): Promise<void> {
    for (const event of events) {
      if (event.cascade > 1) {
        this.banner(`${event.cascade} 连击！`);
      }
      for (const item of event.removed) {
        const node = this.tileNodes.get(item.tile.id);
        if (!node) continue;
        this.tileNodes.delete(item.tile.id);
        node.classList.add('clearing');
        const color = item.tile.kind === 'ingredient'
          ? 'var(--brand-2)'
          : `var(--candy-${item.tile.color})`;
        this.burstAt(item.pos.r, item.pos.c, color, item.tile.special === 'none' ? 6 : 12);
        window.setTimeout(() => node.remove(), 320);
      }
      if (event.score > 0) {
        const anchor = event.removed[0]?.pos ?? event.cells[0];
        if (anchor) this.floatText(anchor.r, anchor.c, `+${event.score}`);
      }
      await sleep(event.cascade > 1 ? 260 : 300);
    }
  }

  /**
   * 在指定格子播放爆裂粒子。
   * @param r 行
   * @param c 列
   * @param colorVar 粒子颜色
   * @param count 粒子数量
   */
  burstAt(r: number, c: number, colorVar: string, count = 7): void {
    const cx = c * this.cellSize + this.cellSize / 2;
    const cy = r * this.cellSize + this.cellSize / 2;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
      const dist = rand(this.cellSize * 0.35, this.cellSize * 0.95);
      const spark = el('div', {
        className: 'spark',
        style: {
          left: `${cx}px`,
          top: `${cy}px`,
          background: colorVar,
          width: `${rand(4, 9)}px`,
          height: `${rand(4, 9)}px`,
        },
      });
      spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      this.fxLayer.appendChild(spark);
      window.setTimeout(() => spark.remove(), 620);
    }
  }

  /**
   * 在指定位置显示飘分文字。
   * @param r 行
   * @param c 列
   * @param text 文本
   */
  floatText(r: number, c: number, text: string): void {
    const node = el('div', {
      className: 'float-score',
      text,
      style: {
        left: `${c * this.cellSize + this.cellSize / 2}px`,
        top: `${r * this.cellSize + this.cellSize / 2}px`,
      },
    });
    this.fxLayer.appendChild(node);
    window.setTimeout(() => node.remove(), 950);
  }

  /**
   * 显示连锁横幅。
   * @param text 文案
   */
  banner(text: string): void {
    const node = el('div', { className: 'combo-banner', text });
    this.fxLayer.appendChild(node);
    window.setTimeout(() => node.remove(), 900);
  }

  /**
   * 高亮一组提示格子。
   * @param a 起点
   * @param b 终点
   * @param duration 持续时间（毫秒）
   */
  highlightHint(a: Pos, b: Pos, duration = 1800): void {
    const na = this.cellNodes[a.r * this.board.cols + a.c];
    const nb = this.cellNodes[b.r * this.board.cols + b.c];
    na.classList.add('hint-a');
    nb.classList.add('hint-b');
    window.setTimeout(() => {
      na.classList.remove('hint-a');
      nb.classList.remove('hint-b');
    }, duration);
  }

  /**
   * 设置交互锁定状态。
   * @param value 是否锁定
   */
  setLocked(value: boolean): void {
    this.locked = value;
  }

  /** 销毁视图，移除全部节点。 */
  destroy(): void {
    this.tileNodes.clear();
    this.cellNodes.length = 0;
    this.root.remove();
  }
}
