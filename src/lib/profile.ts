export interface Profile {
  avatar: string;
  name: string;
  workStart: string; // HH:mm，上班时间，用于首页倒计时窗口起点
  workEnd: string; // HH:mm，下班时间，用于首页倒计时窗口终点
}

const KEY = 'dd_profile';
const DEFAULT: Profile = { avatar: '🐮', name: '', workStart: '09:00', workEnd: '18:00' };

export const AVATARS = [
  '🐮',
  '🐴',
  '🐱',
  '🐶',
  '🐰',
  '🦊',
  '🐼',
  '🐸',
  '🐥',
  '🐢',
  '🐙',
  '🦄',
];

export function getProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const merged = { ...DEFAULT, ...raw };
    // 向后兼容：旧版 offWorkTime 字段映射到 workEnd
    if (raw.offWorkTime && !raw.workEnd) merged.workEnd = raw.offWorkTime;
    return merged;
  } catch {
    return DEFAULT;
  }
}

export function setProfile(p: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
