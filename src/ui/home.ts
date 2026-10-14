/**
 * 首页界面：标题、开始游戏、玩法说明与设置。
 * 创建者：zhenghq
 */
import { LEVELS } from '../game/levels';
import { countStars, type SaveData } from '../storage/progress';
import { audio } from '../audio/sound';
import { applyTheme, watchSystemTheme, type ThemeMode } from './theme';
import { el } from './dom';

/**
 * 首页控制器。
 * 创建者：zhenghq
 */
export class HomeScreen {
  readonly root: HTMLElement;
  private readonly save: SaveData;
  private readonly onPlay: () => void;
  private readonly onSaveChange: () => void;
  private starsEl!: HTMLSpanElement;
  private stopWatch: (() => void) | null = null;

  /**
   * 构造首页。
   * @param save 存档
   * @param onPlay 开始游戏回调
   * @param onSaveChange 存档变更回调
   */
  constructor(save: SaveData, onPlay: () => void, onSaveChange: () => void) {
    this.save = save;
    this.onPlay = onPlay;
    this.onSaveChange = onSaveChange;
    this.root = el('section', { className: 'screen home' });
    this.build();
  }

  /** 构建首页内容。 */
  private build(): void {
    const logo = el('div', {
      className: 'logo',
      children: [
        el('h1', { text: '开心消消乐' }),
        el('p', { text: 'HAPPY  MATCH' }),
        this.candyRow(),
      ],
    });

    const actions = el('div', {
      className: 'home-actions',
      children: [
        el('button', {
          className: 'btn btn-primary btn-lg',
          text: '▶ 开始游戏',
          onClick: () => {
            audio.unlock();
            audio.play('click');
            if (this.save.settings.music) audio.startMusic();
            this.onPlay();
          },
        }),
        el('button', {
          className: 'btn',
          text: '📖 玩法说明',
          onClick: () => {
            audio.play('click');
            this.showHowTo();
          },
        }),
        el('button', {
          className: 'btn',
          text: '⚙️ 设置',
          onClick: () => {
            audio.play('click');
            this.showSettings();
          },
        }),
      ],
    });

    this.starsEl = el('span', { text: '0' });
    const stats = el('div', {
      className: 'home-stats',
      children: [
        el('span', { children: [document.createTextNode('累计星星 '), el('b', { children: [this.starsEl] })] }),
        el('span', { children: [document.createTextNode('关卡数 '), el('b', { text: String(LEVELS.length) })] }),
      ],
    });

    this.root.append(logo, actions, stats);
    this.refresh();
  }

  /**
   * 构建首页糖果装饰行。
   * @returns 装饰节点
   */
  private candyRow(): HTMLDivElement {
    const row = el('div', { className: 'home-candies' });
    for (let i = 0; i < 5; i++) {
      row.appendChild(
        el('div', {
          className: 'candy-orb',
          style: {
            background: `radial-gradient(circle at 34% 28%, var(--candy-${i}-2), var(--candy-${i}))`,
            animationDelay: `${i * 0.18}s`,
          },
        }),
      );
    }
    return row;
  }

  /** 刷新星数展示。 */
  refresh(): void {
    this.starsEl.textContent = String(countStars(this.save));
  }

  /** 展示玩法说明弹窗。 */
  private showHowTo(): void {
    const items: [string, string][] = [
      ['👆', '拖动或点击相邻糖果进行交换，连成三个及以上即可消除。'],
      ['🌈', '四消生成条纹糖，可清除整行或整列；五消生成彩虹糖。'],
      ['💥', 'L/T 形消除生成包装糖，爆炸时清除周围一圈。'],
      ['✨', '两颗特殊糖果交换会触发强力组合技，效果加倍。'],
      ['🎯', '不同关卡有不同目标：分数、收集、果冻、冰层与食材。'],
      ['🍰', '食材会从顶部掉落，需运到底部出口完成收集。'],
      ['🧸', '部分关卡需要消除小熊：与小熊相邻的消除会把它一起带走。'],
    ];
    const list = el('div', { className: 'how-list' });
    for (const [icon, text] of items) {
      list.appendChild(
        el('div', {
          className: 'how-item',
          children: [el('span', { className: 'badge', text: icon }), el('span', { text })],
        }),
      );
    }
    this.openModal(
      el('div', {
        className: 'modal',
        children: [
          el('h2', { text: '玩法说明' }),
          el('p', { className: 'subtitle', text: '掌握这些技巧，轻松通过全部关卡。' }),
          list,
          el('div', {
            className: 'modal-actions',
            children: [
              el('button', {
                className: 'btn btn-primary',
                text: '我知道了',
                onClick: () => {
                  audio.play('click');
                  this.closeModal();
                },
              }),
            ],
          }),
        ],
      }),
    );
  }

