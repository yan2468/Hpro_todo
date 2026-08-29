import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { TitleBar } from './components/TitleBar';
import { CategoryBar } from './components/CategoryBar';
import { TaskOutline } from './components/TaskOutline';
import { TaskForm, type TaskFormData } from './components/TaskForm';
import { FloatingButton } from './components/FloatingButton';
import { LoginView } from './components/LoginView';
import { SettingsModal } from './components/SettingsModal';
import { ServerConfigModal } from './components/ServerConfigModal';
import { TasksProvider, useTaskStore } from './store/taskStore';
import { ReportsProvider, useReportStore } from './store/reportsStore';
import { HabitsProvider } from './store/habitsStore';
import { ReportsView } from './components/ReportsView';
import { HabitListView } from './components/HabitListView';
import { type CategoryId, type Task, priorityOrder } from './types';
import { scheduleReminder, cancelReminder } from './lib/notifications';
import { getAIConfig } from './lib/aiConfig';
import { generateAndSaveWeekly, weeklyDailies, weekRange } from './lib/aiReport';
import { ConfirmDialog } from './components/ConfirmDialog';
import { CloseConfirmModal } from './components/CloseConfirmModal';
import { ReminderPicker } from './components/ReminderPicker';
import { ReminderPopup } from './components/ReminderPopup';
import { CalendarView } from './components/CalendarView';
import { CostView } from './components/CostView';
import { Splash } from './components/Splash';
import { isMobileView } from './lib/platform';
import { applyTheme } from './lib/theme';
import { getBase } from './lib/api';
import { Capacitor } from '@capacitor/core';
import { loadSettingsFromServer } from './lib/settingsSync';

const electronAPI = (window as any).electronAPI;

