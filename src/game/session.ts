/**
 * 游戏会话：串联棋盘与关卡目标，负责步数/计时、胜负判定与进度统计。
 * 创建者：zhenghq
 */
import { Board } from './board';
import type { ClearEvent, Color, Level, MoveResult, ObjectiveType, Pos } from './types';
import { createRng } from './rng';

/** 单条目标的实时进度。 */
export interface ObjectiveProgress {
  type: ObjectiveType;
  color?: Color;
  target: number;
  current: number;
  done: boolean;
}

/** 会话状态。 */
export type SessionStatus = 'playing' | 'won' | 'lost';

/** 关卡结束时返回的汇总数据。 */
export interface SessionSummary {
  levelId: number;
  status: SessionStatus;
  score: number;
  stars: number;
  movesLeft: number;
  timeLeft: number;
  maxCascade: number;
  progress: ObjectiveProgress[];
}

/**
 * 一局游戏的会话控制器。
 * 创建者：zhenghq
 */
export class GameSession {
  readonly level: Level;
  readonly board: Board;
  private status: SessionStatus = 'playing';
  /** 剩余步数（不限步数模式为 Infinity）。 */
  movesLeft: number;
  /** 剩余时间（秒，非限时模式为 Infinity）。 */
  timeLeft: number;
  /** 已消耗的秒数。 */
  elapsed = 0;
  private moveCount = 0;
  /** 最近一次交换产生的连锁事件，供 UI 播放动画。 */
  lastEvents: ClearEvent[] = [];
  /** 最近一次交换是否有效。 */
  lastValid = true;

  /**
   * 构造一局游戏。
   * @param level 关卡定义
   * @param seed 随机种子
   */
  constructor(level: Level, seed = Date.now()) {
    this.level = level;
    this.board = new Board(level, createRng(seed));
    this.movesLeft = level.moves ?? Infinity;
    this.timeLeft = level.time ?? Infinity;
  }

  /**
   * 推进计时，返回状态是否发生变化。
   * @param dt 经过的秒数
   * @returns 会话是否仍然在进行中
   */
  tick(dt: number): boolean {
    if (this.status !== 'playing') return false;
    this.elapsed += dt;
    if (Number.isFinite(this.timeLeft)) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.evaluate();
      }
    }
    return this.status === 'playing';
  }

  /**
   * 统计还需要投放的食材数量。
   * @returns 需要投放的数量
   */
  private ingredientsToSpawn(): number {
    const target = this.level.objectives
      .filter((o) => o.type === 'ingredient')
      .reduce((sum, o) => sum + o.target, 0);
    if (target === 0) return 0;
    return Math.max(0, target - this.board.ingredientsCollected);
  }

  /**
   * 执行一次交换。
   * @param a 起点
   * @param b 终点
   * @returns 结算结果
   */
  play(a: Pos, b: Pos): MoveResult {
    if (this.status !== 'playing') {
      return { valid: false, combo: false, events: [], gained: 0 };
    }
    if (!Board.isAdjacent(a, b)) {
      return { valid: false, combo: false, events: [], gained: 0 };
    }
    const result = this.board.resolveSwap(a, b, this.ingredientsToSpawn());
    this.lastEvents = result.events;
    this.lastValid = result.events.length > 0;
    if (result.events.length > 0) {
      this.moveCount++;
      if (Number.isFinite(this.movesLeft)) this.movesLeft = Math.max(0, this.movesLeft - 1);
      this.evaluate();
    }
    return {
      valid: result.events.length > 0,
      combo: result.combo,
      events: result.events,
      gained: result.gained,
    };
  }

  /**
   * 计算当前各目标的进度。
   * @returns 目标进度列表
   */
  progress(): ObjectiveProgress[] {
    return this.level.objectives.map((obj) => {
      let current = 0;
      switch (obj.type) {
        case 'score':
          current = this.board.score;
          break;
        case 'collect':
          current = obj.color !== undefined ? this.board.colorCollected[obj.color] : 0;
          break;
        case 'jelly':
          current = this.board.jellyCleared;
          break;
        case 'ice':
          current = this.board.iceCleared;
          break;
        case 'ingredient':
          current = this.board.ingredientsCollected;
          break;
        case 'teddy':
          current = this.board.teddyCleared;
          break;
      }
      const capped = Math.min(current, obj.target);
      return {
        type: obj.type,
        color: obj.color,
        target: obj.target,
        current: capped,
        done: current >= obj.target,
      };
    });
  }

  /**
   * 判断是否所有目标均已达成。
   * @returns 是否全部达成
   */
  private allObjectivesDone(): boolean {
    return this.progress().every((p) => p.done);
  }

  /**
   * 依据当前进度与剩余资源评估胜负。
   */
  private evaluate(): void {
    if (this.status !== 'playing') return;
    if (this.allObjectivesDone()) {
      this.status = 'won';
      return;
    }
    const outOfMoves = Number.isFinite(this.movesLeft) && this.movesLeft <= 0;
    const outOfTime = Number.isFinite(this.timeLeft) && this.timeLeft <= 0;
    if (outOfMoves || outOfTime) {
      this.status = 'lost';
    }
  }

  /**
   * 强制结束本局（例如玩家主动退出）。
   * @param status 目标状态
   */
  forceEnd(status: SessionStatus): void {
    this.status = status;
  }

  /**
   * 当前会话状态。
   * @returns 会话状态
   */
  get currentStatus(): SessionStatus {
    return this.status;
  }

  /**
   * 已使用的步数。
   * @returns 步数
   */
  get usedMoves(): number {
    return this.moveCount;
  }

  /**
   * 依据分数计算星级。
   * @returns 星级（1~3）
   */
  stars(): number {
    const [s1, s2, s3] = this.level.starScores;
    const score = this.board.score;
    if (score >= s3) return 3;
    if (score >= s2) return 2;
    if (score >= s1) return 1;
    // 已经通关时至少给一星，避免出现“过关却无法解锁下一关”的死锁。
    if (this.status === 'won') return 1;
    return 0;
  }

  /**
   * 汇总本局结果。
   * @returns 结算数据
   */
  summary(): SessionSummary {
    return {
      levelId: this.level.id,
      status: this.status,
      score: this.board.score,
      stars: this.stars(),
      movesLeft: this.movesLeft,
      timeLeft: this.timeLeft,
      maxCascade: this.board.maxCascade,
      progress: this.progress(),
    };
  }

  /**
   * 搜索一个可行的交换，用于提示功能。
   * @returns 可行交换，找不到时返回 null
   */
  findHint(): { a: Pos; b: Pos } | null {
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const here = { r, c };
        const right = { r, c: c + 1 };
        const down = { r: r + 1, c };
        if (this.board.isPlayable(r, c + 1) && this.board.isValidSwap(here, right)) {
          return { a: here, b: right };
        }
        if (this.board.isPlayable(r + 1, c) && this.board.isValidSwap(here, down)) {
          return { a: here, b: down };
        }
      }
    }
    return null;
  }
}
