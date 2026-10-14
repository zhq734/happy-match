/**
 * 背景漂浮气泡装饰。
 * 创建者：zhenghq
 */
import { el, rand } from './dom';

/** 气泡使用的颜色变量。 */
const COLORS = [
  'var(--brand-1)',
  'var(--brand-2)',
  'var(--brand-3)',
  'var(--brand-4)',
  'var(--brand-5)',
  'var(--brand-6)',
];

/**
 * 在容器中生成漂浮气泡。
 * @param container 背景容器
 * @param count 气泡数量
 */
export function buildBubbles(container: HTMLElement, count = 14): void {
  for (let i = 0; i < count; i++) {
    const size = rand(14, 58);
    const bubble = el('div', {
      className: 'bubble',
      style: {
        left: `${rand(0, 100)}%`,
        width: `${size}px`,
        height: `${size}px`,
        background: COLORS[i % COLORS.length],
        animationDuration: `${rand(14, 26)}s`,
        animationDelay: `${rand(0, 14)}s`,
      },
    });
    bubble.style.setProperty('--drift', `${rand(-12, 12)}vw`);
    container.appendChild(bubble);
  }
}
