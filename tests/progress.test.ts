/**
 * 存档逻辑单元测试。
 * 创建者：zhenghq
 */
import { describe, expect, it } from 'vitest';
import { countStars, defaultSave, isLevelUnlocked, recordResult } from '../src/storage/progress';

describe('存档逻辑', () => {
  it('默认存档只有第一关解锁', () => {
    const save = defaultSave();
    expect(isLevelUnlocked(save, 1)).toBe(true);
    expect(isLevelUnlocked(save, 2)).toBe(false);
  });

  it('通关后解锁下一关', () => {
    const save = recordResult(defaultSave(), 1, 2, 3000);
    expect(isLevelUnlocked(save, 2)).toBe(true);
    expect(isLevelUnlocked(save, 3)).toBe(false);
  });

  it('保留历史最高星级与分数', () => {
    let save = recordResult(defaultSave(), 1, 3, 5000);
    save = recordResult(save, 1, 1, 2000);
    expect(save.levels[1].stars).toBe(3);
    expect(save.levels[1].bestScore).toBe(5000);
  });

  it('累计总星数', () => {
    let save = defaultSave();
    save = recordResult(save, 1, 3, 5000);
    save = recordResult(save, 2, 2, 4000);
    expect(countStars(save)).toBe(5);
  });
});
