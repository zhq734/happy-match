/**
 * 三消棋盘引擎：负责匹配检测、特殊糖果、连锁、重力与补给。
 * 创建者：zhenghq
 */
import type { Cell, Color, ClearEvent, Level, Pos, Special, Tile } from './types';
import type { Rng } from './rng';

/** 匹配分组：一组连通且同色的三消结果。 */
export interface MatchGroup {
  cells: Pos[];
  color: Color;
  /** 该分组内最长横向连线的长度。 */
  horizontalMax: number;
  /** 该分组内最长纵向连线的长度。 */
  verticalMax: number;
  /** 是否同时包含横向与纵向连线（L/T 形）。 */
  hasBoth: boolean;
}

/** 一次连锁消除过程中产生的统计数据。 */
export interface ClearStats {
  clearedTiles: number;
  byColor: number[];
  jellyCleared: number;
  iceCleared: number;
  ingredientsCollected: number;
  specialsCreated: number;
}

/** 特殊糖果激活时影响的格子集合。 */
type PosSet = Map<number, Pos>;

/**
 * 棋盘引擎。
 * 创建者：zhenghq
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly cells: Cell[] = [];
  private nextId = 1;
  private readonly rng: Rng;
  private readonly colors: number;
  private readonly colorPool: Color[];

  /** 累计得分。 */
  score = 0;
  /** 累计清除的果冻层数。 */
  jellyCleared = 0;
  /** 累计击碎的冰层数。 */
  iceCleared = 0;
  /** 累计收集的食材数量。 */
  ingredientsCollected = 0;
  /** 各颜色累计收集数量。 */
  readonly colorCollected = [0, 0, 0, 0, 0, 0];
  /** 历史最大连锁层级。 */
  maxCascade = 0;

  /**
   * 构造棋盘并完成初始填充。
   * @param level 关卡定义
   * @param rng 随机数生成器
   */
  constructor(level: Level, rng: Rng) {
    this.rows = level.rows;
    this.cols = level.cols;
    this.rng = rng;
    this.colors = Math.max(3, Math.min(6, level.colors));
    this.colorPool = Array.from({ length: this.colors }, (_, i) => i as Color);
    this.buildCells(level);
    this.fillInitial();
  }

  /**
   * 依据关卡布局构建单元格结构。
   * @param level 关卡定义
   */
  private buildCells(level: Level): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = level.layout?.[r]?.[c] ?? '.';
        this.cells.push({
          hole: ch === '#',
          ice: ch === 'i' ? 1 : ch === 'I' ? 2 : 0,
          jelly: ch === 'j' ? 1 : ch === 'J' ? 2 : 0,
          spawn: ch === 's',
          exit: ch === 'e',
          tile: null,
        });
      }
    }
  }

  /**
   * 计算坐标对应的线性索引。
   * @param r 行
   * @param c 列
   * @returns 线性索引
   */
  private index(r: number, c: number): number {
    return r * this.cols + c;
  }

  /**
   * 判断坐标是否在棋盘范围内。
   * @param r 行
   * @param c 列
   * @returns 是否在范围内
   */
  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  /**
   * 获取指定单元格。
   * @param r 行
   * @param c 列
   * @returns 单元格，越界返回 undefined
   */
  cellAt(r: number, c: number): Cell | undefined {
    return this.inBounds(r, c) ? this.cells[this.index(r, c)] : undefined;
  }

  /**
   * 获取指定单元格内的方块。
   * @param r 行
   * @param c 列
   * @returns 方块，无则返回 null
   */
  tileAt(r: number, c: number): Tile | null {
    return this.cellAt(r, c)?.tile ?? null;
  }

  /**
   * 判断指定格子是否可放置方块。
   * @param r 行
   * @param c 列
   * @returns 是否可放置
   */
  isPlayable(r: number, c: number): boolean {
    const cell = this.cellAt(r, c);
    return !!cell && !cell.hole;
  }

  /**
   * 创建一颗糖果。
   * @param color 颜色
   * @param special 特殊类型
   * @returns 新方块
   */
  private makeCandy(color: Color, special: Special = 'none'): Tile {
    return { id: this.nextId++, kind: 'candy', color, special };
  }

  /**
   * 创建一颗食材方块。
   * @returns 新食材
   */
  private makeIngredient(): Tile {
    return { id: this.nextId++, kind: 'ingredient', color: -1, special: 'none' };
  }

  /**
   * 随机取一个颜色。
   * @returns 颜色
   */
  private randomColor(): Color {
    return this.colorPool[this.rng.int(this.colorPool.length)];
  }

  /**
   * 生成一个不会立即形成三消的随机颜色。
   * @param r 行
   * @param c 列
   * @returns 安全颜色
   */
  private safeRandomColor(r: number, c: number): Color {
    for (let attempt = 0; attempt < 24; attempt++) {
      const color = this.randomColor();
      const left1 = this.tileAt(r, c - 1);
      const left2 = this.tileAt(r, c - 2);
      const up1 = this.tileAt(r - 1, c);
      const up2 = this.tileAt(r - 2, c);
      const h = !!left1 && !!left2 && left1.color === color && left2.color === color;
      const v = !!up1 && !!up2 && up1.color === color && up2.color === color;
      if (!h && !v) return color;
    }
    return this.randomColor();
  }

  /**
   * 初始化填充棋盘。
   */
  private fillInitial(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[this.index(r, c)];
        if (cell.hole) continue;
        cell.tile = this.makeCandy(this.safeRandomColor(r, c));
      }
    }
    let guard = 0;
    while (!this.hasPossibleMove() && guard++ < 40) this.shuffleColors();
  }

  /**
   * 收集棋盘上全部方块位置。
   * @returns 位置列表
   */
  private allPositions(): Pos[] {
    const out: Pos[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.tileAt(r, c)) out.push({ r, c });
      }
    }
    return out;
  }

  /**
   * 重新随机分配棋盘上糖果的颜色，用于无解时洗牌。
   */
  shuffleColors(): void {
    const positions = this.allPositions().filter((p) => {
      const t = this.tileAt(p.r, p.c);
      return !!t && t.kind === 'candy';
    });
    for (const p of positions) {
      const cell = this.cells[this.index(p.r, p.c)];
      cell.tile = this.makeCandy(this.randomColor());
    }
    let guard = 0;
    while (this.findMatchGroups().length > 0 && guard++ < 60) {
      for (const p of positions) {
        const cell = this.cells[this.index(p.r, p.c)];
        cell.tile = this.makeCandy(this.randomColor());
      }
    }
  }

  /**
   * 检测所有横向与纵向的三消连线。
   * @returns 连线列表
   */
  private findRuns(): { cells: Pos[]; horizontal: boolean }[] {
    const runs: { cells: Pos[]; horizontal: boolean }[] = [];
    const matchable = (t: Tile | null): t is Tile =>
      !!t && t.kind === 'candy' && t.color >= 0;

    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const tile = this.tileAt(r, c);
        if (!matchable(tile)) {
          c++;
          continue;
        }
        let end = c + 1;
        while (end < this.cols) {
          const t = this.tileAt(r, end);
          if (!matchable(t) || t.color !== tile.color) break;
          end++;
        }
        if (end - c >= 3) {
          const cells: Pos[] = [];
          for (let x = c; x < end; x++) cells.push({ r, c: x });
          runs.push({ cells, horizontal: true });
        }
        c = end;
      }
    }

    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const tile = this.tileAt(r, c);
        if (!matchable(tile)) {
          r++;
          continue;
        }
        let end = r + 1;
        while (end < this.rows) {
          const t = this.tileAt(end, c);
          if (!matchable(t) || t.color !== tile.color) break;
          end++;
        }
        if (end - r >= 3) {
          const cells: Pos[] = [];
          for (let y = r; y < end; y++) cells.push({ r: y, c });
          runs.push({ cells, horizontal: false });
        }
        r = end;
      }
    }

    return runs;
  }

  /**
   * 查找全部匹配分组（将共享格子的连线合并为同一组）。
   * @returns 匹配分组列表
   */
  findMatchGroups(): MatchGroup[] {
    const runs = this.findRuns();
    if (runs.length === 0) return [];
    const keyOf = (p: Pos): number => this.index(p.r, p.c);
    const parent: number[] = runs.map((_, i) => i);
    const find = (x: number): number => {
      let root = x;
      while (parent[root] !== root) root = parent[root];
      while (parent[x] !== root) {
        const nxt = parent[x];
        parent[x] = root;
        x = nxt;
      }
      return root;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    const cellToRun = new Map<number, number>();
    runs.forEach((run, i) => {
      for (const p of run.cells) {
        const k = keyOf(p);
        const prev = cellToRun.get(k);
        if (prev === undefined) cellToRun.set(k, i);
        else union(prev, i);
      }
    });

    const buckets = new Map<number, number[]>();
    runs.forEach((_, i) => {
      const root = find(i);
      const list = buckets.get(root) ?? [];
      list.push(i);
      buckets.set(root, list);
    });

    const groups: MatchGroup[] = [];
    for (const list of buckets.values()) {
      const cellMap: PosSet = new Map();
      let horizontalMax = 0;
      let verticalMax = 0;
      let color: Color = 0;
      for (const i of list) {
        const run = runs[i];
        if (run.horizontal) horizontalMax = Math.max(horizontalMax, run.cells.length);
        else verticalMax = Math.max(verticalMax, run.cells.length);
        for (const p of run.cells) {
          cellMap.set(keyOf(p), p);
          const t = this.tileAt(p.r, p.c);
          if (t && t.color >= 0) color = t.color as Color;
        }
      }
      groups.push({
        cells: [...cellMap.values()],
        color,
        horizontalMax,
        verticalMax,
        hasBoth: horizontalMax >= 3 && verticalMax >= 3,
      });
    }
    return groups;
  }

  /**
   * 判断某个分组应生成何种特殊糖果。
   * @param group 匹配分组
   * @returns 特殊糖果类型
   */
  private specialForGroup(group: MatchGroup): Special {
    if (group.hasBoth) return 'wrap';
    const longest = Math.max(group.horizontalMax, group.verticalMax);
    if (longest >= 5) return 'rainbow';
    if (longest >= 4) return group.horizontalMax >= 4 ? 'row' : 'col';
    return 'none';
  }

  /**
   * 为新生成的特殊糖果挑选落点，优先使用玩家交换的格子。
   * @param group 匹配分组
   * @param prefer 优先位置列表
   * @returns 落点坐标
   */
  private pickSpecialPos(group: MatchGroup, prefer: Pos[]): Pos {
    const inGroup = prefer.find((p) =>
      group.cells.some((q) => q.r === p.r && q.c === p.c),
    );
    if (inGroup) return inGroup;
    return group.cells[Math.floor(group.cells.length / 2)];
  }

  /**
   * 计算某个特殊糖果激活时影响的全部格子。
   * @param pos 特殊糖果所在位置
   * @param special 特殊类型
   * @param overrideColor 彩虹糖指定的目标颜色
   * @returns 受影响的格子
   */
  private specialTargets(pos: Pos, special: Special, overrideColor?: Color): Pos[] {
    const out: Pos[] = [];
    if (special === 'row') {
      for (let c = 0; c < this.cols; c++) if (this.isPlayable(pos.r, c)) out.push({ r: pos.r, c });
    } else if (special === 'col') {
      for (let r = 0; r < this.rows; r++) if (this.isPlayable(r, pos.c)) out.push({ r, c: pos.c });
    } else if (special === 'wrap') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = pos.r + dr;
          const c = pos.c + dc;
          if (this.isPlayable(r, c)) out.push({ r, c });
        }
      }
    } else if (special === 'rainbow') {
      const target = overrideColor ?? this.dominantColor();
      for (const p of this.allPositions()) {
        const t = this.tileAt(p.r, p.c);
        if (t && t.kind === 'candy' && t.color === target) out.push(p);
      }
    }
    return out;
  }

  /**
   * 统计棋盘上出现次数最多的糖果颜色。
   * @returns 颜色索引
   */
  private dominantColor(): Color {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const p of this.allPositions()) {
      const t = this.tileAt(p.r, p.c);
      if (t && t.kind === 'candy' && t.color >= 0) counts[t.color]++;
    }
    let best: Color = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i as Color;
    return best;
  }

  /**
   * 清除指定格子集合，并递归激活其中的特殊糖果。
   * @param seeds 初始待清除格子
   * @param keep 需要保留（用于生成新特殊糖果）的格子
   * @param overrideColor 彩虹糖的目标颜色
   * @returns 实际被清除的格子集合
   */
  private expandClears(seeds: Pos[], keep: PosSet, overrideColor?: Color): PosSet {
    const cleared: PosSet = new Map();
    const queue: Pos[] = [];
    const push = (p: Pos): void => {
      const k = this.index(p.r, p.c);
      if (keep.has(k) || cleared.has(k) || !this.isPlayable(p.r, p.c)) return;
      cleared.set(k, p);
      queue.push(p);
    };
    for (const p of seeds) push(p);

    while (queue.length > 0) {
      const p = queue.shift() as Pos;
      const tile = this.tileAt(p.r, p.c);
      if (!tile || tile.special === 'none') continue;
      const targets = this.specialTargets(p, tile.special, overrideColor);
      for (const t of targets) push(t);
    }
    return cleared;
  }

  /**
   * 对指定格子执行清除结算：更新冰层、果冻、收集与得分。
   * @param cleared 被清除的格子集合
   * @param cascade 当前连锁层级
   * @returns 本次清除的统计信息
   */
  private applyClears(cleared: PosSet, cascade: number): ClearStats {
    const stats: ClearStats = {
      clearedTiles: 0,
      byColor: [0, 0, 0, 0, 0, 0],
      jellyCleared: 0,
      iceCleared: 0,
      ingredientsCollected: 0,
      specialsCreated: 0,
    };

    for (const p of cleared.values()) {
      const cell = this.cells[this.index(p.r, p.c)];
      const tile = cell.tile;
      if (!tile) continue;
      stats.clearedTiles++;
      if (tile.kind === 'candy' && tile.color >= 0) {
        stats.byColor[tile.color]++;
        this.colorCollected[tile.color]++;
      }
      if (tile.kind === 'ingredient') {
        stats.ingredientsCollected++;
        this.ingredientsCollected++;
      }
      if (cell.jelly > 0) {
        cell.jelly--;
        stats.jellyCleared++;
        this.jellyCleared++;
      }
      cell.tile = null;
    }

    // 清除格子会同时击碎自身及上下左右相邻的冰层。
    for (const p of cleared.values()) {
      const around: Pos[] = [
        p,
        { r: p.r - 1, c: p.c },
        { r: p.r + 1, c: p.c },
        { r: p.r, c: p.c - 1 },
        { r: p.r, c: p.c + 1 },
      ];
      for (const q of around) {
        const cell = this.cellAt(q.r, q.c);
        if (cell && cell.ice > 0) {
          cell.ice--;
          stats.iceCleared++;
          this.iceCleared++;
        }
      }
    }

    const multiplier = cascade;
    this.score += stats.clearedTiles * 60 * multiplier;
    this.maxCascade = Math.max(this.maxCascade, cascade);
    return stats;
  }

  /**
   * 依据重力下落、收集出口食材并补充新方块。
   * @param ingredientTarget 关卡需要收集的食材总数
   */
  private collapseAndRefill(ingredientTarget: number): void {
    for (let c = 0; c < this.cols; c++) {
      // 以空洞为界，将每列拆分为若干连续段，段内方块独立下落。
      let segTop = 0;
      for (let r = 0; r <= this.rows; r++) {
        const isBreak = r === this.rows || this.cells[this.index(r, c)].hole;
        if (!isBreak) continue;
        const segBottom = r - 1;
        if (segBottom >= segTop) this.compactSegment(c, segTop, segBottom);
        segTop = r + 1;
      }
    }

    // 食材落到出口格（或最底行）即视为送达并被收集。
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const cell = this.cells[this.index(r, c)];
        if (!cell.tile || cell.tile.kind !== 'ingredient') continue;
        if (cell.exit || r === this.rows - 1) {
          cell.tile = null;
          this.ingredientsCollected++;
        }
      }
    }

    const remaining = { value: Math.max(0, ingredientTarget - this.ingredientsCollected) };
    for (let c = 0; c < this.cols; c++) {
      let segTop = 0;
      for (let r = 0; r <= this.rows; r++) {
        const isBreak = r === this.rows || this.cells[this.index(r, c)].hole;
        if (!isBreak) continue;
        for (let y = segTop; y <= r - 1; y++) {
          const cell = this.cells[this.index(y, c)];
          if (cell.tile) continue;
          if (cell.spawn && remaining.value > 0) {
            cell.tile = this.makeIngredient();
            remaining.value--;
          } else {
            cell.tile = this.makeCandy(this.randomColor());
          }
        }
        segTop = r + 1;
      }
    }
  }

  /**
   * 将某一列片段内的方块向下压实。
   * @param c 列
   * @param top 片段顶部行
   * @param bottom 片段底部行
   */
  private compactSegment(c: number, top: number, bottom: number): void {
    const tiles: Tile[] = [];
    for (let r = top; r <= bottom; r++) {
      const cell = this.cells[this.index(r, c)];
      if (cell.tile) {
        tiles.push(cell.tile);
        cell.tile = null;
      }
    }
    let cursor = bottom;
    for (let i = tiles.length - 1; i >= 0; i--) {
      this.cells[this.index(cursor, c)].tile = tiles[i];
      cursor--;
    }
  }

  /**
   * 判断一次交换是否合法（能形成三消、涉及特殊糖果或涉及食材）。
   * @param a 起点
   * @param b 终点
   * @returns 是否合法
   */
  isValidSwap(a: Pos, b: Pos): boolean {
    const ta = this.tileAt(a.r, a.c);
    const tb = this.tileAt(b.r, b.c);
    if (!ta || !tb) return false;
    if (ta.kind === 'ingredient' || tb.kind === 'ingredient') return true;
    if (ta.special !== 'none' || tb.special !== 'none') return true;
    this.swapTiles(a, b);
    const hasMatch = this.findMatchGroups().length > 0;
    this.swapTiles(a, b);
    return hasMatch;
  }

  /**
   * 交换两个格子内的方块。
   * @param a 起点
   * @param b 终点
   */
  swapTiles(a: Pos, b: Pos): void {
    const ca = this.cellAt(a.r, a.c);
    const cb = this.cellAt(b.r, b.c);
    if (!ca || !cb) return;
    const tmp = ca.tile;
    ca.tile = cb.tile;
    cb.tile = tmp;
  }

  /**
   * 判断两个位置是否相邻（供视图层复用的静态版本）。
   * @param a 位置 a
   * @param b 位置 b
   * @returns 是否相邻
   */
  static isAdjacentPublic(a: Pos, b: Pos): boolean {
    return Board.isAdjacent(a, b);
  }

  /**
   * 判断两个位置是否相邻。
   * @param a 位置 a
   * @param b 位置 b
   * @returns 是否相邻
   */
  static isAdjacent(a: Pos, b: Pos): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  /**
   * 检测棋盘上是否还存在可行的移动。
   * @returns 是否存在可行移动
   */
  hasPossibleMove(): boolean {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const here = { r, c };
        const right = { r, c: c + 1 };
        const down = { r: r + 1, c };
        if (this.isPlayable(r, c + 1) && this.isValidSwap(here, right)) return true;
        if (this.isPlayable(r + 1, c) && this.isValidSwap(here, down)) return true;
      }
    }
    return false;
  }

  /**
   * 执行一次交换并结算全部连锁反应。
   * @param a 交换起点
   * @param b 交换终点
   * @param ingredientsToSpawn 需要投放的食材数量
   * @returns 连锁事件列表与本次得分
   */
  resolveSwap(a: Pos, b: Pos, ingredientTarget = 0): { events: ClearEvent[]; gained: number; combo: boolean } {
    const before = this.score;
    const events: ClearEvent[] = [];
    const ta = this.tileAt(a.r, a.c);
    const tb = this.tileAt(b.r, b.c);
    const bothSpecial = !!ta && !!tb && ta.special !== 'none' && tb.special !== 'none';
    // 彩虹糖与任意糖果交换都会立即生效，因此单独判定。
    const hasRainbow =
      !!ta && !!tb && (ta.special === 'rainbow' || tb.special === 'rainbow');
    const combo = bothSpecial || hasRainbow;

    this.swapTiles(a, b);

    if (combo) {
      const comboEvent = this.resolveCombo(a, b, ta, tb);
      if (comboEvent) events.push(comboEvent);
    }

    let cascade = 0;
    let pendingTarget = ingredientTarget;
    for (;;) {
      const groups = this.findMatchGroups();
      if (groups.length === 0) break;
      cascade++;
      const event = this.resolveGroups(groups, [a, b], cascade, pendingTarget);
      pendingTarget = ingredientTarget;
      events.push(event);
    }

    if (events.length === 0) {
      this.swapTiles(a, b);
      return { events, gained: 0, combo: false };
    }

    // 结算结束后若棋盘无解则自动洗牌。
    let guard = 0;
    while (!this.hasPossibleMove() && guard++ < 30) {
      this.shuffleColors();
      const groups = this.findMatchGroups();
      if (groups.length === 0) break;
      cascade++;
      events.push(this.resolveGroups(groups, [], cascade, ingredientTarget));
    }

    return { events, gained: this.score - before, combo };
  }

  /**
   * 结算一组匹配：生成特殊糖果、清除、下落与补给。
   * @param groups 匹配分组
   * @param prefer 生成特殊糖果的优先落点
   * @param cascade 连锁层级
   * @param ingredientsToSpawn 需要投放的食材数量
   * @returns 本次连锁的清除事件
   */
  private resolveGroups(
    groups: MatchGroup[],
    prefer: Pos[],
    cascade: number,
    ingredientTarget: number,
  ): ClearEvent {
    const keep: PosSet = new Map();
    const created: { pos: Pos; special: Special }[] = [];
    const seeds: Pos[] = [];

    for (const group of groups) {
      const special = this.specialForGroup(group);
      if (special !== 'none') {
        const pos = this.pickSpecialPos(group, prefer);
        keep.set(this.index(pos.r, pos.c), pos);
        created.push({ pos, special });
      }
      for (const p of group.cells) seeds.push(p);
    }

    const cleared = this.expandClears(seeds, keep);

    // 在数据被清除之前快照被消除的方块与将被激活的特殊糖果。
    const removed: { pos: Pos; tile: Tile }[] = [];
    const activated: Pos[] = [];
    for (const p of cleared.values()) {
      const tile = this.tileAt(p.r, p.c);
      if (!tile) continue;
      removed.push({ pos: p, tile });
      if (tile.special !== 'none') activated.push(p);
    }

    const stats = this.applyClears(cleared, cascade);

    // 在保留格上生成新的特殊糖果，沿用原分组颜色。
    for (const item of created) {
      const cell = this.cells[this.index(item.pos.r, item.pos.c)];
      const raw = cell.tile?.color ?? groups[0]?.color ?? 0;
      const color: Color = raw >= 0 ? (raw as Color) : 0;
      cell.tile = this.makeCandy(color, item.special);
      stats.specialsCreated++;
      this.score += 120 * cascade;
    }

    this.collapseAndRefill(ingredientTarget);

    return {
      cells: [...cleared.values()],
      cascade,
      score: stats.clearedTiles * 60 * cascade,
      created,
      activated,
      removed,
    };
  }

  /**
   * 结算两个特殊糖果交换产生的组合技。
   * @param a 交换后位置 a
   * @param b 交换后位置 b
   * @param ta 交换前位于 a 的方块
   * @param tb 交换前位于 b 的方块
   * @returns 组合技事件，未触发时返回 null
   */
  private resolveCombo(a: Pos, b: Pos, ta: Tile, tb: Tile): ClearEvent | null {
    const sa = ta.special;
    const sb = tb.special;
    const seeds: Pos[] = [];
    const add = (p: Pos): void => {
      if (this.isPlayable(p.r, p.c)) seeds.push(p);
    };

    if (sa === 'rainbow' && sb === 'rainbow') {
      for (const p of this.allPositions()) add(p);
    } else if (sa === 'rainbow' || sb === 'rainbow') {
      // 交换后方块位置已互换：原 a 处方块现在位于 b，反之亦然。
      const rainbow = sa === 'rainbow' ? b : a;
      const other = sa === 'rainbow' ? tb : ta;
      const target: Color = other.color >= 0 ? (other.color as Color) : this.dominantColor();
      for (const p of this.specialTargets(rainbow, 'rainbow', target)) add(p);
      add(a);
      add(b);
    } else if (sa === 'wrap' && sb === 'wrap') {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) add({ r: a.r + dr, c: a.c + dc });
      }
    } else if ((sa === 'row' || sa === 'col') && (sb === 'row' || sb === 'col')) {
      for (let c = 0; c < this.cols; c++) add({ r: a.r, c });
      for (let r = 0; r < this.rows; r++) add({ r, c: a.c });
    } else {
      // 条纹 + 包装：清除三行三列。
      for (let d = -1; d <= 1; d++) {
        for (let c = 0; c < this.cols; c++) add({ r: a.r + d, c });
        for (let r = 0; r < this.rows; r++) add({ r, c: a.c + d });
      }
    }

    if (seeds.length === 0) return null;

    const keep: PosSet = new Map();
    const cleared = this.expandClears(seeds, keep);
    const removed: { pos: Pos; tile: Tile }[] = [];
    for (const p of cleared.values()) {
      const tile = this.tileAt(p.r, p.c);
      if (tile) removed.push({ pos: p, tile });
    }
    const stats = this.applyClears(cleared, 1);
    this.collapseAndRefill(0);
    return {
      cells: [...cleared.values()],
      cascade: 1,
      score: stats.clearedTiles * 90,
      created: [],
      activated: [a, b],
      removed,
    };
  }
}
