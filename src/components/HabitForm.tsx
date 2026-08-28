import { useState } from 'react';
import { HABIT_COLORS, HABIT_ICONS, type Habit } from '../types';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function HabitForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial?: Habit | null;
  onSubmit: (data: Partial<Habit>) => void | Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '🔥');
  const [color, setColor] = useState(initial?.color ?? '#f5a623');
  const [reminderAt, setReminderAt] = useState(initial?.reminderAt ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayStr());

  const submit = () => {
    if (!title.trim()) {
      alert('请填写习惯名称');
      return;
    }
    onSubmit({
      title: title.trim(),
      icon,
      color,
      reminderAt: reminderAt || null,
      startDate,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? '编辑习惯' : '新建习惯'}</h3>

        <div className="modal-body">
          <div className="field">
            <label>名称 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：每天喝水 2L"
              maxLength={40}
            />
          </div>

          <div className="field">
            <label>图标</label>
            <div className="habit-icon-pick">
              {HABIT_ICONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className={`habit-icon-opt ${icon === em ? 'on' : ''}`}
                  onClick={() => setIcon(em)}
                  aria-label={`选择图标 ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>主题色</label>
            <div className="habit-color-pick">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`habit-color-opt ${color === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`选择颜色 ${c}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="habit-color-custom"
                title="自定义颜色"
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>每日提醒时间</label>
              <input
                type="time"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
              />
            </div>
            <div className="field">
              <label>开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="btn-row">
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" onClick={submit}>
              {initial ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
