import { DEFAULT_API_BASE } from './platform';

// 早期硬编码默认值 / 老 IP，迁到 HTTPS 后应当自动作废。命中后清掉 localStorage
// 让 getBase() 落回 DEFAULT_API_BASE。否则老用户升级后 SettingsModal 仍显示老值，
// 实际请求也会发到不通的老地址（用户浑然不知）。
// 用户主动设回这些值不会被误清：清掉的是 localStorage 残留，不是后续手动配置。
const EXPIRED_BASES = new Set<string>([
  'http://8.163.32.86:8787',
  'https://www.hbywqx.top',
]);

function resolveBase(): string {
  let saved = localStorage.getItem('dd_api_base');
  if (saved && EXPIRED_BASES.has(saved)) {
    localStorage.removeItem('dd_api_base');
    saved = null;
  }
  return (saved || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
}

export function getBase(): string {
  return resolveBase();
}

function getToken(): string | null {
  return localStorage.getItem('dd_token');
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  const t = getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const base = getBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...opts, headers });
  } catch (e: any) {
    throw new Error(`无法连接服务器 (${base})，请检查网络或点击「配置服务器」填写正确的后端地址`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${res.status})`);
  }
  return res.json();
}

import type { Habit, Report, Task, EmployeeCost, CostExtra } from '../types';

export const api = {
  register: (email: string, password: string) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listTasks: () => apiFetch('/tasks'),
  createTask: (t: Partial<Task>) => apiFetch('/tasks', { method: 'POST', body: JSON.stringify(t) }),
  updateTask: (id: string, t: Partial<Task>) =>
    apiFetch(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTask: (id: string) => apiFetch(`/tasks/${id}`, { method: 'DELETE' }),

  listReports: () => apiFetch('/reports'),
  getReport: (id: string) => apiFetch(`/reports/${id}`),
  createReport: (r: Partial<Report>) =>
    apiFetch('/reports', { method: 'POST', body: JSON.stringify(r) }),
  updateReport: (id: string, r: Partial<Report>) =>
    apiFetch(`/reports/${id}`, { method: 'PUT', body: JSON.stringify(r) }),
  deleteReport: (id: string) => apiFetch(`/reports/${id}`, { method: 'DELETE' }),
  cloneReport: (id: string, patch?: Partial<Report>) =>
    apiFetch(`/reports/${id}/clone`, { method: 'POST', body: JSON.stringify(patch || {}) }),

  // ===== 习惯打卡 =====
  habits: {
    listHabits: () => apiFetch('/habits'),
    createHabit: (h: Partial<Habit>) =>
      apiFetch('/habits', { method: 'POST', body: JSON.stringify(h) }),
    getHabit: (id: string) => apiFetch(`/habits/${id}`),
    updateHabit: (id: string, h: Partial<Habit>) =>
      apiFetch(`/habits/${id}`, { method: 'PUT', body: JSON.stringify(h) }),
    deleteHabit: (id: string) => apiFetch(`/habits/${id}`, { method: 'DELETE' }),
    checkIn: (id: string, date: string) =>
      apiFetch(`/habits/${id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ checkDate: date }),
      }),
    uncheckIn: (id: string, date: string) =>
      apiFetch(`/habits/${id}/checkin/${date}`, { method: 'DELETE' }),
    toggleCheckin: (id: string, date: string) =>
      apiFetch(`/habits/${id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ date }),
      }),
    getCheckins: (id: string, from: string, to: string) =>
      apiFetch(
        `/habits/${id}/checkins?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      ),
    getStats: () => apiFetch('/habits/stats'),
  },

  // ===== 员工上班成本 =====
  costs: {
    list: () => apiFetch('/costs'),
    get: (id: string) => apiFetch(`/costs/${id}`),
    create: (c: Partial<EmployeeCost>) =>
      apiFetch('/costs', { method: 'POST', body: JSON.stringify(c) }),
    update: (id: string, c: Partial<EmployeeCost>) =>
      apiFetch(`/costs/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
    remove: (id: string) => apiFetch(`/costs/${id}`, { method: 'DELETE' }),
    // 按天补录的其他花费
    listExtras: (from: string, to: string) =>
      apiFetch(`/costs/extras?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    addExtra: (c: Partial<CostExtra>) =>
      apiFetch('/costs/extras', { method: 'POST', body: JSON.stringify(c) }),
    removeExtra: (id: string) => apiFetch(`/costs/extras/${id}`, { method: 'DELETE' }),
  },

  // ===== 用户设置同步 =====
  settings: {
    getAll: () => apiFetch('/settings'),
    updateAll: (data: Record<string, string>) =>
      apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
};
