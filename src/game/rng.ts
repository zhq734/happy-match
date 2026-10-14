/**
 * 可复现的伪随机数生成器。
 * 创建者：zhenghq
 */

/** 伪随机数生成器接口。 */
export interface Rng {
  /** 返回 [0, 1) 区间的随机数。 */
  next(): number;
  /** 返回 [0, max) 区间的整数。 */
  int(max: number): number;
  /** 从数组中随机取一个元素。 */
  pick<T>(items: readonly T[]): T;
}

/**
 * 使用 mulberry32 算法创建可复现随机数生成器。
 * @param seed 随机种子
 * @returns 伪随机数生成器
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
  };
}
