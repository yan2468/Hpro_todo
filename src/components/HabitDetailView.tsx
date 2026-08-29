import { useEffect, useMemo, useState } from 'react';
import { useHabitStore } from '../store/habitsStore';
import { Confetti } from './Confetti';
import { HabitForm } from './HabitForm';
import { HabitTrendChart } from './HabitTrendChart';
import type { Habit } from '../types';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function HabitDetailView({
  habit,
  onBack,
}: {
  habit: Habit;
  onBack: () => void;
}) {
  const store = useHabitStore();
  const [month, setMonth] = useState(() => new Date());
  const [editing, setEditing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const year = month.getFullYear();
  const m = month.getMonth();
  const monthStart = ymd(new Date(year, m, 1));
  const monthEnd = ymd(new Date(year, m + 1, 0));
  const today = ymd(new Date());

  const getCheckins = store.getCheckins;
  useEffect(() => {
    getCheckins(habit.id, monthStart, monthEnd);
  }, [habit.id, monthStart, monthEnd, getCheckins]);

  // 趋势图数据：获取最近一年的打卡记录
  useEffect(() => {
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    getCheckins(habit.id, ymd(yearAgo), ymd(now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habit.id]);

  // 回到前台时刷新当月打卡，避免后台通过小组件打卡后详情页状态滞后
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === 'visible') getCheckins(habit.id, monthStart, monthEnd);
    };
    document.addEventListener('visibilitychange', reload);
    return () => document.removeEventListener('visibilitychange', reload);
  }, [habit.id, monthStart, monthEnd, getCheckins]);

  const checkins = store.checkins[habit.id] ?? [];
  const checkedSet = useMemo(() => new Set(checkins.map((c) => c.checkDate)), [checkins]);

  const stats =
    store.stats[habit.id] ??
    ({ habitId: habit.id, total: 0, currentStreak: 0, monthlyCount: 0, monthlyRate: 0 } as const);

  // 月历网格：补齐到 7 的倍数
  const firstDay = new Date(year, m, 1).getDay(); // 0..6（周日=0）
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: ({ day: number; date: string } | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: ymd(new Date(year, m, d)) });
  while (cells.length % 7 !== 0) cells.push(null);

  const isBeforeStart = (date: string) => date < habit.startDate;

  const toggleDay = async (date: string) => {
    if (isBeforeStart(date)) return;
    if (checkedSet.has(date)) {
      await store.uncheckIn(habit.id, date);
    } else {
      await store.checkIn(habit.id, date);
      if (date === today) {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2600);
      }
    }
  };

  const checkedToday = checkedSet.has(today);
  const logs = [...checkins].sort((a, b) => (a.checkDate < b.checkDate ? 1 : -1));

  return (
    <div className="habit-detail">
      <div className="habit-detail-head">
        <button className="habit-back-btn" onClick={onBack} aria-label="返回">
          ←
        </button>
        <div className="habit-detail-title" style={{ color: habit.color }}>
          {habit.icon} {habit.title}
        </div>
        <div className="habit-detail-ops">
          <button className="icon-btn" title="编辑" onClick={() => setEditing(true)}>
            ✎
          </button>
          <button
            className="icon-btn danger"
            title="删除"
            onClick={async () => {
              if (window.confirm(`确定删除习惯「${habit.title}」吗？删除后打卡记录一并清除。`)) {
                await store.removeHabit(habit.id);
                onBack();
              }
            }}
          >
            🗑
          </button>
        </div>
      </div>

      <div className="habit-stats">
        <div className="habit-stat">
          <div className="habit-stat-val">{stats.monthlyCount}</div>
          <div className="habit-stat-label">本月打卡</div>
        </div>
        <div className="habit-stat">
          <div className="habit-stat-val">{stats.total}</div>
          <div className="habit-stat-label">累计打卡</div>
        </div>
        <div className="habit-stat">
          <div className="habit-stat-val">{Math.round(stats.monthlyRate * 100)}%</div>
          <div className="habit-stat-label">月完成率</div>
        </div>
        <div className="habit-stat">
          <div className="habit-stat-val">{stats.currentStreak}</div>
          <div className="habit-stat-label">当前连续(天)</div>
        </div>
      </div>

      <div className="habit-cal">
        <div className="habit-cal-head">
          <button className="cal-arrow" onClick={() => setMonth(new Date(year, m - 1, 1))}>
            ‹
          </button>
          <span className="cal-title">
            {year}年{m + 1}月
          </span>
          <button className="cal-arrow" onClick={() => setMonth(new Date(year, m + 1, 1))}>
            ›
          </button>
        </div>
        <div className="habit-cal-week">
          {WEEKDAYS.map((w) => (
            <div key={w} className="habit-cal-wd">
              {w}
            </div>
          ))}
        </div>
        <div className="habit-cal-grid">
          {cells.map((c, i) => {
            if (!c) return <div key={i} className="habit-day empty" />;
            const checked = checkedSet.has(c.date);
            const isToday = c.date === today;
            const future = c.date > today;
            const muted = isBeforeStart(c.date) || future;
            return (
              <button
                key={i}
                className={`habit-day ${checked ? 'checked' : ''} ${isToday ? 'today' : ''} ${
                  muted ? 'muted' : ''
                }`}
                onClick={() => toggleDay(c.date)}
                disabled={isBeforeStart(c.date)}
                title={c.date}
              >
                <span>{c.day}</span>
              </button>
            );
          })}
        </div>
      </div>

      <HabitTrendChart checkins={checkins} color={habit.color} />

      <div className="habit-log">
        <div className="habit-log-title">当月打卡日志（{checkins.length} 天）</div>
        {checkins.length === 0 ? (
          <div className="habit-log-empty">本月还没有打卡记录</div>
        ) : (
          <div className="habit-log-list">
            {logs.map((c) => (
              <span
                key={c.id}
                className="habit-log-chip"
                style={{ borderColor: habit.color, color: habit.color }}
                onClick={() => toggleDay(c.checkDate)}
                title="点击取消该日打卡"
              >
                {c.checkDate.slice(5)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="habit-actions">
        <button
          className={`btn ${checkedToday ? 'secondary' : 'primary'}`}
          onClick={() => toggleDay(today)}
        >
          {checkedToday ? '取消今日打卡' : '今日打卡'}
        </button>
      </div>

      <Confetti active={celebrate} />

      {editing && (
        <HabitForm
          initial={habit}
          onSubmit={async (data) => {
            try {
              await store.updateHabit(habit.id, data);
              setEditing(false);
            } catch (e: any) {
              alert(`保存失败：${e.message}`);
            }
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
