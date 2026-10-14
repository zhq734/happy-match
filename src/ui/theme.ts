/**
 * 主题管理：跟随系统或在明/暗之间手动切换。
 * 创建者：zhenghq
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/**
 * 计算实际生效的主题。
 * @param mode 主题模式
 * @returns 实际主题
 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return media?.matches ? 'dark' : 'light';
  return mode;
}

/**
 * 应用主题到文档根元素。
 * @param mode 主题模式
 */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

/**
 * 监听系统主题变化。
 * @param mode 当前主题模式
 * @param onChange 变化回调
 * @returns 取消监听函数
 */
export function watchSystemTheme(mode: ThemeMode, onChange: () => void): () => void {
  if (!media) return () => {};
  const handler = (): void => {
    if (mode === 'auto') onChange();
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
