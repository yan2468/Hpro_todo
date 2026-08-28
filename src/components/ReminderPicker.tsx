import { useState } from 'react';
import type { Task } from '../types';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function formatLocalInput(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function ReminderPicker({
  task,
  onSave,
  onClose,
}: {
  task: Task;
  onSave: (reminderAt: string | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(task.reminderAt ? toLocalInput(task.reminderAt) : '');

  const quick = (minutes: number) => {
    const d = new Date(Date.now() + minutes * 60000);
    setValue(formatLocalInput(d));
  };

  const todayEnd = () => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    setValue(formatLocalInput(d));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(value ? new Date(value).toISOString() : null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal reminder-picker"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3>设置提醒时间</h3>

        <div className="modal-body">
          <p className="hint">任务：{task.title}</p>

          <div className="field">
            <label>提醒时间</label>
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label>快捷选项</label>
            <div className="quick-btns">
              <button type="button" onClick={() => quick(10)}>
                10分钟后
              </button>
              <button type="button" onClick={() => quick(30)}>
                30分钟后
              </button>
              <button type="button" onClick={() => quick(60)}>
                1小时后
              </button>
              <button type="button" onClick={todayEnd}>
                今天17:00
              </button>
              <button type="button" className="clear" onClick={() => setValue('')}>
                清除提醒
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="btn-row">
            <button className="btn" type="button" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" type="submit">
              确定
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
