import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api } from '../lib/api';
import { Capacitor } from '@capacitor/core';
import type { Habit, HabitCheckin, HabitStats } from '../types';

/** 把打卡状态推送到 Android 桌面小组件：原生 AuthBridge.syncHabitWidget 写 SharedPreferences 并刷新组件。
 *  仅原生平台生效，web/桌面端静默跳过。 */
function syncWidget(habitId: string, checked: boolean, total: number, date: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    (Capacitor as any).Plugins?.AuthBridge?.syncHabitWidget?.({ habitId, checked, total, date });
  } catch {
    /* 组件同步失败不影响 App 内打卡 */
  }
}

/** 本地缓存 key（离线兜底，与 useReports 的 dd_reports 思路一致） */
const CACHE_KEY = 'dd_habits';
const QUEUE_KEY = 'dd_habit_queue';

/** 离线打卡/取消队列条目 */
interface QueueItem {
  habitId: string;
  date: string;
  action: 'checkin' | 'uncheckin';
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readCache(): Habit[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Habit[]) : [];
  } catch {
    return [];
  }
}
function writeCache(habits: Habit[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(habits));
  } catch {
    /* ignore */
  }
}
function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}
function writeQueue(q: QueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

function normalize(row: any): Habit {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    color: row.color ?? '#f5a623',
    icon: row.icon ?? '🔥',
    reminderAt: row.reminder_at ?? null,
    startDate: (row.start_date ?? '').slice(0, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCheckin(row: any): HabitCheckin {
  return {
    id: row.id,
    habitId: row.habit_id,
    userId: row.user_id,
    checkDate: (row.check_date ?? '').slice(0, 10),
    createdAt: row.created_at,
  };
}

interface State {
  habits: Habit[];
  checkins: Record<string, HabitCheckin[]>; // 按 habitId 分组的当月打卡记录
  stats: Record<string, HabitStats>; // 按 habitId 分组的统计
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'set'; habits: Habit[]; stats: Record<string, HabitStats> }
  | { type: 'upsert'; habit: Habit }
  | { type: 'remove'; id: string }
  | { type: 'setCheckins'; habitId: string; checkins: HabitCheckin[] }
  | { type: 'upsertCheckin'; habitId: string; checkin: HabitCheckin }
  | { type: 'setStats'; stats: Record<string, HabitStats> }
  | { type: 'bumpStat'; habitId: string; date: string; delta: number }
  | { type: 'loading'; v: boolean }
  | { type: 'error'; msg: string | null };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, habits: a.habits, stats: a.stats, loading: false, error: null };
    case 'upsert': {
      const i = s.habits.findIndex((h) => h.id === a.habit.id);
      const habits =
        i >= 0 ? s.habits.map((h) => (h.id === a.habit.id ? a.habit : h)) : [a.habit, ...s.habits];
      return { ...s, habits };
    }
    case 'remove':
      return {
        ...s,
        habits: s.habits.filter((h) => h.id !== a.id),
        checkins: Object.fromEntries(
          Object.entries(s.checkins).filter(([k]) => k !== a.id)
        ),
        stats: Object.fromEntries(Object.entries(s.stats).filter(([k]) => k !== a.id)),
      };
    case 'setCheckins': {
      const checkins = { ...s.checkins, [a.habitId]: a.checkins };
      return { ...s, checkins };
    }
    case 'upsertCheckin': {
      const list = s.checkins[a.habitId] ?? [];
      const i = list.findIndex((c) => c.checkDate === a.checkin.checkDate);
      const next =
        i >= 0
          ? list.map((c) => (c.checkDate === a.checkin.checkDate ? a.checkin : c))
          : [a.checkin, ...list];
      return { ...s, checkins: { ...s.checkins, [a.habitId]: next } };
    }
    case 'setStats':
      return { ...s, stats: a.stats };
    case 'bumpStat': {
      const prev =
        s.stats[a.habitId] ??
        ({ habitId: a.habitId, total: 0, currentStreak: 0, monthlyCount: 0, monthlyRate: 0 } as HabitStats);
      const inMonth = a.date.slice(0, 7) === currentMonth();
      const updated: HabitStats = {
        ...prev,
        total: Math.max(0, prev.total + a.delta),
        monthlyCount: Math.max(0, prev.monthlyCount + (inMonth ? a.delta : 0)),
      };
      return { ...s, stats: { ...s.stats, [a.habitId]: updated } };
    }
    case 'loading':
      return { ...s, loading: a.v };
    case 'error':
      return { ...s, error: a.msg };
    default:
      return s;
  }
}

