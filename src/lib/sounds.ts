// 声音特效工具

type SoundType = 'attack' | 'special' | 'victory' | 'defeat' | 'breed' | 'click' | 'hover';

const sounds: Record<SoundType, string> = {
  attack: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA', // 简化的攻击音效
  special: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA',
  victory: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA',
  defeat: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA',
  breed: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA',
  click: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA',
  hover: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA',
};

let audioContext: AudioContext | null = null;
let backgroundMusicSource: AudioBufferSourceNode | null = null;
let backgroundMusicGain: GainNode | null = null;
let isMusicPlaying = false;
let battleResultTimeoutIds: number[] = [];
let battleResultSources: AudioBufferSourceNode[] = [];
let gatherAmbienceGain: GainNode | null = null;
let gatherAmbienceFilter: BiquadFilterNode | null = null;
let gatherAmbienceOscillators: OscillatorNode[] = [];
let gatherAmbiencePulseTimer: number | null = null;
let isGatherAmbiencePlaying = false;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

function createNoteBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 5);
    data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
  }
  
  return buffer;
}

// 生成战斗背景音乐
function generateBattleMusic(): AudioBuffer {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const duration = 8; // 8秒循环
  const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const beat = Math.floor(t * 2) / 2; // 每半秒一拍
      
      // 底鼓节奏
      const kick = Math.sin(2 * Math.PI * 60 * (t - beat)) * Math.exp(-(t - beat) * 20) * 0.3;
      
      // 简单的旋律
      const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 329.63, 293.66, 261.63]; // C4 scale
      const melody = Math.sin(2 * Math.PI * notes[Math.floor(t * 0.5) % notes.length] * t) * 0.1;
      
      // 整体节奏感
      const rhythm = Math.sin(2 * Math.PI * 2 * t) * 0.05;
      
      data[i] = kick + melody + rhythm;
    }
  }
  
  return buffer;
}

export function startBattleMusic(): void {
  if (isMusicPlaying) return;
  
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const buffer = generateBattleMusic();
    backgroundMusicSource = ctx.createBufferSource();
    backgroundMusicSource.buffer = buffer;
    backgroundMusicSource.loop = true;
    
    backgroundMusicGain = ctx.createGain();
    backgroundMusicGain.gain.value = 0.15;
    
    backgroundMusicSource.connect(backgroundMusicGain);
    backgroundMusicGain.connect(ctx.destination);
    backgroundMusicSource.start(0);
    isMusicPlaying = true;
  } catch (e) {
    console.log('Background music not available');
  }
}

export function stopBattleMusic(): void {
  if (!isMusicPlaying) return;
  
  try {
    if (backgroundMusicSource) {
      backgroundMusicSource.stop();
      backgroundMusicSource = null;
    }
    isMusicPlaying = false;
  } catch (e) {
    console.log('Error stopping music');
  }
}

function registerBattleResultTimeout(callback: () => void, delayMs: number): void {
  const id = window.setTimeout(() => {
    battleResultTimeoutIds = battleResultTimeoutIds.filter((timerId) => timerId !== id);
    callback();
  }, delayMs);
  battleResultTimeoutIds.push(id);
}

function trackBattleResultSource(source: AudioBufferSourceNode): void {
  battleResultSources.push(source);
  source.onended = () => {
    battleResultSources = battleResultSources.filter((node) => node !== source);
  };
}

export function stopBattleResultSound(): void {
  for (const timerId of battleResultTimeoutIds) {
    window.clearTimeout(timerId);
  }
  battleResultTimeoutIds = [];

  for (const source of battleResultSources) {
    try {
      source.stop();
    } catch {
      // Ignore already stopped source.
    }
  }
  battleResultSources = [];
}

function playTone(frequency: number, duration: number, volume = 0.15, type: OscillatorType = 'sine'): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    console.log('Sound not available');
  }
}

function playGatherPulse(): void {
  playTone(392, 0.7, 0.035, 'sine');
  setTimeout(() => playTone(523.25, 0.75, 0.03, 'sine'), 320);
  setTimeout(() => playTone(659.25, 0.8, 0.025, 'sine'), 680);
}

export function startGatherAmbience(): void {
  if (isGatherAmbiencePlaying) {
    return;
  }

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    gatherAmbienceGain = ctx.createGain();
    gatherAmbienceGain.gain.value = 0.02;
    gatherAmbienceFilter = ctx.createBiquadFilter();
    gatherAmbienceFilter.type = 'lowpass';
    gatherAmbienceFilter.frequency.value = 780;
    gatherAmbienceFilter.Q.value = 0.45;
    gatherAmbienceFilter.connect(gatherAmbienceGain);
    gatherAmbienceGain.connect(ctx.destination);

    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 98;

    const mid = ctx.createOscillator();
    mid.type = 'sine';
    mid.frequency.value = 147;

    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = 196;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.007;
    lfo.connect(lfoGain);
    lfoGain.connect(gatherAmbienceGain.gain);

    low.connect(gatherAmbienceFilter);
    mid.connect(gatherAmbienceFilter);
    shimmer.connect(gatherAmbienceFilter);

    low.start();
    mid.start();
    shimmer.start();
    lfo.start();

    gatherAmbienceOscillators = [low, mid, shimmer, lfo];
    playGatherPulse();
    gatherAmbiencePulseTimer = window.setInterval(playGatherPulse, 11000);
    isGatherAmbiencePlaying = true;
  } catch {
    console.log('Background ambience not available');
  }
}

