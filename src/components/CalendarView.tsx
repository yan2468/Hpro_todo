import { useMemo, useState } from 'react';
import { type Task, categoryColor, categoryLabel } from '../types';

type CalMode = 'month' | 'week' | 'day' | 'agenda';

// 任务落点日期：优先提醒时间，否则创建时间
function taskDate(t: Task): Date {
  const raw = t.reminderAt ? new Date(t.reminderAt) : new Date(t.createdAt);
  return isNaN(raw.getTime()) ? new Date(t.createdAt) : raw;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']; // 周一开头

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// 周一为一周起点
function mondayOf(d: Date): Date {
  const diff = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -diff);
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function monthTitle(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
function dayTitle(d: Date): string {
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${w}`;
}

export function CalendarView({
  tasks,
  onOpenTask,
  onAddTask,
}: {
  tasks: Task[];
  onOpenTask: (t: Task) => void;
  onAddTask: () => void;
}) {
  const [mode, setMode] = useState<CalMode>('month');
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const today = useMemo(() => startOfDay(new Date()), []);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const d = taskDate(t);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const tasksOn = (d: Date): Task[] =>
    byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];

  // 月视图：固定 6 周网格
  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  // 周视图：7 天
  const weekCells = useMemo(() => {
    const m = mondayOf(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(m, i));
  }, [cursor]);

  // 日程视图：按日期分组
  const agendaGroups = useMemo(() => {
    const groups: { date: Date; items: Task[] }[] = [];
    const sorted = [...tasks].sort(
      (a, b) => taskDate(a).getTime() - taskDate(b).getTime()
    );
    for (const t of sorted) {
      const d = taskDate(t);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      let g = groups.find((x) => `${x.date.getFullYear()}-${x.date.getMonth()}-${x.date.getDate()}` === key);
      if (!g) {
        g = { date: d, items: [] };
        groups.push(g);
      }
      g.items.push(t);
    }
    return groups;
  }, [tasks]);

  const step = (delta: number) => {
    if (mode === 'month') {
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
    } else if (mode === 'week') {
      setCursor((c) => addDays(c, delta * 7));
    } else if (mode === 'day') {
      setCursor((c) => addDays(c, delta));
    } else {
      setCursor((c) => addDays(c, delta * 7)); // agenda 按周翻
    }
  };

  const title =
    mode === 'month'
      ? monthTitle(cursor)
      : mode === 'week'
      ? `${weekCells[0].getMonth() + 1}月${weekCells[0].getDate()}日 - ${weekCells[6].getMonth() + 1}月${weekCells[6].getDate()}日`
      : mode === 'day'
      ? dayTitle(cursor)
      : '日程';

  return (
    <div className="cal">
      {/* 工具栏 */}
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="cal-arrow" onClick={() => step(-1)} aria-label="上一个">
            ‹
          </button>
          <span className="cal-title">{title}</span>
          <button className="cal-arrow" onClick={() => step(1)} aria-label="下一个">
            ›
          </button>
          <button className="cal-today" onClick={() => setCursor(startOfDay(new Date()))}>
            今天
          </button>
        </div>
        <div className="cal-modes">
          {(['month', 'week', 'day', 'agenda'] as CalMode[]).map((m) => (
            <button
              key={m}
              className={`cal-mode ${mode === m ? 'on' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'month' ? '月' : m === 'week' ? '周' : m === 'day' ? '日' : '日程'}
            </button>
          ))}
        </div>
      </div>

      {/* 月视图 */}
      {mode === 'month' && (
        <div className="cal-month">
          <div className="cal-weekheads">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-weekhead">
                {w}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {monthCells.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const items = tasksOn(d);
              return (
                <div
                  key={i}
                  className={`cal-cell ${inMonth ? '' : 'out'} ${sameDay(d, today) ? 'today' : ''}`}
                  onClick={() => {
                    setCursor(d);
                    setMode('day');
                  }}
                >
                  <div className="cal-cellnum">{d.getDate()}</div>
                  <div className="cal-chips">
                    {items.slice(0, 3).map((t) => (
                      <TaskChip key={t.id} t={t} onClick={() => onOpenTask(t)} />
                    ))}
                    {items.length > 3 && <div className="cal-more">+{items.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 周视图 */}
      {mode === 'week' && (
        <div className="cal-week">
          {weekCells.map((d) => {
            const items = tasksOn(d);
            return (
              <div
                key={d.toISOString()}
                className={`cal-daycol ${sameDay(d, today) ? 'today' : ''}`}
                onClick={() => {
                  setCursor(d);
                  setMode('day');
                }}
              >
                <div className="cal-dayhead">
                  <span className="cal-dh-w">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                  <span className="cal-dh-d">{d.getMonth() + 1}/{d.getDate()}</span>
                </div>
                <div className="cal-chips">
                  {items.map((t) => (
                    <TaskChip key={t.id} t={t} onClick={() => onOpenTask(t)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 日视图 */}
      {mode === 'day' && (
        <div className="cal-dayview">
          <div className="cal-dayview-head">{dayTitle(cursor)}</div>
          <DayList
            items={tasksOn(cursor)}
            onOpenTask={onOpenTask}
            onAddTask={onAddTask}
            emptyText="这一天还没有任务，点右下角 + 添加吧！"
          />
        </div>
      )}

      {/* 日程视图 */}
      {mode === 'agenda' && (
        <div className="cal-agenda">
          {agendaGroups.length === 0 && <div className="cal-empty">还没有任何任务，先添加一个吧～</div>}
          {agendaGroups.map((g) => (
            <div key={g.date.toISOString()} className="cal-agenda-group">
              <div className="cal-agenda-date">
                {dayTitle(g.date)}
                <span className="cal-agenda-count">{g.items.length}</span>
              </div>
              <DayList items={g.items} onOpenTask={onOpenTask} onAddTask={onAddTask} emptyText="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskChip({ t, onClick }: { t: Task; onClick: () => void }) {
  const color = categoryColor(t.category);
  return (
    <div
      className={`cal-chip ${t.status === 'completed' ? 'done' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={t.title}
    >
      <span className="cal-chip-title">{t.title}</span>
    </div>
  );
}

function DayList({
  items,
  onOpenTask,
  onAddTask,
  emptyText,
}: {
  items: Task[];
  onOpenTask: (t: Task) => void;
  onAddTask: () => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <div className="cal-empty">{emptyText}</div>;
  }
  return (
    <div className="cal-daylist">
      {items.map((t) => {
        const color = categoryColor(t.category);
        return (
          <button
            key={t.id}
            className={`cal-row ${t.status === 'completed' ? 'done' : ''}`}
            onClick={() => onOpenTask(t)}
          >
            <span className="cal-row-dot" style={{ background: color }} />
            <span className="cal-row-cat">{categoryLabel(t.category)}</span>
            <span className="cal-row-title">{t.title}</span>
          </button>
        );
      })}
      <button className="cal-row-add" onClick={onAddTask}>
        ＋ 添加任务
      </button>
    </div>
  );
}
