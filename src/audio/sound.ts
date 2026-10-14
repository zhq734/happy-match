/**
 * 基于 WebAudio 的程序化音效与背景音乐，无需任何外部音频资源。
 * 创建者：zhenghq
 */

/** 音效名称。 */
export type SoundName = 'swap' | 'match' | 'special' | 'combo' | 'win' | 'lose' | 'click' | 'star';

/**
 * 音频管理器：惰性创建 AudioContext，并提供合成音效与简单循环旋律。
 * 创建者：zhenghq
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private sfxEnabled = true;
  private musicEnabled = true;

  /**
   * 确保音频上下文已就绪。
   * @returns 音频上下文，创建失败时返回 null
   */
  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.14;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /**
   * 在用户交互后解锁音频上下文（浏览器自动播放策略要求）。
   */
  unlock(): void {
    this.ensure();
  }

  /**
   * 设置音效开关。
   * @param enabled 是否启用
   */
  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
  }

  /**
   * 切换音效开关。
   * @returns 切换后的开关状态
   */
  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  /**
   * 切换音乐开关。
   * @returns 切换后的开关状态
   */
  toggleMusic(): boolean {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  /** 当前音效开关状态。 */
  get sfxOn(): boolean {
    return this.sfxEnabled;
  }

  /** 当前音乐开关状态。 */
  get musicOn(): boolean {
    return this.musicEnabled;
  }

  /**
   * 设置音乐开关。
   * @param enabled 是否启用
   */
  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) this.stopMusic();
  }

  /**
   * 播放一个音符。
   * @param freq 频率
   * @param duration 持续秒数
   * @param type 波形
   * @param gain 音量
   * @param delay 延迟秒数
   * @param target 目标增益节点
   */
  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 0.3,
    delay = 0,
    target: GainNode | null = this.sfxGain,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !target) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(target);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /**
   * 播放指定音效。
   * @param name 音效名称
   * @param variant 变体参数（如连锁层级），用于调整音高
   */
  play(name: SoundName, variant = 0): void {
    if (!this.sfxEnabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    switch (name) {
      case 'click':
        this.tone(660, 0.06, 'triangle', 0.18);
        break;
      case 'swap':
        this.tone(420, 0.08, 'sine', 0.2);
        this.tone(560, 0.08, 'sine', 0.16, 0.05);
        break;
      case 'match': {
        const base = 520 * Math.pow(1.12, Math.min(variant, 8));
        this.tone(base, 0.16, 'triangle', 0.28);
        this.tone(base * 1.5, 0.14, 'sine', 0.16, 0.03);
        break;
      }
      case 'special':
        this.tone(300, 0.28, 'sawtooth', 0.2);
        this.tone(900, 0.22, 'sine', 0.18, 0.05);
        break;
      case 'combo':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.22, i * 0.06));
        break;
      case 'star':
        [784, 988, 1318].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.24, i * 0.08));
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) =>
          this.tone(f, 0.42, 'triangle', 0.26, i * 0.13),
        );
        break;
      case 'lose':
        [440, 370, 294, 220].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.22, i * 0.15));
        break;
    }
  }

  /** 一段轻快的循环背景旋律（音名 → 频率）。 */
  private static readonly MELODY = [
    523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 698.46,
    523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 587.33,
  ];
  /** 低音伴奏。 */
  private static readonly BASS = [130.81, 174.61, 196.0, 174.61];

  /**
   * 启动背景音乐循环。
   */
  startMusic(): void {
    if (!this.musicEnabled) return;
    const ctx = this.ensure();
    if (!ctx || this.musicTimer !== null) return;
    const interval = 260;
    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled) return;
      const i = this.musicStep % AudioManager.MELODY.length;
      this.tone(AudioManager.MELODY[i], 0.22, 'triangle', 0.12, 0, this.musicGain);
      if (i % 4 === 0) {
        const b = AudioManager.BASS[(this.musicStep / 4) % AudioManager.BASS.length | 0];
        this.tone(b, 0.5, 'sine', 0.14, 0, this.musicGain);
      }
      this.musicStep++;
    }, interval);
  }

  /**
   * 停止背景音乐循环。
   */
  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

/** 全局音频管理器实例。 */
export const audio = new AudioManager();
