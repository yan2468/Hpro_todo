import { createContext, useContext, type ReactNode } from 'react';
import { useHabits, type HabitsApi } from '../hooks/useHabits';

const Ctx = createContext<HabitsApi | null>(null);

export function HabitsProvider({ children }: { children: ReactNode }) {
  const value = useHabits();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHabitStore(): HabitsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHabitStore 必须在 HabitsProvider 内使用');
  return ctx;
}
