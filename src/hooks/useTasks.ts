import { useCallback, useEffect, useReducer } from 'react';
import { api } from '../lib/api';
import type { Step, Task } from '../types';

const electronAPI = (window as any).electronAPI;

function parseSteps(raw: unknown): Step[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Step[];
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalize(row: any): Task {
  const steps = parseSteps(row.steps);
  // 步骤存在时，进度由步骤完成情况推导（total=步骤数，current=已完成数）
  const total = steps.length > 0 ? steps.length : Number(row.total) || 0;
  const current = steps.length > 0 ? steps.filter((s) => s.done).length : Number(row.current) || 0;
  return {
    id: row.id,
    user_id: row.user_id,
    parentId: row.parent_id ?? null,
    title: row.title,
    category: row.category,
    tags: row.tags ?? [],
    current,
    total,
    steps,
    status: row.status,
    sortOrder: row.sort_order ?? 0,
    priority: row.priority ?? null,
    note: row.note ?? '',
    reminderAt: row.reminder_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface State {
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'set'; tasks: Task[] }
  | { type: 'upsert'; task: Task }
  | { type: 'remove'; id: string }
  | { type: 'loading'; v: boolean }
  | { type: 'error'; msg: string | null };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, tasks: a.tasks, loading: false, error: null };
    case 'upsert': {
      const i = s.tasks.findIndex((t) => t.id === a.task.id);
      const tasks =
        i >= 0 ? s.tasks.map((t) => (t.id === a.task.id ? a.task : t)) : [a.task, ...s.tasks];
      return { ...s, tasks };
    }
    case 'remove':
      return { ...s, tasks: s.tasks.filter((t) => t.id !== a.id) };
    case 'loading':
      return { ...s, loading: a.v };
    case 'error':
      return { ...s, error: a.msg };
    default:
      return s;
  }
}

export function useTasks() {
  const [state, dispatch] = useReducer(reducer, { tasks: [], loading: true, error: null });

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'loading', v: true });
      const rows = (await api.listTasks()) as any[];
      dispatch({ type: 'set', tasks: rows.map(normalize) });
    } catch (e: any) {
      dispatch({ type: 'error', msg: e.message });
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('dd_token')) refresh();
  }, [refresh]);

  const addTask = useCallback(async (t: Partial<Task>) => {
    const payload: any = { ...t };
    if (payload.steps) payload.steps = JSON.stringify(payload.steps);
    const task = (await api.createTask(payload)) as any;
    const norm = normalize(task);
    dispatch({ type: 'upsert', task: norm });
    electronAPI?.notifyTaskChanged?.();
    return norm;
  }, []);

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>, opts?: { skipNotify?: boolean }) => {
      const payload: any = { ...patch };
      if (payload.steps) payload.steps = JSON.stringify(payload.steps);
      const task = (await api.updateTask(id, payload)) as any;
      const norm = normalize(task);
      dispatch({ type: 'upsert', task: norm });
      if (!opts?.skipNotify) electronAPI?.notifyTaskChanged?.();
      return norm;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    await api.deleteTask(id);
    dispatch({ type: 'remove', id });
    electronAPI?.notifyTaskChanged?.();
  }, []);

  return { ...state, refresh, addTask, updateTask, remove };
}

export type TasksApi = ReturnType<typeof useTasks>;
