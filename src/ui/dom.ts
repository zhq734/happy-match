/**
 * 轻量 DOM 构建与操作工具。
 * 创建者：zhenghq
 */

/** 元素属性配置。 */
export interface ElOptions {
  className?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: (e: Event) => void;
  children?: (Node | null | undefined)[];
}

/**
 * 创建 HTML 元素。
 * @param tag 标签名
 * @param options 配置项
 * @returns 创建的元素
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  }
  if (options.style) Object.assign(node.style, options.style);
  if (options.onClick) node.addEventListener('click', options.onClick);
  if (options.children) {
    for (const child of options.children) if (child) node.appendChild(child);
  }
  return node;
}

/**
 * 查询元素，未找到时抛出错误。
 * @param selector CSS 选择器
 * @param root 根节点
 * @returns 匹配到的元素
 */
export function must<T extends Element>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`未找到元素: ${selector}`);
  return found;
}

/**
 * 清空元素的所有子节点。
 * @param node 目标元素
 */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * 生成一个介于 min 与 max 之间的随机浮点数。
 * @param min 下界
 * @param max 上界
 * @returns 随机数
 */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * 延迟指定毫秒。
 * @param ms 毫秒
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成 SVG 星形字符串。
 * @param filled 是否点亮
 * @returns 星形字符
 */
export function starChar(filled: boolean): string {
  return filled ? '★' : '☆';
}
