import { useCallback, useEffect, useReducer } from 'react';
import { api } from '../lib/api';
import type { Report } from '../types';

const DEFAULT_REPORT_TIME = '00:00:00';
const DEFAULT_COMPANY = '霞数智算';

interface State {
  reports: Report[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'set'; reports: Report[] }
  | { type: 'upsert'; report: Report }
  | { type: 'remove'; id: string }
  | { type: 'loading'; v: boolean }
  | { type: 'error'; msg: string | null };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, reports: a.reports, loading: false, error: null };
    case 'upsert': {
      const i = s.reports.findIndex((r) => r.id === a.report.id);
      const reports =
        i >= 0
          ? s.reports.map((r) => (r.id === a.report.id ? a.report : r))
          : [a.report, ...s.reports];
      return { ...s, reports };
    }
    case 'remove':
      return { ...s, reports: s.reports.filter((r) => r.id !== a.id) };
    case 'loading':
      return { ...s, loading: a.v };
    case 'error':
      return { ...s, error: a.msg };
    default:
      return s;
  }
}

function normalize(row: any): Report {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    reportDate: row.reportDate ?? row.report_date,
    endDate: row.endDate ?? row.end_date,
    reportTime: (row.reportTime ?? row.report_time) || DEFAULT_REPORT_TIME,
    company: (row.company ?? '') || DEFAULT_COMPANY,
    bullets: row.bullets ?? [],
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

export function useReports() {
  const [state, dispatch] = useReducer(reducer, { reports: [], loading: true, error: null });

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'loading', v: true });
      const rows = (await api.listReports()) as any[];
      dispatch({ type: 'set', reports: rows.map(normalize) });
    } catch (e: any) {
      dispatch({ type: 'error', msg: e.message });
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('dd_token')) refresh();
  }, [refresh]);

  const addReport = useCallback(async (r: Partial<Report>) => {
    const report = (await api.createReport(r)) as any;
    const norm = normalize(report);
    dispatch({ type: 'upsert', report: norm });
    return norm;
  }, []);

  const updateReport = useCallback(async (id: string, patch: Partial<Report>) => {
    const report = (await api.updateReport(id, patch)) as any;
    const norm = normalize(report);
    dispatch({ type: 'upsert', report: norm });
    return norm;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteReport(id);
    dispatch({ type: 'remove', id });
  }, []);

  const clone = useCallback(async (id: string, patch?: Partial<Report>) => {
    const report = (await api.cloneReport(id, patch)) as any;
    const norm = normalize(report);
    dispatch({ type: 'upsert', report: norm });
    return norm;
  }, []);

  return { ...state, refresh, addReport, updateReport, remove, clone };
}

export type ReportsApi = ReturnType<typeof useReports>;
