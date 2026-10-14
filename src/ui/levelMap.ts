/**
 * 关卡地图界面：展示关卡卡片、星级、解锁状态与总进度。
 * 创建者：zhenghq
 */
import { LEVELS } from '../game/levels';
import type { Level } from '../game/types';
import { countStars, isLevelUnlocked, type SaveData } from '../storage/progress';
import { audio } from '../audio/sound';
import { el } from './dom';

/** 模式显示名与配色。 */
const MODE_META: Record<Level['mode'], { label: string; tint: string }> = {
  moves: { label: '步数挑战', tint: 'rgba(244,114,182,0.35)' },
  timed: { label: '限时冲刺', tint: 'rgba(249,115,22,0.32)' },
  collect: { label: '收集目标', tint: 'rgba(14,165,233,0.32)' },
  clear: { label: '清障挑战', tint: 'rgba(16,185,129,0.32)' },
  relax: { label: '轻松模式', tint: 'rgba(100,116,139,0.3)' },
};

/** 目标摘要文案。 */
const OBJ_SUMMARY: Record<string, string> = {
  score: '达成分数',
  jelly: '清除果冻',
  ice: '击碎冰层',
  ingredient: '送达食材',
  collect: '收集糖果',
};

/**
 * 关卡地图界面控制器。
 * 创建者：zhenghq
 */
export class LevelMap {
  readonly root: HTMLElement;
  private readonly grid: HTMLDivElement;
  private readonly summaryBox: HTMLDivElement;
  private readonly save: SaveData;
  private readonly onSelect: (level: Level) => void;
  private readonly onHome: () => void;

  /**
   * 构造关卡地图。
   * @param save 存档数据
   * @param onSelect 选择关卡回调
   * @param onHome 返回首页回调
   */
  constructor(save: SaveData, onSelect: (level: Level) => void, onHome: () => void) {
    this.save = save;
    this.onSelect = onSelect;
    this.onHome = onHome;
    this.root = el('section', { className: 'screen map-screen' });
    this.grid = el('div', { className: 'map-grid' });
    this.summaryBox = el('div', { className: 'map-summary' });
    this.build();
    this.render();
  }

  /** 构建骨架。 */
  private build(): void {
    const topbar = el('header', {
      className: 'topbar',
      children: [
        el('button', {
          className: 'btn btn-icon btn-ghost',
          text: '←',
          attrs: { 'aria-label': '返回首页' },
          onClick: () => this.onHome(),
        }),
        el('h2', { text: '选择关卡' }),
        el('span', { className: 'spacer' }),
      ],
    });
    const scroll = el('div', {
      className: 'map-scroll',
      children: [this.summaryBox, this.grid],
    });
    this.root.appendChild(topbar);
    this.root.appendChild(scroll);
  }

  /** 渲染关卡卡片与总进度。 */
  private render(): void {
    this.summaryBox.replaceChildren();
    const total = countStars(this.save);
    const cleared = LEVELS.filter((l) => (this.save.levels[l.id]?.stars ?? 0) > 0).length;
    this.summaryBox.appendChild(
      el('div', {
        children: [
          el('div', { text: '总进度', style: { fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700' } }),
          el('div', {
            text: `${cleared} / ${LEVELS.length} 关`,
            style: { fontSize: '1.3rem', fontWeight: '800' },
          }),
        ],
      }),
    );
    this.summaryBox.appendChild(
      el('div', {
        children: [
          el('div', { text: '累计星星', style: { fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700' } }),
          el('div', {
            children: [
              el('span', { text: '★ ', style: { color: 'var(--brand-3)' } }),
              el('span', { text: `${total} / ${LEVELS.length * 3}`, style: { fontSize: '1.3rem', fontWeight: '800' } }),
            ],
          }),
        ],
      }),
    );
    this.summaryBox.appendChild(
      el('button', {
        className: 'btn btn-ghost',
        text: '🔄 重置进度',
        onClick: () => this.onReset(),
      }),
    );

    this.grid.replaceChildren();
    for (const level of LEVELS) {
      this.grid.appendChild(this.card(level));
    }
  }

  /** 重置进度（带二次确认）。 */
  private onReset(): void {
    const confirmed = window.confirm('确定要清空所有关卡进度与星级吗？此操作不可撤销。');
    if (!confirmed) return;
    window.dispatchEvent(new CustomEvent('happy-match:reset-progress'));
  }

  /**
   * 构建一张关卡卡片。
   * @param level 关卡定义
   * @returns 卡片节点
   */
  private card(level: Level): HTMLElement {
    const record = this.save.levels[level.id];
    const unlocked = isLevelUnlocked(this.save, level.id);
    const stars = record?.stars ?? 0;
    const meta = MODE_META[level.mode];
    const card = el('button', {
      className: `level-card${unlocked ? '' : ' locked'}`,
      onClick: () => {
        if (!unlocked) {
          audio.play('click');
          window.dispatchEvent(new CustomEvent('happy-match:locked', { detail: level.id }));
          return;
        }
        audio.play('click');
        this.onSelect(level);
      },
    });
    card.style.setProperty('--card-tint', meta.tint);
    card.appendChild(
      el('div', {
        className: 'lv-top',
        children: [
          el('span', { className: 'lv-id', text: `第 ${level.id} 关` }),
          el('span', { className: 'lv-mode', text: meta.label }),
        ],
      }),
    );
    card.appendChild(el('div', { className: 'lv-name', text: level.name }));
    card.appendChild(
      el('div', {
        className: 'lv-obj',
        text: level.objectives
          .map((o) => `${OBJ_SUMMARY[o.type]} ${o.target}`)
          .join(' · '),
      }),
    );
    const starRow = el('div', { className: 'lv-stars' });
    for (let i = 0; i < 3; i++) {
      starRow.appendChild(
        el('span', { className: i < stars ? 'star-on' : 'star-off', text: i < stars ? '★' : '☆' }),
      );
    }
    card.appendChild(starRow);
    if (record && record.bestScore > 0) {
      card.appendChild(
        el('div', {
          text: `最高分 ${record.bestScore}`,
          style: { fontSize: '0.72rem', color: 'var(--text-muted)' },
        }),
      );
    }
    if (!unlocked) {
      card.appendChild(el('div', { className: 'lv-lock', text: '🔒' }));
    }
    return card;
  }

  /** 重新渲染（进度变化后调用）。 */
  refresh(): void {
    this.render();
  }
}
