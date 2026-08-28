import { createContext, useContext, type ReactNode } from 'react';
import { useTasks, type TasksApi } from '../hooks/useTasks';

const Ctx = createContext<TasksApi | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const value = useTasks();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTaskStore(): TasksApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTaskStore 必须在 TasksProvider 内使用');
  return ctx;
}
