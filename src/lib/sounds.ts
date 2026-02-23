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

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
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
  playSound('victory');
}

export function playDefeatSound(): void {
  playSound('defeat');
}

export function playBreedSound(): void {
  playSound('breed');
}

export function playClickSound(): void {
  playSound('click');
}
