import { useEffect, useState } from 'react';
import { useHabitStore } from '../store/habitsStore';
import { Confetti } from './Confetti';
import { HabitDetailView } from './HabitDetailView';
import { HabitForm } from './HabitForm';
import type { Habit } from '../types';
import { scheduleReminder } from '../lib/notifications';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function HabitListView() {
  const store = useHabitStore();
  const [selected, setSelected] = useState<Habit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const today = todayStr();

  // 载入今日打卡状态，用于列表“已打卡 ✓”标识；依赖习惯 id 列表
  const idsKey = store.habits.map((h) => h.id).join(',');
  useEffect(() => {
    if (!idsKey) return;
    store.habits.forEach((h) => store.getCheckins(h.id, today, today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // 回到前台（或跨天）时刷新今日打卡状态，避免列表停留在旧的“已打卡/未打卡”显示
  useEffect(() => {
    const reloadToday = () => {
      if (document.visibilityState !== 'visible') return;
      const t = todayStr();
      store.habits.forEach((h) => store.getCheckins(h.id, t, t));
    };
    document.addEventListener('visibilitychange', reloadToday);
    return () => document.removeEventListener('visibilitychange', reloadToday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const isCheckedToday = (id: string) =>
    (store.checkins[id] ?? []).some((c) => c.checkDate === today);
  const totalOf = (id: string) => store.stats[id]?.total ?? 0;
  const streakOf = (id: string) => store.stats[id]?.currentStreak ?? 0;

  // 调度习惯每日提醒：遍历有 reminderAt 的习惯，计算今天该时刻并注册系统通知
  useEffect(() => {
    store.habits.forEach((h) => {
      if (!h.reminderAt) return;
      // 如果今天已打卡则跳过提醒
      if (isCheckedToday(h.id)) return;
      const [hh, mm] = h.reminderAt.split(':').map(Number);
      if (isNaN(hh) || isNaN(mm)) return;
      const now = new Date();
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
      // 只调度未来的时间
      if (when.getTime() > Date.now()) {
        scheduleReminder(`习惯打卡提醒：${h.title}`, when, `habit-${h.id}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const onCheck = async (h: Habit) => {
    if (isCheckedToday(h.id)) {
      await store.uncheckIn(h.id, today);
    } else {
      await store.checkIn(h.id, today);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2600);
    }
  };

  if (selected) {
    return (
      <HabitDetailView
        habit={selected}
        onBack={() => {
          setSelected(null);
          store.refresh();
        }}
      />
    );
  }

  return (
    <div className="habit-view">
      <div className="habit-header">
        <div className="habit-title-wrap">
          <span className="habit-title-icon">🔥</span>
          <h2 className="habit-title">习惯打卡</h2>
        </div>
        <button
          className="habit-add-btn"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          aria-label="新建习惯"
        >
          <span>＋</span>
          <span>新建习惯</span>
        </button>
      </div>

      {store.loading && store.habits.length === 0 && <div className="empty">加载中…</div>}
      {store.error && <div className="err habit-err">{store.error}</div>}

      <div className="habit-list">
        {store.habits.length === 0 && !store.loading ? (
          <div className="empty">
            <span className="big">🔥</span>
            还没有习惯，点上方“新建习惯”开始打卡吧！
          </div>
        ) : (
          store.habits.map((h) => (
            <div
              key={h.id}
              className="habit-item"
              onClick={() => setSelected(h)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSelected(h);
              }}
            >
              <div className="habit-icon" style={{ background: h.color }} aria-hidden>
                {h.icon}
              </div>
              <div className="habit-info">
                <div className="habit-name">{h.title}</div>
                <div className="habit-sub">
                  累计 {totalOf(h.id)} 次 · 连续 {streakOf(h.id)} 天
                </div>
              </div>
              <button
                className={`habit-check-btn ${isCheckedToday(h.id) ? 'on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCheck(h);
                }}
                title={isCheckedToday(h.id) ? '取消今日打卡' : '今日打卡'}
                aria-label={isCheckedToday(h.id) ? '取消今日打卡' : '今日打卡'}
              >
                {isCheckedToday(h.id) ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15"/>
                    <path d="M6 10.5l2.5 2.5 5.5-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.8" opacity="0.4"/>
                  </svg>
                )}
              </button>
            </div>
          ))
        )}
      </div>

      <Confetti active={celebrate} />

      {formOpen && (
        <HabitForm
          initial={editing}
          onSubmit={async (data) => {
            try {
              if (editing) await store.updateHabit(editing.id, data);
              else await store.addHabit(data);
              setFormOpen(false);
              setEditing(null);
            } catch (e: any) {
              alert(`保存失败：${e.message || '未知错误'}`);
            }
          }}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
