import { useCallback, useEffect, useMemo, useState } from 'react';
import { priorityById, priorityOrder } from './types';
import type { PriorityId, Step, TaskStatus } from './types';

interface WidgetTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: PriorityId | null;
  parentId?: string | null;
  note?: string;
  steps: Step[];
  total: number;
  current: number;
  createdAt: string;
  sortOrder: number;
}

const electronAPI = (window as any).electronAPI;
const OP_KEY = 'dd_widget_opacity';

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

function normalize(row: any): WidgetTask {
  const steps = parseSteps(row.steps);
  const total = steps.length > 0 ? steps.length : Number(row.total) || 0;
  const current = steps.length > 0 ? steps.filter((s) => s.done).length : Number(row.current) || 0;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority ?? null,
    parentId: row.parent_id ?? null,
    note: row.note ?? '',
    steps,
    total,
    current,
    createdAt: row.created_at ?? '',
    sortOrder: Number(row.sort_order ?? 0),
  };
}

// 与主页保持一致：先优先级，再 sort_order，最后创建时间
function sortTasks(a: WidgetTask, b: WidgetTask) {
  const d = priorityOrder(a.priority) - priorityOrder(b.priority);
  if (d !== 0) return d;
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function useWidgetTasks() {
  const [tasks, setTasks] = useState<WidgetTask[]>([]);
  const [msg, setMsg] = useState('加载中…');

  const load = useCallback(async () => {
    if (!electronAPI) {
      setMsg('仅桌面端（电脑版）支持小组件');
      return;
    }
    const auth = await electronAPI.getAuth?.();
    if (!auth || !auth.token) {
      setMsg('请先在主程序登录并配置服务器');
      return;
    }
    try {
      const res = await fetch(`${auth.base}/tasks`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) {
        setMsg(`加载失败：HTTP ${res.status}`);
        return;
      }
      const rows = (await res.json()) as any[];
      const all = rows.map(normalize);

      // 与主页面保持一致：进行中 或 已完成但父任务仍进行中的子任务
      const parentActive = (parentId?: string | null) => {
        if (!parentId) return false;
        const p = all.find((t) => t.id === parentId);
        return p?.status === 'active';
      };
      const activeIds = new Set(
        all
          .filter(
            (t) =>
              t.status === 'active' ||
              (t.parentId && t.status === 'completed' && parentActive(t.parentId))
          )
          .map((t) => t.id)
      );
      const active = all.filter((t) => activeIds.has(t.id)).sort(sortTasks);

      setTasks(active);
      setMsg(active.length ? '' : '暂无进行中的任务');
    } catch (e: any) {
      setMsg(`加载失败：${e.message}`);
    }
  }, []);

  const toggle = useCallback(async (t: WidgetTask) => {
    if (!electronAPI) return;
    const nextStatus = t.status === 'completed' ? 'active' : 'completed';
    const patch = {
      status: nextStatus,
      current: nextStatus === 'completed' ? t.total : 0,
    };
    const res = await electronAPI.updateTask?.(t.id, patch);
    if (res && !res.ok) {
      setMsg(`更新失败：${res.error || '未知错误'}`);
      return;
    }
    await load();
  }, [load]);

  return { tasks, msg, load, toggle };
}

function TreeRow({
  task,
  tasks,
  depth,
  onToggle,
}: {
  task: WidgetTask;
  tasks: WidgetTask[];
  depth: number;
  onToggle: (t: WidgetTask) => void;
}) {
  const meta = priorityById(task.priority);
  const done = task.status === 'completed';
  const kids = tasks.filter((t) => t.parentId === task.id);
  const doneSteps = task.steps.filter((s) => s.done).length;
  return (
    <>
      <div className={`widget-row ${depth > 0 ? 'sub' : ''}`} style={{ marginLeft: depth * 14 }}>
        <button
          className={`w-check ${done ? 'on' : ''}`}
          onClick={() => onToggle(task)}
          title={done ? '标记为未完成' : '点击完成'}
        />
        <span className="w-flag" style={{ background: meta?.color ?? 'transparent' }} />
        {meta && (
          <span className="w-prio" style={{ color: meta.color, borderColor: meta.color }}>
            {meta.label}
          </span>
        )}
        <span className={`w-title ${done ? 'done' : ''}`}>{task.title}</span>
        {task.steps.length > 0 && (
          <span className="w-steps">
            {doneSteps}/{task.steps.length}
          </span>
        )}
      </div>
      {task.note && <div className="w-note">{task.note}</div>}
      {kids.map((c) => (
        <TreeRow key={c.id} task={c} tasks={tasks} depth={depth + 1} onToggle={onToggle} />
      ))}
    </>
  );
}

export function WidgetApp() {
  const { tasks, msg, load, toggle } = useWidgetTasks();
  const [opacity, setOpacity] = useState(() => {
    const v = parseFloat(localStorage.getItem(OP_KEY) || '');
    return isNaN(v) ? 0.82 : v;
  });

  useEffect(() => {
    document.body.classList.add('widget-mode');
    load();
    const id = setInterval(load, 15000);
    // 订阅主窗口任务变更广播：主窗口改了任务，小组件立即同步
    const off = electronAPI?.onTasksChanged?.(load);
    return () => {
      clearInterval(id);
      off?.();
    };
  }, [load]);

  const tops = useMemo(
    () =>
      tasks.filter(
        (t) => !t.parentId || !tasks.some((x) => x.id === t.parentId)
      ),
    [tasks]
  );

  const changeOpacity = (v: number) => {
    setOpacity(v);
    localStorage.setItem(OP_KEY, String(v));
  };

  return (
    <div className="widget" style={{ ['--w-op']: opacity } as any}>
      <div className="widget-head">
        <span className="widget-grip" title="拖动此处移动小组件">
          ⠿
        </span>
        <span className="widget-title">🐮🐴 进行中</span>
        <button className="widget-close" onClick={() => electronAPI?.closeWidget?.()} title="关闭小组件">
          ✕
        </button>
      </div>
      <div className="widget-list">
        {msg && !tasks.length && <div className="widget-msg">{msg}</div>}
        {tops.map((t) => (
          <TreeRow key={t.id} task={t} tasks={tasks} depth={0} onToggle={toggle} />
        ))}
      </div>
      <div className="widget-foot">
        <span className="w-op-label">小组件透明度</span>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => changeOpacity(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
