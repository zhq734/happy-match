/**
 * 棋盘视图：负责渲染方块、拖拽/点击交互、消除动画与粒子特效。
 * 创建者：zhenghq
 */
import { Board } from '../game/board';
import type { Cell, ClearEvent, Pos, Special, Tile } from '../game/types';
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

/** 粒子类型：闪光 / 冲击环 / 碎片 / 火花 / 横纵光束 / 特殊爆发。 */
type FxKind = 'flash' | 'ring' | 'shard' | 'spark' | 'beam-row' | 'beam-col' | 'burst';

/** 单个 Canvas 粒子。 */
interface FxParticle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  growth: number;
  color: string;
  rotation: number;
  spin: number;
  drag: number;
}

/** 同时存在的粒子上限，防止极端连锁下占用过高。 */
const FX_PARTICLE_LIMIT = 220;

/**
 * 棋盘渲染器。
 * 创建者：zhenghq
 */
export class BoardView {
  readonly root: HTMLDivElement;
  private readonly board: Board;
  private readonly measureElement?: HTMLElement;
  private readonly tileLayer: HTMLDivElement;
  private readonly cellLayer: HTMLDivElement;
  private readonly fxLayer: HTMLDivElement;
  private readonly fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D | null = null;
  private particles: FxParticle[] = [];
  private fxRaf = 0;
  private lastFxTs = 0;
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
   * @param measureElement 用于测量可用空间的外部容器（可选）
   */
  constructor(board: Board, onSwap: SwapHandler, measureElement?: HTMLElement) {
    this.board = board;
    this.onSwap = onSwap;
    this.measureElement = measureElement;

    this.cellLayer = el('div', { className: 'cell-layer' });
    this.tileLayer = el('div', { className: 'tile-layer' });
    this.fxLayer = el('div', { className: 'fx-layer' });
    this.fxCanvas = el('canvas', { className: 'fx-canvas' });
    this.fxCanvas.setAttribute('aria-hidden', 'true');
    try {
      this.fxCtx = this.fxCanvas.getContext('2d');
    } catch {
      this.fxCtx = null;
    }
    this.fxLayer.appendChild(this.fxCanvas);
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
    // 必须测量棋盘外部真正可用的区域。若测量棋盘父级（.board-frame），
    // 父级宽度会由棋盘自身内容撑开，形成“自我锁死”，棋盘永远无法放大。
    const wrap = this.measureElement ?? this.root.parentElement?.parentElement;
    const wrapWidth = wrap?.clientWidth || window.innerWidth;
    const wrapHeight = wrap?.clientHeight || window.innerHeight;
    // 预留外框 padding 与边框的余量，避免棋盘边缘被裁切。
    const maxW = Math.max(180, wrapWidth - 28);
    const maxH = Math.max(180, wrapHeight - 28);
    const byWidth = Math.floor(maxW / this.board.cols);
    const byHeight = Math.floor(maxH / this.board.rows);
    this.cellSize = Math.max(24, Math.min(byWidth, byHeight, 96));
    this.gap = Math.max(2, Math.round(this.cellSize * 0.08));
    this.root.style.width = `${this.cellSize * this.board.cols}px`;
    this.root.style.height = `${this.cellSize * this.board.rows}px`;
    this.resizeFxCanvas();

    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const node = this.cellNodes[r * this.board.cols + c];
        this.positionCell(node, r, c);
      }
    }
    this.sync(false);
  }

  /** 同步 Canvas 尺寸，并按设备像素比提高清晰度。 */
  private resizeFxCanvas(): void {
    const width = this.cellSize * this.board.cols;
    const height = this.cellSize * this.board.rows;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxCanvas.style.width = `${width}px`;
    this.fxCanvas.style.height = `${height}px`;
    this.fxCanvas.width = Math.round(width * dpr);
    this.fxCanvas.height = Math.round(height * dpr);
    this.fxCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const born: { tile: Tile; r: number; c: number }[] = [];
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const tile = this.board.tileAt(r, c);
        if (!tile) continue;
        alive.add(tile.id);
        const node = this.tileNodes.get(tile.id);
        if (!node) {
          // 只收集节点，稍后统一创建，避免在遍历棋盘时反复触发样式计算。
          born.push({ tile, r, c });
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
    for (const item of born) this.createTileNode(item.tile, item.r, item.c, animateNew);
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
      // 连锁越深，棋盘反馈越强，让连续消除有明显“打击感”。
      const strong = event.cascade > 1 || event.removed.length >= 4;
      if (strong) this.shake(event.cascade > 2 ? 'strong' : 'soft');
      for (const item of event.removed) {
        const node = this.tileNodes.get(item.tile.id);
        if (!node) continue;
        this.tileNodes.delete(item.tile.id);
        node.classList.add('clearing');
        // 提前移除交互与过渡，避免消除节点继续参与命中测试与合成。
        node.style.pointerEvents = 'none';
        const color = item.tile.kind === 'ingredient'
          ? 'var(--brand-2)'
          : `var(--candy-${item.tile.color})`;
        const special = item.tile.special;
        this.impactAt(item.pos.r, item.pos.c, color, special, special === 'none' ? 7 : 16);
        if (special !== 'none') this.beamAt(item.pos.r, item.pos.c, special, color);
        window.setTimeout(() => node.remove(), 360);
      }
      if (event.score > 0) {
        const anchor = event.removed[0]?.pos ?? event.cells[0];
        if (anchor) this.floatText(anchor.r, anchor.c, `+${event.score}`);
      }
      await sleep(event.cascade > 1 ? 200 : 230);
    }
  }

  /**
   * 在指定格子播放完整的消除冲击特效。
   * @param r 行
   * @param c 列
   * @param colorVar 特效颜色
   * @param special 方块特殊类型
   * @param count 粒子数量
   */
  impactAt(r: number, c: number, colorVar: string, special: Special = 'none', count = 8): void {
    const cx = c * this.cellSize + this.cellSize / 2;
    const cy = r * this.cellSize + this.cellSize / 2;
    const scale = special === 'wrap' ? 1.55 : special === 'rainbow' ? 1.8 : 1;

    // 闪光与冲击环使用同一套粒子系统，避免创建/销毁大量 DOM 引起主线程卡顿。
    this.addParticle({
      kind: 'flash',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      life: 380,
      maxLife: 380,
      size: this.cellSize * 1.1 * scale,
      growth: this.cellSize * 0.7 * scale,
      color: colorVar,
      rotation: 0,
      spin: 0,
      drag: 1,
    });
    this.addParticle({
      kind: 'ring',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      life: 520,
      maxLife: 520,
      size: this.cellSize * 0.8 * scale,
      growth: this.cellSize * 1.5 * scale,
      color: colorVar,
      rotation: 0,
      spin: 0,
      drag: 1,
    });

    // 控制粒子总数：普通消除少量碎片，特殊糖果稍多，但都保持轻量。
    const shardCount = special === 'none' ? 4 : 6;
    for (let i = 0; i < shardCount; i++) {
      const angle = (Math.PI * 2 * i) / shardCount + rand(-0.25, 0.25);
      const dist = rand(this.cellSize * 0.4, this.cellSize * 1.05) * scale;
      const duration = rand(480, 640);
      this.addParticle({
        kind: 'shard',
        x: cx,
        y: cy,
        vx: (Math.cos(angle) * dist) / (duration / 1000),
        vy: (Math.sin(angle) * dist) / (duration / 1000),
        life: duration,
        maxLife: duration,
        size: rand(4, 8),
        growth: -0.6,
        color: colorVar,
        rotation: rand(0, 360),
        spin: rand(-320, 320),
        drag: 2.4,
      });
    }

    this.burstAt(r, c, colorVar, count);
  }

  /**
   * 为条纹、包装与彩虹糖绘制贯穿式光束或爆发特效。
   * @param r 行
   * @param c 列
   * @param special 特殊类型
   * @param colorVar 特效颜色
   */
  beamAt(r: number, c: number, special: Special, colorVar: string): void {
    if (special === 'row' || special === 'col') {
      const horizontal = special === 'row';
      const length = horizontal ? this.cellSize * this.board.cols : this.cellSize * this.board.rows;
      this.addParticle({
        kind: horizontal ? 'beam-row' : 'beam-col',
        x: horizontal ? length / 2 : c * this.cellSize + this.cellSize / 2,
        y: horizontal ? r * this.cellSize + this.cellSize / 2 : length / 2,
        vx: 0,
        vy: 0,
        life: 420,
        maxLife: 420,
        size: length,
        growth: 0,
        color: colorVar,
        rotation: 0,
        spin: 0,
        drag: 1,
      });
      return;
    }

    const cx = c * this.cellSize + this.cellSize / 2;
    const cy = r * this.cellSize + this.cellSize / 2;
    this.addParticle({
      kind: 'burst',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      life: 560,
      maxLife: 560,
      size: this.cellSize * 0.7,
      growth: this.cellSize * 1.6,
      color: colorVar,
      rotation: 0,
      spin: 140,
      drag: 1,
    });
  }

  /**
   * 让棋盘产生轻微震动，强化消除反馈。
   * @param level 震动强度
   */
  private shake(level: 'soft' | 'strong'): void {
    if (this.root.classList.contains('shake-strong') && level === 'soft') return;
    this.root.classList.remove('shake-soft', 'shake-strong');
    this.root.classList.add(level === 'strong' ? 'shake-strong' : 'shake-soft');
    window.setTimeout(() => this.root.classList.remove('shake-soft', 'shake-strong'), 380);
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
    const safeCount = Math.min(count, 10);
    for (let i = 0; i < safeCount; i++) {
      const angle = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
      const dist = rand(this.cellSize * 0.35, this.cellSize * 0.95);
      const duration = rand(420, 620);
      this.addParticle({
        kind: 'spark',
        x: cx,
        y: cy,
        vx: (Math.cos(angle) * dist) / (duration / 1000),
        vy: (Math.sin(angle) * dist) / (duration / 1000),
        life: duration,
        maxLife: duration,
        size: rand(3, 7),
        growth: -0.8,
        color: colorVar,
        rotation: 0,
        spin: 0,
        drag: 2.2,
      });
    }
  }

  /**
   * 向 Canvas 粒子池中添加一个粒子，并启动统一的绘制循环。
   * @param particle 粒子配置
   */
  private addParticle(particle: FxParticle): void {
    if (!this.fxCtx) return;
    // 极端连锁时只保留最新的粒子，保证帧率稳定。
    if (this.particles.length >= FX_PARTICLE_LIMIT) this.particles.shift();
    this.particles.push(particle);
    this.scheduleFx();
  }

  /** 延迟到下一帧再启动绘制循环，避免同一帧内重复排帧。 */
  private scheduleFx(): void {
    if (!this.fxRaf) {
      this.lastFxTs = performance.now();
      this.fxRaf = requestAnimationFrame(this.stepFx);
    }
  }

  /** 统一推进粒子状态并重绘，使用单个 RAF 避免多定时器抖动。 */
  private readonly stepFx = (ts: number): void => {
    const ctx = this.fxCtx;
    if (!ctx) {
      this.fxRaf = 0;
      return;
    }
    const dt = Math.min(48, ts - this.lastFxTs);
    this.lastFxTs = ts;
    ctx.clearRect(0, 0, this.cellSize * this.board.cols, this.cellSize * this.board.rows);

    const alive: FxParticle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const seconds = dt / 1000;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.vx *= Math.pow(0.001, p.drag * seconds);
      p.vy *= Math.pow(0.001, p.drag * seconds);
      p.rotation += p.spin * seconds;
      p.size = Math.max(0, p.size + p.growth * seconds);
      this.drawParticle(ctx, p);
      alive.push(p);
    }
    this.particles = alive;
    if (alive.length > 0) {
      this.fxRaf = requestAnimationFrame(this.stepFx);
    } else {
      this.fxRaf = 0;
      ctx.clearRect(0, 0, this.cellSize * this.board.cols, this.cellSize * this.board.rows);
    }
  };

  /**
   * 绘制单个粒子。
   * @param ctx 画布上下文
   * @param p 粒子
   */
  private drawParticle(ctx: CanvasRenderingContext2D, p: FxParticle): void {
    const t = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.save();
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.kind === 'flash') {
      const radius = p.size * (1.6 - t * 0.6) * 0.5;
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, p.color);
      gradient.addColorStop(0.55, p.color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'ring' || p.kind === 'burst') {
      ctx.globalAlpha = t * 0.9;
      ctx.lineWidth = Math.max(1, 5 * t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'shard') {
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.kind === 'spark') {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'beam-row') {
      const gradient = ctx.createLinearGradient(0, p.y, p.size, p.y);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.5, p.color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = t;
      ctx.fillRect(0, p.y - this.cellSize * 0.08, p.size, this.cellSize * 0.16);
    } else if (p.kind === 'beam-col') {
      const gradient = ctx.createLinearGradient(p.x, 0, p.x, p.size);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.5, p.color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = t;
      ctx.fillRect(p.x - this.cellSize * 0.08, 0, this.cellSize * 0.16, p.size);
    }
    ctx.restore();
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
    if (this.fxRaf) cancelAnimationFrame(this.fxRaf);
    this.fxRaf = 0;
    this.particles = [];
    this.fxCtx?.clearRect(0, 0, this.cellSize * this.board.cols, this.cellSize * this.board.rows);
    this.tileNodes.clear();
    this.cellNodes.length = 0;
    this.root.remove();
  }

  /** 当前存活的 Canvas 粒子数量（用于测试与调试）。 */
  get fxParticleCount(): number {
    return this.particles.length;
  }
}
