import type { Task } from '../types';
import { TaskCard } from './TaskCard';

export function TaskList({
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
      <div className="task-list">
        <div className="empty">
          <span className="big">🐠</span>
          暂无任务，点右下角 + 添加一个吧！
        </div>
      </div>
    );
  }
  return (
    <div className="task-list">
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
