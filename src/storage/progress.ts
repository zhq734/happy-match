/**
 * 玩家进度持久化：关卡星级、最高分与设置。
 * 创建者：zhenghq
 */
import { LEVEL_COUNT } from '../game/levels';

/** 单个关卡的存档记录。 */
export interface LevelRecord {
  stars: number;
  bestScore: number;
  cleared: boolean;
}

/** 全局存档结构。 */
export interface SaveData {
  version: number;
  levels: Record<number, LevelRecord>;
  settings: {
    sound: boolean;
    music: boolean;
    theme: 'auto' | 'light' | 'dark';
  };
  totalStars: number;
}

const STORAGE_KEY = 'happy-match-save-v1';
const SAVE_VERSION = 1;

/**
 * 生成一份全新的存档。
 * @returns 默认存档
 */
export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    levels: {},
    settings: { sound: true, music: true, theme: 'auto' },
    totalStars: 0,
  };
}

/**
 * 读取本地存档，遇到损坏数据时回退为默认值。
 * @returns 存档数据
 */
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    return {
      version: SAVE_VERSION,
      levels: parsed.levels ?? base.levels,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      totalStars: parsed.totalStars ?? 0,
    };
  } catch {
    return defaultSave();
  }
}

/**
 * 写入本地存档。
 * @param data 存档数据
 */
export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 存储不可用时静默失败，游戏仍可继续。
  }
}

/**
 * 计算并刷新存档中的总星数。
 * @param data 存档数据
 * @returns 更新后的存档
 */
export function recalcStars(data: SaveData): SaveData {
  let total = 0;
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    total += data.levels[id]?.stars ?? 0;
  }
  data.totalStars = total;
  return data;
}

/**
 * 记录一次关卡结算结果。
 * @param data 存档数据
 * @param levelId 关卡编号
 * @param stars 本次星级
 * @param score 本次得分
 * @returns 更新后的存档
 */
export function recordResult(data: SaveData, levelId: number, stars: number, score: number): SaveData {
  const prev = data.levels[levelId] ?? { stars: 0, bestScore: 0, cleared: false };
  data.levels[levelId] = {
    stars: Math.max(prev.stars, stars),
    bestScore: Math.max(prev.bestScore, score),
    cleared: prev.cleared || stars > 0,
  };
  return recalcStars(data);
}

/**
 * 判断某一关是否已解锁（第一关默认解锁，后续关卡需前一关至少一星）。
 * @param data 存档数据
 * @param levelId 关卡编号
 * @returns 是否解锁
 */
export function isLevelUnlocked(data: SaveData, levelId: number): boolean {
  if (levelId <= 1) return true;
  return (data.levels[levelId - 1]?.stars ?? 0) > 0;
}

/**
 * 计算全局累计星数。
 * @param data 存档数据
 * @returns 星数
 */
export function countStars(data: SaveData): number {
  return recalcStars({ ...data }).totalStars;
}
