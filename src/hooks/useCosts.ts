import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { EmployeeCost, CostExtra } from '../types';

function normalize(row: any): EmployeeCost {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    salary: Number(row.salary ?? 0),
    otherCosts: Array.isArray(row.otherCosts) ? row.otherCosts : [],
    validFrom: (row.validFrom ?? '').slice(0, 10),
    validTo: row.validTo ? (row.validTo as string).slice(0, 10) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeExtra(row: any): CostExtra {
  return {
    id: row.id,
    userId: row.userId,
    costId: row.costId,
    costDate: (row.costDate ?? '').slice(0, 10),
    amount: Number(row.amount ?? 0),
    note: row.note ?? '',
    createdAt: row.createdAt,
  };
}

export function useCosts() {
  const [employees, setEmployees] = useState<EmployeeCost[]>([]);
  const [extras, setExtras] = useState<CostExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const rows = (await api.costs.list()) as any[];
      setEmployees(rows.map(normalize));
      setError(null);
    } catch (e: any) {
      setError(`加载失败：${e?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('dd_token')) refresh();
  }, [refresh]);

  const addEmployee = useCallback(
    async (c: Partial<EmployeeCost>) => {
      const row = (await api.costs.create(c)) as any;
      const e = normalize(row);
      setEmployees((prev) => [e, ...prev]);
      return e;
    },
    []
  );

  const updateEmployee = useCallback(async (id: string, patch: Partial<EmployeeCost>) => {
    const row = (await api.costs.update(id, patch)) as any;
    const e = normalize(row);
    setEmployees((prev) => prev.map((x) => (x.id === id ? e : x)));
    return e;
  }, []);

  const removeEmployee = useCallback(async (id: string) => {
    await api.costs.remove(id);
    setEmployees((prev) => prev.filter((x) => x.id !== id));
    setExtras((prev) => prev.filter((x) => x.costId !== id));
  }, []);

  // 按日期范围加载补录花费（含前后一周，便于跨月格显示）
  const loadExtras = useCallback(async (from: string, to: string) => {
    try {
      const rows = (await api.costs.listExtras(from, to)) as any[];
      setExtras(rows.map(normalizeExtra));
    } catch {
      /* 补录失败时不影响主表展示 */
    }
  }, []);

  const addExtra = useCallback(async (c: Partial<CostExtra>) => {
    const row = (await api.costs.addExtra(c)) as any;
    const e = normalizeExtra(row);
    setExtras((prev) => [e, ...prev]);
    return e;
  }, []);

  const removeExtra = useCallback(async (id: string) => {
    await api.costs.removeExtra(id);
    setExtras((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return {
    employees,
    extras,
    loading,
    error,
    refresh,
    addEmployee,
    updateEmployee,
    removeEmployee,
    loadExtras,
    addExtra,
    removeExtra,
  };
}

