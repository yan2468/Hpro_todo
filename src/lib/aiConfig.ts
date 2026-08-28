// DeepSeek / OpenAI 兼容大模型配置（保存在本地，仅本机可用）
export type GenFrequency = 'daily' | 'weekly' | 'custom';
export type GenMode = 'timed' | 'event'; // timed=到配置时间触发；event=本周日报达到 5 条立即触发

export interface AIConfig {
  enabled: boolean; // 是否启用自动生成周报
  apiKey: string; // API Key
  url: string; // Chat Completions 完整接口地址
  model: string; // 模型名称
  temperature: number; // 温度 0~1
  prompt: string; // 提示词（系统级要求）
  skills: string; // 技能 / 附加指令（自由文本）
  // 自动生成触发模式
  genMode: GenMode; // timed=定时触发（需满足≥5条日报）；event=事件触发（达到5条即触发）
  // 自动生成周期配置（timed 模式下使用）
  genFrequency: GenFrequency; // daily=每天、weekly=每周某天、custom=每 N 天
  genTime: string; // HH:mm，每天/每周/自定义均适用
  genWeekday: number; // weekly 模式：周几（0=周日，1=周一...6=周六）
  genInterval: number; // custom 模式：每 N 天
  genLastAt: string; // 上次生成时间 ISO（主进程持久化，用于 custom 间隔计算）
}

const KEY = 'dd_ai_config';

const DEFAULT: AIConfig = {
  enabled: false,
  apiKey: '',
  url: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  temperature: 0.7,
  prompt:
    '你是一名严谨的周报助理，负责根据本周的日报与任务清单，生成一份结构清晰、重点突出的工作周报。' +
    '要求：1）用简体中文；2）按工作板块归类，提炼成果而非罗列流水账；3）语言精炼、客观、专业；4）只输出周报正文，不要多余寒暄。',
  skills: '',
  genMode: 'timed',
  genFrequency: 'weekly',
  genTime: '18:00',
  genWeekday: 5, // 周五
  genInterval: 3,
  genLastAt: '',
};

export function getAIConfig(): AIConfig {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULT;
  }
}

export function setAIConfig(c: AIConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
  // ponytail: 同步推送给主进程，让它在后台也能按新配置重新调度
  const electronAPI = (window as any).electronAPI;
  electronAPI?.setAIConfig?.(c);
}

// 自动补全 Chat Completions 路径：若用户只填了 base url，补齐 /v1/chat/completions
export function normalizeAIUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/chat\/completions$/i.test(u)) return u;
  const base = u.replace(/\/$/, '');
  return `${base}/v1/chat/completions`;
}

// ponytail: 计算下次触发时间，给主进程调度用
export function nextTriggerDate(c: AIConfig, now: Date = new Date()): Date | null {
  if (!c.genTime) return null;
  const [h, m] = c.genTime.split(':').map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const next = new Date(now);
  next.setHours(h, m, 0, 0);

  if (c.genFrequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (c.genFrequency === 'weekly') {
    const target = ((c.genWeekday % 7) + 7) % 7;
    let diff = (target - next.getDay() + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setDate(next.getDate() + diff);
    return next;
  }
  // custom：以上次生成为基准 +N 天，没记录则明天同一时刻
  if (c.genLastAt) {
    const last = new Date(c.genLastAt);
    if (!isNaN(last.getTime())) {
      const base = new Date(last);
      base.setDate(base.getDate() + Math.max(1, c.genInterval));
      base.setHours(h, m, 0, 0);
      if (base > now) return base;
    }
  }
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}