  /** 展示设置弹窗。 */
  private showSettings(): void {
    const soundRow = this.toggleRow('音效', this.save.settings.sound, (v) => {
      this.save.settings.sound = v;
      audio.setSfxEnabled(v);
      if (v) audio.play('click');
      this.onSaveChange();
    });
    const musicRow = this.toggleRow('背景音乐', this.save.settings.music, (v) => {
      this.save.settings.music = v;
      audio.setMusicEnabled(v);
      if (v) audio.startMusic();
      this.onSaveChange();
    });

    const themeRow = el('div', { className: 'how-item' });
    themeRow.appendChild(el('span', { className: 'badge', text: '🎨' }));
    const themeContent = el('div', { style: { flex: '1', minWidth: '0' } });
    themeContent.appendChild(el('div', { text: '主题', style: { fontWeight: '700', color: 'var(--text-primary)' } }));
    const themeBtns = el('div', { className: 'modal-actions', style: { justifyContent: 'flex-start', marginTop: '0.4rem' } });
    const modes: [ThemeMode, string][] = [
      ['auto', '跟随系统'],
      ['light', '明亮'],
      ['dark', '暗色'],
    ];
    for (const [mode, label] of modes) {
      const btn = el('button', {
        className: `btn ${this.save.settings.theme === mode ? 'btn-primary' : 'btn-ghost'}`,
        text: label,
        onClick: () => {
          this.save.settings.theme = mode;
          applyTheme(mode);
          audio.play('click');
          this.onSaveChange();
          this.stopWatch?.();
          this.stopWatch = watchSystemTheme(mode, () => applyTheme(mode));
          this.closeModal();
          this.showSettings();
        },
      });
      themeBtns.appendChild(btn);
    }
    themeContent.appendChild(themeBtns);
    themeRow.appendChild(themeContent);

    this.openModal(
      el('div', {
        className: 'modal',
        children: [
          el('h2', { text: '设置' }),
          el('div', { className: 'how-list', children: [soundRow, musicRow, themeRow] }),
          el('div', {
            className: 'modal-actions',
            children: [
              el('button', {
                className: 'btn btn-primary',
                text: '完成',
                onClick: () => {
                  audio.play('click');
                  this.closeModal();
                },
              }),
            ],
          }),
        ],
      }),
    );
  }

  /**
   * 创建一个开关行。
   * @param label 标签
   * @param value 初始值
   * @param onChange 变更回调
   * @returns 行节点
   */
  private toggleRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLDivElement {
    const row = el('div', { className: 'how-item' });
    row.appendChild(el('span', { className: 'badge', text: value ? '🔔' : '🔕' }));
    const content = el('div', {
      style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' },
    });
    content.appendChild(el('span', { text: label, style: { fontWeight: '700', color: 'var(--text-primary)' } }));
    const btn = el('button', {
      className: `btn ${value ? 'btn-primary' : 'btn-ghost'}`,
      text: value ? '开' : '关',
      onClick: () => {
        const next = !value;
        onChange(next);
        this.closeModal();
        this.showSettings();
      },
    });
    content.appendChild(btn);
    row.appendChild(content);
    return row;
  }

  /**
   * 打开弹窗。
   * @param content 内容
   */
  private openModal(content: HTMLElement): void {
    this.closeModal();
    const backdrop = el('div', { className: 'modal-backdrop', children: [content] });
    backdrop.dataset.role = 'modal';
    this.root.appendChild(backdrop);
  }

  /** 关闭弹窗。 */
  private closeModal(): void {
    this.root.querySelectorAll('[data-role="modal"]').forEach((n) => n.remove());
  }

  /** 清理监听。 */
  dispose(): void {
    this.stopWatch?.();
    this.stopWatch = null;
  }
}
