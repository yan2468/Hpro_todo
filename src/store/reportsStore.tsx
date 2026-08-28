import { createContext, useContext, type ReactNode } from 'react';
import { useReports, type ReportsApi } from '../hooks/useReports';

const Ctx = createContext<ReportsApi | null>(null);

export function ReportsProvider({ children }: { children: ReactNode }) {
  const value = useReports();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReportStore(): ReportsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReportStore 必须在 ReportsProvider 内使用');
  return ctx;
}