function Shell({ onOpenSettings }: { onOpenSettings: () => void }) {
  const store = useTaskStore();
  const { refresh } = store;
  const reportStore = useReportStore();
  const [cat, setCat] = useState<CategoryId | 'all'>('all');
  const [view, setView] = useState<'active' | 'history' | 'reports' | 'calendar' | 'habits' | 'cost'>(
    'active'
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [formParent, setFormParent] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  // 移动端应用内提醒弹窗（双通道之一：系统通知之外，App 打开时准时弹出）
  const [inAppReminder, setInAppReminder] = useState<{ title: string; id: string | null } | null>(null);
  const firedReminderIds = useRef(new Set<string>());

  // 子任务点完成后仍留在「进行中」，等父任务完成后再一起移入历史
  const parentActive = (parentId?: string | null) => {
    if (!parentId) return false;
    const p = store.tasks.find((t) => t.id === parentId);
    return p?.status === 'active';
  };
  const activeTasks = store.tasks.filter(
    (t) =>
      t.status === 'active' ||
      (t.parentId && t.status === 'completed' && parentActive(t.parentId))
  );
  const activeIds = new Set(activeTasks.map((t) => t.id));
  const historyTasks = store.tasks.filter((t) => !activeIds.has(t.id));

  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    activeTasks.forEach((t) => {
      if (t.category) map[t.category] = (map[t.category] || 0) + 1;
    });
    return map;
  }, [activeTasks]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggle = async (t: Task) => {
    const nextCompleted = t.status !== 'completed';
    await store.updateTask(t.id, {
      status: nextCompleted ? 'completed' : 'active',
      current: nextCompleted ? t.total : 0,
    });
    // 任务完成后取消对应提醒，避免到期仍弹窗
    if (nextCompleted) {
      cancelReminder(t.id);
      scheduledReminderIds.current.delete(t.id);
    }
  };
  const remove = (t: Task) => setPendingDelete(t);
  const confirmDelete = () => {
    if (pendingDelete) {
      store.remove(pendingDelete.id);
      cancelReminder(pendingDelete.id);
      scheduledReminderIds.current.delete(pendingDelete.id);
    }
    setPendingDelete(null);
  };
  const editTask = (t: Task) => {
    setEditing(t);
    setFormParent(null);
    setFormOpen(true);
  };
  const addSub = (t: Task) => {
    setFormParent(t);
    setEditing(null);
    setFormOpen(true);
  };
  const openReminderPicker = (t: Task) => setReminderTask(t);
  const saveReminder = async (reminderAt: string | null) => {
    if (!reminderTask) return;
    await store.updateTask(reminderTask.id, { reminderAt });
    if (reminderAt) {
      scheduleReminder(reminderTask.title, new Date(reminderAt), reminderTask.id);
      scheduledReminderIds.current.add(reminderTask.id);
    } else {
      cancelReminder(reminderTask.id);
      scheduledReminderIds.current.delete(reminderTask.id);
    }
    setReminderTask(null);
  };
  const toggleStep = (taskId: string, index: number) => {
    const t = store.tasks.find((x) => x.id === taskId);
    if (!t || !t.steps) return;
    const steps = t.steps.map((s, i) => (i === index ? { ...s, done: !s.done } : s));
    const current = steps.filter((s) => s.done).length;
    store.updateTask(taskId, { steps, current });
  };

  // 任务卡片拖拽：同级内重排 / 变换父子关系（标签等字段保持不变）
  const reorderTask = async ({
    sourceId,
    targetId,
    position,
  }: {
    sourceId: string;
    targetId: string;
    position: 'before' | 'after' | 'child';
  }) => {
    const source = store.tasks.find((t) => t.id === sourceId);
    if (!source) return;
    const target = targetId ? store.tasks.find((t) => t.id === targetId) : null;

    // 归一化优先级比较：undefined / null 视为同一无优先级组
    const samePriority = (a?: string | null, b?: string | null) => priorityOrder(a) === priorityOrder(b);

    // 防止成环：不能把祖先拖成自己的后代
    const isDescendant = (parentId: string, childId: string): boolean => {
      if (parentId === childId) return true;
      return store.tasks
        .filter((t) => t.parentId === childId)
        .some((c) => isDescendant(parentId, c.id));
    };

    // 拖到目标中间 = 变为其子任务（保留源任务自身优先级，排到该父级末尾）
    if (target && position === 'child') {
      if (isDescendant(target.id, source.id)) return;
      const siblings = sortByPriority(
        store.tasks.filter((t) => (t.parentId ?? null) === target.id && t.id !== sourceId)
      );
      const order = siblings.length ? Math.max(...siblings.map((t) => t.sortOrder ?? 0)) + 1000 : 1000;
      await store.updateTask(sourceId, { parentId: target.id, sortOrder: order }, { skipNotify: true });
      setExpanded((prev) => new Set(prev).add(target.id));
      electronAPI?.notifyTaskChanged?.();
      return;
    }

    // 空白处放下：不改变父级，直接放到源任务「同父级 + 同优先级」组的末尾
    if (!target) {
      const siblings = sortByPriority(
        store.tasks.filter(
          (t) =>
            (t.parentId ?? null) === (source.parentId ?? null) &&
            samePriority(t.priority, source.priority) &&
            t.id !== sourceId
        )
      );
      const order = siblings.length ? Math.max(...siblings.map((t) => t.sortOrder ?? 0)) + 1000 : 1000;
      await store.updateTask(
        sourceId,
        { parentId: source.parentId ?? null, sortOrder: order },
        { skipNotify: true }
      );
      electronAPI?.notifyTaskChanged?.();
      return;
    }

    // before / after：只与「同父级 + 同优先级」的兄弟重排，避免跨父级/跨优先级视觉上「弹回」
    const sameParent = (source.parentId ?? null) === (target.parentId ?? null);
    if (!sameParent || !samePriority(source.priority, target.priority)) return;

    const siblings = sortByPriority(
      store.tasks.filter(
        (t) =>
          (t.parentId ?? null) === (source.parentId ?? null) &&
          samePriority(t.priority, source.priority) &&
          t.id !== sourceId
      )
    );

    const targetIndex = siblings.findIndex((t) => t.id === target.id);
    if (targetIndex === -1) return;
    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    const reordered = [...siblings];
    reordered.splice(insertIndex, 0, source);

    // 重新分配 sortOrder，使用 (i+1)*1000 的固定步长，避免与历史值冲突
    const updates: { id: string; patch: Partial<Task> }[] = [];
    for (let i = 0; i < reordered.length; i++) {
      const t = reordered[i];
      const order = (i + 1) * 1000;
      if (t.id === sourceId) {
        updates.push({ id: sourceId, patch: { parentId: source.parentId ?? null, sortOrder: order } });
      } else if ((t.sortOrder ?? 0) !== order) {
        updates.push({ id: t.id, patch: { sortOrder: order } });
      }
    }
    // 串行更新（skipNotify 避免中间状态触发多次刷新导致闪回）
    for (const u of updates) {
      await store.updateTask(u.id, u.patch, { skipNotify: true });
    }
    electronAPI?.notifyTaskChanged?.();
  };

  // 本地排序辅助：先优先级（用 order 权重），再 sort_order（同父级/同优先级内的拖拽顺序），再创建时间
  function sortByPriority(tasks: Task[]) {
    return [...tasks].sort((a, b) => {
      const d = priorityOrder(a.priority) - priorityOrder(b.priority);
      if (d !== 0) return d;
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  }

  const submitForm = async (data: TaskFormData) => {
    if (editing) {
      await store.updateTask(editing.id, data);
      // 编辑时若修改/清除了提醒时间，同步更新主进程提醒器
      if (data.reminderAt) {
        scheduleReminder(data.title, new Date(data.reminderAt), editing.id);
        scheduledReminderIds.current.add(editing.id);
      } else {
        cancelReminder(editing.id);
        scheduledReminderIds.current.delete(editing.id);
      }
    } else {
      const created = await store.addTask({ ...data, status: 'active', current: 0 });
      if (data.reminderAt) {
        scheduleReminder(data.title, new Date(data.reminderAt), created.id);
        scheduledReminderIds.current.add(created.id);
      }
      // 新建子任务后自动展开父任务，让用户立刻看到联动效果
      if (data.parentId) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(data.parentId as string);
          return next;
        });
      }
    }
    setFormOpen(false);
    setEditing(null);
    setFormParent(null);
  };

  // 表单归属：编辑子任务时沿用其原父任务；新建子任务时用当前 formParent
  const parentOfForm = editing?.parentId
    ? store.tasks.find((t) => t.id === editing.parentId) ?? null
    : formParent;

  // 应用启动后，把已有进行中任务的提醒一次性注册到主进程（避免重启后漏提醒）
  const scheduledReminderIds = useRef(new Set<string>());
  useEffect(() => {
    if (!electronAPI?.scheduleReminder) return;
    activeTasks.forEach((t) => {
      if (!t.reminderAt || scheduledReminderIds.current.has(t.id)) return;
      const when = new Date(t.reminderAt);
      if (when.getTime() > Date.now()) {
        scheduledReminderIds.current.add(t.id);
        scheduleReminder(t.title, when, t.id);
      }
    });
  }, [activeTasks]);

  // 订阅跨窗口任务变更广播：小组件（或本窗口其他操作）改动任务后，立即刷新主窗口
  useEffect(() => {
    const off = electronAPI?.onTasksChanged?.(() => refresh());
    return () => off?.();
  }, [refresh]);

  // 移动端应用内提醒：轮询进行中任务，到点准时弹出（与系统通知形成双通道）
  useEffect(() => {
    if (!isMobileView()) return; // 仅移动端启用应用内弹窗通道
    const check = () => {
      if (inAppReminder) return; // 一次只弹一个，关掉后再检查下一个
      const now = Date.now();
      for (const t of activeTasks) {
        if (!t.reminderAt || t.status === 'completed') continue;
        if (firedReminderIds.current.has(t.id)) continue;
        const when = new Date(t.reminderAt).getTime();
        // 仅在「到点前后 2 分钟内」触发，避免打开 App 时把过期提醒全弹出来
        if (when <= now && now - when <= 2 * 60 * 1000) {
          firedReminderIds.current.add(t.id);
          setInAppReminder({ title: t.title, id: t.id });
          break;
        }
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [activeTasks, inAppReminder]);

  // AI 周报自动生成：按设置中心配置的时间，在应用开启且到点时自动生成（本周已存在则跳过）
  const tasksRef = useRef(store.tasks);
  const reportsRef = useRef(reportStore.reports);
  tasksRef.current = store.tasks;
  reportsRef.current = reportStore.reports;

  // 判断当前时刻是否满足定时触发条件（时间 + 周期 + 本周日报≥5）
  const shouldTriggerTimed = (cfg: ReturnType<typeof getAIConfig>, now: Date): boolean => {
    if (cfg.genMode !== 'timed') return false;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm !== cfg.genTime) return false;
    if (cfg.genFrequency === 'weekly') {
      const target = ((cfg.genWeekday % 7) + 7) % 7;
      if (now.getDay() !== target) return false;
    }
    // custom 模式依赖 genLastAt 计算，前端不做复杂判断，到点即尝试（后端/aiReport 会再次校验）
    const dailies = weeklyDailies(reportsRef.current, now);
    if (dailies.length < 5) return false;
    return true;
  };

  // ① 定时触发：每 30 秒检查一次，到配置时间且满足条件时生成
  useEffect(() => {
    const timer = setInterval(() => {
      const cfg = getAIConfig();
      if (!cfg.enabled) return;
      const now = new Date();
      if (!shouldTriggerTimed(cfg, now)) return;
      generateAndSaveWeekly(cfg, tasksRef.current, reportsRef.current, reportStore.addReport).catch(
        () => {}
      );
    }, 30_000);
    return () => clearInterval(timer);
  }, [reportStore]);

  // ② 事件触发：本周日报数量达到 5 条时立即生成（每个自然周只触发一次）
  const eventTriggeredWeekRef = useRef('');
  useEffect(() => {
    const cfg = getAIConfig();
    if (!cfg.enabled || cfg.genMode !== 'event') return;
    const now = new Date();
    const { startStr } = weekRange(now);
    // 跨周后重置，允许新的一周再次事件触发
    if (eventTriggeredWeekRef.current !== startStr) {
      const dailies = weeklyDailies(reportStore.reports, now);
      if (dailies.length >= 5) {
        eventTriggeredWeekRef.current = startStr;
        generateAndSaveWeekly(cfg, tasksRef.current, reportStore.reports, reportStore.addReport).catch(
          () => {}
        );
      }
    }
  }, [reportStore.reports]);

  const openWidget = () => electronAPI?.openWidget?.();

  return (
    <div className="app">
      <Header
        onSettings={onOpenSettings}
        onWidget={electronAPI ? openWidget : undefined}
      />
      {view !== 'reports' && view !== 'calendar' && view !== 'habits' && view !== 'cost' && (
        <CategoryBar active={cat} counts={catCounts} onPick={setCat} />
      )}
      {view === 'reports' ? (
        <ReportsView />
      ) : view === 'calendar' ? (
        <CalendarView
          tasks={store.tasks}
          onOpenTask={(t) => editTask(t)}
          onAddTask={() => {
            setEditing(null);
            setFormParent(null);
            setFormOpen(true);
          }}
        />
      ) : view === 'habits' ? (
        <HabitListView />
      ) : view === 'cost' ? (
        <CostView />
      ) : view === 'active' ? (
        <TaskOutline
          tasks={activeTasks}
          catFilter={cat}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onToggle={toggle}
          onDelete={remove}
          onEdit={editTask}
          onAddSub={addSub}
          onSetReminder={openReminderPicker}
          onToggleStep={toggleStep}
          onReorder={reorderTask}
          emptyText="暂无任务，点右下角 + 添加一个吧！"
        />
      ) : (
        <>
          <div className="list-summary">共 {historyTasks.length} 条历史记录</div>
          <TaskOutline
            tasks={historyTasks}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onToggle={toggle}
            onDelete={remove}
            onEdit={editTask}
            onAddSub={addSub}
            onSetReminder={openReminderPicker}
            onToggleStep={toggleStep}
            onReorder={reorderTask}
            emptyText="还没有已完成或延期的任务"
          />
        </>
      )}
      {view === 'active' && (
        <FloatingButton
          onClick={() => {
            setEditing(null);
            setFormParent(null);
            setFormOpen(true);
          }}
        />
      )}
      <nav className="bottom-tabs" aria-label="主导航">
        <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>
          <span className="tab-icon">📝</span>
          <span className="tab-label">进行中</span>
          <span className="tab-count">{activeTasks.length}</span>
        </button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
          <span className="tab-icon">📦</span>
          <span className="tab-label">历史</span>
        </button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>
          <span className="tab-icon">📅</span>
          <span className="tab-label">日历</span>
        </button>
        <button className={view === 'habits' ? 'active' : ''} onClick={() => setView('habits')}>
          <span className="tab-icon">🔥</span>
          <span className="tab-label">习惯</span>
        </button>
        <button className={view === 'cost' ? 'active' : ''} onClick={() => setView('cost')}>
          <span className="tab-icon">💰</span>
          <span className="tab-label">成本</span>
        </button>
        <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
          <span className="tab-icon">📊</span>
          <span className="tab-label">报告</span>
        </button>
      </nav>
      {formOpen && (
        <TaskForm
          initial={editing}
          parentId={parentOfForm?.id ?? null}
          tasks={store.tasks}
          onSubmit={submitForm}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setFormParent(null);
          }}
        />
      )}
      {reminderTask && (
        <ReminderPicker
          task={reminderTask}
          onSave={saveReminder}
          onClose={() => setReminderTask(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除任务？"
        message={
          pendingDelete
            ? `确定要删除「${pendingDelete.title}」吗？删除后不可恢复哦～`
            : ''
        }
        confirmText="删除"
        cancelText="再想想"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {inAppReminder && (
        <ReminderPopup
          title={inAppReminder.title}
          id={inAppReminder.id}
          inApp
          onClose={() => setInAppReminder(null)}
          onSnooze={(taskId, when) => {
            // 更新任务的 reminderAt，让应用内轮询能在延期时间到时再次触发
            store.updateTask(taskId, { reminderAt: when.toISOString() });
            // 清除已触发标记，这样轮询会重新检测这个任务
            firedReminderIds.current.delete(taskId);
            // 同步清除桌面端的已调度标记
            scheduledReminderIds.current.delete(taskId);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('dd_token'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // 应用已保存的主题（浅色 / 深色），保证刷新后保持一致
  useEffect(() => {
    applyTheme();
  }, []);

  // 把登录态（后端地址 + token）同步给主进程 / 移动端原生，供桌面小组件独立拉取数据
  useEffect(() => {
    if (!authed) return;
    const auth = {
      token: localStorage.getItem('dd_token'),
      // 与 App 实际请求地址保持一致（默认 ECS 公网，非 localhost）
      base: getBase(),
    };
    if (electronAPI) {
      electronAPI.setAuth?.(auth);
    }
    // 移动端：把凭证落地到原生 SharedPreferences，供 Android 桌面习惯小组件读取
    if (Capacitor.isNativePlatform()) {
      try {
        (Capacitor as any).Plugins?.AuthBridge?.setAuth?.(auth);
      } catch {}
    }
    // 登录后从服务端拉取设置，实现多端设置同步
    loadSettingsFromServer().catch(() => {});
  }, [authed]);

  const logout = () => {
    localStorage.removeItem('dd_token');
    electronAPI?.closeWidget?.();
    if (Capacitor.isNativePlatform()) {
      try {
        (Capacitor as any).Plugins?.AuthBridge?.clearAuth?.();
      } catch {}
    }
    setSettingsOpen(false);
    setAuthed(false);
  };

  // ===== 关闭行为：最小化到后台 / 直接关闭（含“记住选择”）=====
  const doCloseAction = (action: 'minimize' | 'quit') => {
    if (!electronAPI) return;
    if (action === 'minimize') electronAPI.window?.hide?.();
    else electronAPI.window?.forceClose?.();
  };
  // 主进程拦截到关闭请求时回调：若已“记住选择”则直接执行，否则弹确认框
  const handleAppClose = async () => {
    const pref = (await electronAPI?.getClosePref?.()) as
      | { remember: boolean; action: 'minimize' | 'quit' | null }
      | undefined;
    if (pref?.remember && (pref.action === 'minimize' || pref.action === 'quit')) {
      doCloseAction(pref.action);
      return;
    }
    setCloseConfirmOpen(true);
  };
  const onChooseClose = async (action: 'minimize' | 'quit', remember: boolean) => {
    if (remember) {
      try {
        await electronAPI?.setClosePref?.({ remember: true, action });
      } catch {
        /* ignore */
      }
    }
    setCloseConfirmOpen(false);
    doCloseAction(action);
  };
  // 注册主进程的关闭请求回调（×按钮 / Alt+F4 / 任务栏关闭统一汇聚）
  useEffect(() => {
    const off = electronAPI?.window?.onRequestClose?.(handleAppClose);
    return () => off?.();
  }, [handleAppClose]);

  const inner = !authed ? (
    <>
      <LoginView onAuth={() => setAuthed(true)} onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <ServerConfigModal onClose={() => setSettingsOpen(false)} />
      )}
    </>
  ) : (
    <TasksProvider>
      <ReportsProvider>
        <HabitsProvider>
          <Shell onOpenSettings={() => setSettingsOpen(true)} />
        </HabitsProvider>
        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} onLogout={logout} />
        )}
      </ReportsProvider>
    </TasksProvider>
  );

  // 启动页：所有 Hook 已无条件声明，此处再决定是否展示启动动画，
  // 避免「首屏渲染调用 3 个 Hook、启动结束后渲染调用 5 个 Hook」导致的
  // “Rendered more hooks than during the previous render” 崩溃（白屏根因）。
  if (!splashDone) {
    return <Splash onReady={() => setSplashDone(true)} />;
  }

  return (
    <>
      <TitleBar />
      {inner}
      <CloseConfirmModal
        open={closeConfirmOpen}
        onCancel={() => setCloseConfirmOpen(false)}
        onChoose={onChooseClose}
      />
    </>
  );
}