export function useHabits() {
  const [state, dispatch] = useReducer(reducer, {
    habits: [],
    checkins: {},
    stats: {},
    loading: true,
    error: null,
  });

  // 用 ref 持有最新 stats，避免 refresh 闭包依赖 state 造成重复刷新
  const statsRef = useRef<Record<string, HabitStats>>({});
  useEffect(() => {
    statsRef.current = state.stats;
  }, [state.stats]);

  const refreshStats = useCallback(async () => {
    try {
      const stats = (await api.habits.getStats()) as Record<string, HabitStats>;
      dispatch({ type: 'setStats', stats });
    } catch {
      /* 统计失败不影响习惯列表，保留上次结果 */
    }
  }, []);

  // 离线队列：把未成功的打卡/取消请求重放到服务端
  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (!queue.length) return;
    const remaining: QueueItem[] = [];
    for (const item of queue) {
      try {
        if (item.action === 'checkin') await api.habits.checkIn(item.habitId, item.date);
        else await api.habits.uncheckIn(item.habitId, item.date);
      } catch {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    if (!remaining.length) await refreshStats();
  }, [refreshStats]);

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'loading', v: true });
      const rows = (await api.habits.listHabits()) as any[];
      const habits = rows.map(normalize);
      writeCache(habits);
      let stats: Record<string, HabitStats> = {};
      try {
        stats = (await api.habits.getStats()) as Record<string, HabitStats>;
      } catch {
        /* 统计可选 */
      }
      await flushQueue();
      dispatch({ type: 'set', habits, stats });
    } catch (e: any) {
      // 离线兜底：回退本地缓存，保证不白屏
      const cached = readCache();
      const detail = e?.message || String(e) || '未知错误';
      if (cached.length) {
        dispatch({ type: 'set', habits: cached, stats: statsRef.current });
        dispatch({ type: 'error', msg: `加载失败：${detail}（展示本地缓存）` });
      } else {
        dispatch({ type: 'error', msg: `加载失败：${detail}` });
      }
    }
  }, [flushQueue]);

  useEffect(() => {
    if (localStorage.getItem('dd_token')) refresh();
  }, [refresh]);

  // 回到前台时刷新习惯：用户在后台通过桌面小组件打卡后，App 重新可见即拉取最新状态（Widget→App 同步）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const addHabit = useCallback(async (h: Partial<Habit>) => {
    const row = (await api.habits.createHabit(h)) as any;
    const habit = normalize(row);
    dispatch({ type: 'upsert', habit });
    await refreshStats();
    return habit;
  }, [refreshStats]);

  const updateHabit = useCallback(async (id: string, patch: Partial<Habit>) => {
    const row = (await api.habits.updateHabit(id, patch)) as any;
    const habit = normalize(row);
    dispatch({ type: 'upsert', habit });
    return habit;
  }, []);

  const removeHabit = useCallback(async (id: string) => {
    await api.habits.deleteHabit(id);
    dispatch({ type: 'remove', id });
  }, []);

  const getCheckins = useCallback(async (habitId: string, from: string, to: string) => {
    try {
      const rows = (await api.habits.getCheckins(habitId, from, to)) as any[];
      dispatch({ type: 'setCheckins', habitId, checkins: rows.map(normalizeCheckin) });
    } catch {
      /* 离线时保留已有记录 */
    }
  }, []);

  const checkIn = useCallback(
    async (habitId: string, date: string): Promise<HabitCheckin> => {
      try {
        const row = (await api.habits.checkIn(habitId, date)) as any;
        const ci = normalizeCheckin(row);
        dispatch({ type: 'upsertCheckin', habitId, checkin: ci });
        await refreshStats();
        // 同步桌面小组件（后端已返回最新累计 total）
        syncWidget(habitId, true, Number(row?.total ?? -1), date);
        return ci;
      } catch (e: any) {
        // 离线：乐观更新并入队，下次刷新时重放
        const q = readQueue();
        q.push({ habitId, date, action: 'checkin' });
        writeQueue(q);
        const ci: HabitCheckin = {
          id: `local-${date}`,
          habitId,
          userId: '',
          checkDate: date,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'upsertCheckin', habitId, checkin: ci });
        dispatch({ type: 'bumpStat', habitId, date, delta: 1 });
        syncWidget(habitId, true, Math.max(0, (statsRef.current[habitId]?.total ?? 0) + 1), date);
        return ci;
      }
    },
    [refreshStats]
  );

  const uncheckIn = useCallback(
    async (habitId: string, date: string): Promise<void> => {
      try {
        const row = (await api.habits.uncheckIn(habitId, date)) as any;
        const list = (state.checkins[habitId] ?? []).filter((c) => c.checkDate !== date);
        dispatch({ type: 'setCheckins', habitId, checkins: list });
        await refreshStats();
        syncWidget(habitId, false, Number(row?.total ?? -1), date);
      } catch (e: any) {
        const q = readQueue();
        q.push({ habitId, date, action: 'uncheckin' });
        writeQueue(q);
        const list = (state.checkins[habitId] ?? []).filter((c) => c.checkDate !== date);
        dispatch({ type: 'setCheckins', habitId, checkins: list });
        dispatch({ type: 'bumpStat', habitId, date, delta: -1 });
        syncWidget(habitId, false, Math.max(0, (statsRef.current[habitId]?.total ?? 0) - 1), date);
      }
    },
    [refreshStats, state.checkins]
  );

  return {
    ...state,
    refresh,
    addHabit,
    updateHabit,
    removeHabit,
    getCheckins,
    checkIn,
    uncheckIn,
    getStats: refreshStats,
  };
}

export type HabitsApi = ReturnType<typeof useHabits>;