export function stopGatherAmbience(): void {
  if (!isGatherAmbiencePlaying) {
    return;
  }

  for (const oscillator of gatherAmbienceOscillators) {
    try {
      oscillator.stop();
    } catch {
      // Ignore stop errors.
    }
  }
  gatherAmbienceOscillators = [];

  if (gatherAmbiencePulseTimer !== null) {
    window.clearInterval(gatherAmbiencePulseTimer);
    gatherAmbiencePulseTimer = null;
  }

  if (gatherAmbienceFilter) {
    try {
      gatherAmbienceFilter.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }
  gatherAmbienceFilter = null;

  if (gatherAmbienceGain) {
    try {
      gatherAmbienceGain.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }
  gatherAmbienceGain = null;
  isGatherAmbiencePlaying = false;
}

export function playGatherStartSound(): void {
  playTone(349.23, 0.35, 0.06, 'sine');
  setTimeout(() => playTone(440, 0.4, 0.055, 'sine'), 220);
}

export function playGatherReadySound(): void {
  playTone(440, 0.3, 0.06, 'sine');
  setTimeout(() => playTone(554.37, 0.35, 0.06, 'sine'), 180);
  setTimeout(() => playTone(659.25, 0.45, 0.06, 'sine'), 420);
}

// 生成简单的音效
function generateSound(type: SoundType): AudioBuffer {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  let duration = 0.2;
  let frequency = 440;
  let volume = 0.3;

  switch (type) {
    case 'attack':
      duration = 0.15;
      frequency = 220;
      volume = 0.2;
      break;
    case 'special':
      duration = 0.4;
      frequency = 330;
      volume = 0.3;
      break;
    case 'victory':
      duration = 0.6;
      frequency = 523;
      volume = 0.25;
      break;
    case 'defeat':
      duration = 0.5;
      frequency = 200;
      volume = 0.2;
      break;
    case 'breed':
      duration = 0.3;
      frequency = 400;
      volume = 0.25;
      break;
    case 'click':
      duration = 0.08;
      frequency = 600;
      volume = 0.15;
      break;
    case 'hover':
      duration = 0.05;
      frequency = 800;
      volume = 0.1;
      break;
  }

  const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    // 简单的正弦波 + 衰减
    const envelope = Math.exp(-t * (type === 'special' ? 3 : 8));
    data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * volume;
    
    // 添加一些泛音
    if (type === 'victory') {
      data[i] += Math.sin(2 * Math.PI * frequency * 1.5 * t) * envelope * volume * 0.5;
    }
  }

  return buffer;
}

export function playSound(type: SoundType): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const buffer = generateSound(type);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (e) {
    console.log('Sound not available');
  }
}

// 播放战斗音效
export function playAttackSound(isSpecial: boolean = false): void {
  playSound(isSpecial ? 'special' : 'attack');
}

export function playVictorySound(): void {
  // 胜利音效 - 25倍长度超长庆典
  try {
    stopBattleResultSound();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    // 播放超长胜利旋律 - 重复3遍
    const melody = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 523.25];
    const durations = [0.3, 0.3, 0.3, 0.5, 0.3, 0.3, 0.8];
    
    // 第1遍
    melody.forEach((freq, i) => {
      registerBattleResultTimeout(() => playVictoryNote(ctx, freq, 0, durations[i]), i * 250);
    });
    
    // 第2遍 (1.8秒后)
    melody.forEach((freq, i) => {
      registerBattleResultTimeout(() => playVictoryNote(ctx, freq, 0, durations[i]), 1800 + i * 250);
    });
    
    // 第3遍 (3.6秒后)
    melody.forEach((freq, i) => {
      registerBattleResultTimeout(() => playVictoryNote(ctx, freq, 0, durations[i]), 3600 + i * 250);
    });
    
    // 最后高潮 (5.4秒后)
    registerBattleResultTimeout(() => playVictoryNote(ctx, 1046.50, 0, 1.0), 5400);
    registerBattleResultTimeout(() => playVictoryNote(ctx, 1318.51, 0, 1.0), 5500);
    registerBattleResultTimeout(() => playVictoryNote(ctx, 1567.98, 0, 1.5), 5600);
  } catch (e) {
    console.log('Sound not available');
  }
}

function playVictoryNote(ctx: AudioContext, freq: number, freq2: number = 0, duration: number): void {
  const buffer = createNoteBuffer(ctx, freq, duration);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  source.connect(gain);
  gain.connect(ctx.destination);
  trackBattleResultSource(source);
  source.start(0);
}

export function playDefeatSound(): void {
  // 失败音效 - 25倍长度
  try {
    stopBattleResultSound();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    // 播放悲伤旋律 - 重复2遍
    const melody = [392.00, 369.99, 349.23, 329.63, 311.13, 293.66, 261.63];
    const durations = [0.3, 0.3, 0.3, 0.4, 0.3, 0.3, 0.8];
    
    // 第1遍
    melody.forEach((freq, i) => {
      registerBattleResultTimeout(() => playVictoryNote(ctx, freq, 0, durations[i]), i * 300);
    });
    
    // 第2遍 (2.2秒后)
    melody.forEach((freq, i) => {
      registerBattleResultTimeout(() => playVictoryNote(ctx, freq, 0, durations[i]), 2200 + i * 300);
    });
    
    // 最后 (4.4秒后)
    registerBattleResultTimeout(() => playVictoryNote(ctx, 196.00, 0, 1.5), 4400);
  } catch (e) {
    console.log('Sound not available');
  }
}

export function playBreedSound(): void {
  playSound('breed');
}

export function playClickSound(): void {
  playSound('click');
}
