// 主题管理：浅色 / 深色。存储在 localStorage，挂载到 <html data-theme>。
export type ThemeMode = 'light' | 'dark';

const KEY = 'dd_theme';

export function getTheme(): ThemeMode {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme();
}

export function applyTheme() {
  const mode = getTheme();
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
