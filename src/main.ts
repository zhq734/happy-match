/**
 * 应用主入口：管理界面切换、存档、主题与全局事件。
 * 创建者：zhenghq
 */
import './style.css';
import { getLevel, LEVELS } from './game/levels';
import type { Level } from './game/types';
import type { SessionSummary } from './game/session';
import { audio } from './audio/sound';
import { defaultSave, loadSave, persistSave, recordResult, type SaveData } from './storage/progress';
import { buildBubbles } from './ui/background';
import { el, must } from './ui/dom';
import { GameScreen } from './ui/gameScreen';
import { HomeScreen } from './ui/home';
import { LevelMap } from './ui/levelMap';
import { applyTheme, watchSystemTheme } from './ui/theme';

/** 当前显示的界面类型。 */
type ScreenKind = 'home' | 'map' | 'game';

/**
 * 应用根控制器。
 * 创建者：zhenghq
 */
class App {
  private save: SaveData = loadSave();
  private screen: ScreenKind = 'home';
  private home: HomeScreen | null = null;
  private map: LevelMap | null = null;
  private game: GameScreen | null = null;
  private stopThemeWatch: (() => void) | null = null;
  private readonly container: HTMLElement;

  /**
   * 构造应用。
   * @param container 根容器
   */
  constructor(container: HTMLElement) {
    this.container = container;
    this.setupBackground();
    this.applySavedTheme();
    this.bindGlobalEvents();
    this.showHome();
  }

  /** 创建背景装饰层。 */
  private setupBackground(): void {
    const bg = el('div', { className: 'bg-decor' });
    buildBubbles(bg, 16);
    this.container.appendChild(bg);
  }

  /** 应用存档中的主题设置。 */
  private applySavedTheme(): void {
    applyTheme(this.save.settings.theme);
    this.stopThemeWatch = watchSystemTheme(this.save.settings.theme, () => {
      applyTheme(this.save.settings.theme);
    });
  }

  /** 绑定跨界面全局事件。 */
  private bindGlobalEvents(): void {
    window.addEventListener('happy-match:next-level', () => this.goNextLevel());
    window.addEventListener('happy-match:locked', (e) => {
      const id = (e as CustomEvent<number>).detail;
      this.toast(`第 ${id} 关尚未解锁，先完成上一关吧！`);
    });
    window.addEventListener('happy-match:reset-progress', () => {
      this.save = defaultSave();
      this.save.settings = { ...loadSave().settings };
      persistSave(this.save);
      this.map?.refresh();
      this.home?.refresh();
      this.toast('进度已重置');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.stopMusic();
    });
  }

  /** 显示首页。 */
  private showHome(): void {
    this.teardown();
    this.screen = 'home';
    this.home = new HomeScreen(
      this.save,
      () => this.showMap(),
      () => this.persist(),
    );
    this.container.appendChild(this.home.root);
    requestAnimationFrame(() => this.home?.root.classList.add('active'));
  }

  /** 显示关卡地图。 */
  private showMap(): void {
    this.teardown();
    this.screen = 'map';
    this.map = new LevelMap(
      this.save,
      (level) => this.startLevel(level),
      () => this.showHome(),
    );
    this.container.appendChild(this.map.root);
    requestAnimationFrame(() => this.map?.root.classList.add('active'));
  }

  /**
   * 开始指定关卡。
   * @param level 关卡定义
   */
  private startLevel(level: Level): void {
    this.teardown();
    this.screen = 'game';
    const seed = Date.now() ^ (level.id * 2654435761);
    this.game = new GameScreen(
      level,
      seed,
      () => this.showMap(),
      (summary) => this.handleResult(summary),
      () => this.startLevel(level),
    );
    this.game.mount(this.container);
    requestAnimationFrame(() => this.game?.root.classList.add('active'));
  }

  /**
   * 处理关卡结算并写入存档。
   * @param summary 结算数据
   */
  private handleResult(summary: SessionSummary): void {
    if (summary.status === 'won') {
      recordResult(this.save, summary.levelId, summary.stars, summary.score);
      this.persist();
    }
  }

  /** 进入下一关（结算弹窗点击“下一关”时触发）。 */
  private goNextLevel(): void {
    const current = this.game?.currentLevel.id ?? 0;
    const next = LEVELS.find((l) => l.id === current + 1);
    if (next) this.startLevel(next);
    else this.showMap();
  }

  /**
   * 显示一条轻量提示。
   * @param message 文案
   */
  private toast(message: string): void {
    const node = el('div', { className: 'toast', text: message });
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    window.setTimeout(() => {
      node.classList.remove('show');
      window.setTimeout(() => node.remove(), 300);
    }, 2000);
  }

  /** 持久化存档。 */
  private persist(): void {
    persistSave(this.save);
  }

  /** 拆除当前界面。 */
  private teardown(): void {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    if (this.map) {
      this.map.root.remove();
      this.map = null;
    }
    if (this.home) {
      this.home.dispose();
      this.home.root.remove();
      this.home = null;
    }
    this.container.querySelectorAll('.screen').forEach((n) => n.remove());
  }

  /** 当前界面。 */
  get currentScreen(): ScreenKind {
    return this.screen;
  }

  /** 清理资源。 */
  dispose(): void {
    this.stopThemeWatch?.();
    this.teardown();
  }
}

/** 启动应用。 */
function bootstrap(): void {
  const app = must<HTMLDivElement>('#app');
  const instance = new App(app);
  // 暴露到全局便于调试。
  (window as unknown as { happyMatch?: App }).happyMatch = instance;
  // 首次用户交互时解锁音频。
  const unlock = (): void => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

export { App, getLevel };
