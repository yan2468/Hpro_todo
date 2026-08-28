import type { Task } from '../types';
import { TaskCard } from './TaskCard';

export function HistoryView({
  tasks,
  onToggle,
  onDelete,
}: {
  tasks: Task[];
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  if (!tasks.length) {
    return (
      <div className="history">
        <h3>历史记录</h3>
        <div className="empty">
          <span className="big">🪸</span>
          还没有已完成或延期的任务
        </div>
      </div>
    );
  }
  return (
    <div className="history">
      <h3>历史记录（{tasks.length}）</h3>
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          onToggle={() => onToggle(t)}
          onDelete={() => onDelete(t)}
        />
      ))}
    </div>
  );
}
