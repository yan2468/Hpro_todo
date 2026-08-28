import { useEffect, useMemo, useState } from 'react';
import { useCosts } from '../hooks/useCosts';
import { CostForm } from './CostForm';
import { CostDayModal } from './CostDayModal';
import type { EmployeeCost } from '../types';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']; // 周一开头

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function mondayOf(d: Date): Date {
  const diff = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -diff);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isWeekday(d: Date): boolean {
  const w = d.getDay();
  return w !== 0 && w !== 6;
}
function parseYMD(s: string): Date {
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(y, m - 1, dd);
}
function ymdStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function monthTitle(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
function fmtMoney(n: number): string {
  return '¥' + Math.round(n).toLocaleString();
}

/** 员工月度总额 = 月薪 + 其他花费之和 */
function monthlyTotal(e: EmployeeCost): number {
  return (e.salary || 0) + (e.otherCosts || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

/** 某员工在该月内的有效工作天数（周一~周五 ∩ 在职区间） */
function workdaysInMonth(e: EmployeeCost, year: number, month: number): number {
  const from = parseYMD(e.validFrom);
  const to = e.validTo ? parseYMD(e.validTo) : new Date(2999, 0, 1);
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let n = 0;
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    if (isWeekday(d) && d >= from && d <= to) n++;
  }
  return n;
}

/** 某员工在指定日期的上班成本（非工作日或不在职返回 0） */
function dailyCost(e: EmployeeCost, d: Date): number {
  const from = parseYMD(e.validFrom);
  const to = e.validTo ? parseYMD(e.validTo) : new Date(2999, 0, 1);
  if (!isWeekday(d) || d < from || d > to) return 0;
  const wd = workdaysInMonth(e, d.getFullYear(), d.getMonth());
  return wd > 0 ? monthlyTotal(e) / wd : 0;
}

export function CostView() {
  const store = useCosts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeCost | null>(null);
  const [dayDate, setDayDate] = useState<Date | null>(null); // 点击某天补录

  // 初次载入或人员变化后，默认全选
  const selKey = store.employees.map((e) => e.id).join(',');
  const activeSelected = useMemo(() => {
    if (store.employees.length === 0) return [];
    const ids = selected.size ? store.employees.filter((e) => selected.has(e.id)) : store.employees;
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.employees, selKey, selected.size]);

  const activeIds = useMemo(() => new Set(activeSelected.map((e) => e.id)), [activeSelected]);

  // 按当前月份（含前后 7 天）加载补录花费
  useEffect(() => {
    if (!localStorage.getItem('dd_token')) return;
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const from = ymdStr(addDays(first, -7));
    const to = ymdStr(addDays(last, 7));
    store.loadExtras(from, to);
  }, [cursor, store]);

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 月历 42 格
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  // 某天补录总额（仅计入当前选中人员）
  const extrasOfDay = (d: Date) =>
    store.extras.filter((x) => activeIds.has(x.costId) && x.costDate === ymdStr(d));
  const dayTotal = (d: Date) =>
    activeSelected.reduce((s, e) => s + dailyCost(e, d), 0) +
    extrasOfDay(d).reduce((s, x) => s + Number(x.amount || 0), 0);

  // 当年 12 个月合计（含补录）
  const year = cursor.getFullYear();
  const monthTotals = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      let base = 0;
      for (const e of activeSelected) {
        const wd = workdaysInMonth(e, year, m);
        if (wd > 0) base += monthlyTotal(e) * (wd / workdaysInMonth(e, year, m));
      }
      const extra = store.extras
        .filter((x) => activeIds.has(x.costId))
        .filter((x) => {
          const dt = parseYMD(x.costDate);
          return dt.getFullYear() === year && dt.getMonth() === m;
        })
        .reduce((s, x) => s + Number(x.amount || 0), 0);
      return base + extra;
    });
  }, [activeSelected, activeIds, store.extras, year]);

  const monthTotal = monthTotals[cursor.getMonth()];
  const yearTotal = monthTotals.reduce((a, b) => a + b, 0);

  const step = (delta: number) =>
    setCursor((c) => {
      const n = new Date(c);
      n.setMonth(n.getMonth() + delta, 1);
      return n;
    });

  const onSave = async (data: Partial<EmployeeCost>) => {
    try {
      if (editing) await store.updateEmployee(editing.id, data);
      else await store.addEmployee(data);
      setEditing(null);
      if (selected.size) setSelected(new Set(store.employees.map((e) => e.id))); // 重置为全选
    } catch (e: any) {
      alert(`保存失败：${e.message || '未知错误'}`);
      throw e;
    }
  };

  const onDelete = async (e: EmployeeCost) => {
    if (!confirm(`确定删除「${e.name}」的成本配置吗？`)) return;
    await store.removeEmployee(e.id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(e.id);
      return next;
    });
  };

  const maxMonth = Math.max(1, ...monthTotals);

  return (
    <div className="cost-view">
      <div className="cost-header">
        <div className="cost-title-wrap">
          <span className="cost-title-icon">💰</span>
          <h2 className="cost-title">员工成本</h2>
        </div>
        <button
          className="habit-add-btn"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <span>＋</span>
          <span>添加人员</span>
        </button>
      </div>

      {store.error && <div className="err cost-err">{store.error}</div>}

      {/* 人员选择 */}
      <div className="cost-people">
        <div className="cost-people-label">查看人员</div>
        {store.employees.length === 0 && !store.loading ? (
          <div className="cost-empty-hint">还没有人员，点右上角“添加人员”开始</div>
        ) : (
          <div className="cost-chips">
            {store.employees.map((e) => {
              const on = selected.size === 0 || selected.has(e.id);
              return (
                <button
                  key={e.id}
                  className={`cost-chip ${on ? 'on' : ''}`}
                  onClick={() => toggleSel(e.id)}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        )}
        {store.employees.length > 0 && (
          <div className="cost-manage">
            {store.employees.map((e) => (
              <span key={e.id} className="cost-manage-item">
                {e.name}
                <button className="cost-mini" title="编辑" onClick={() => { setEditing(e); setFormOpen(true); }}>✎</button>
                <button className="cost-mini del" title="删除" onClick={() => onDelete(e)}>🗑</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 汇总 */}
      <div className="cost-summary-cards">
        <div className="cost-card">
          <div className="cost-card-val">{fmtMoney(monthTotal)}</div>
          <div className="cost-card-label">{monthTitle(cursor)}合计</div>
        </div>
        <div className="cost-card">
          <div className="cost-card-val">{fmtMoney(yearTotal)}</div>
          <div className="cost-card-label">{year}年合计</div>
        </div>
      </div>

      {/* 月历 */}
      <div className="cal">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="cal-arrow" onClick={() => step(-1)} aria-label="上个月">‹</button>
            <span className="cal-title">{monthTitle(cursor)}</span>
            <button className="cal-arrow" onClick={() => step(1)} aria-label="下个月">›</button>
            <button className="cal-today" onClick={() => setCursor(startOfDay(new Date()))}>今天</button>
          </div>
        </div>
        <div className="cal-month">
          <div className="cal-weekheads">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-weekhead">{w}</div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const total = dayTotal(d);
              const weekend = !isWeekday(d);
              const ex = extrasOfDay(d);
              const hasExtra = ex.length > 0;
              return (
                <div
                  key={i}
                  className={`cal-cell cost-cell ${inMonth ? '' : 'out'} ${sameDay(d, startOfDay(new Date())) ? 'today' : ''} ${weekend ? 'weekend' : ''}`}
                  onClick={() => inMonth && setDayDate(d)}
                  role="button"
                  title={inMonth ? '点击补录该天其他花费' : undefined}
                >
                  <div className="cal-cellnum">{d.getDate()}</div>
                  {total > 0 && <div className="cost-cell-amount">{fmtMoney(total)}</div>}
                  {hasExtra && <div className="cost-cell-extra">＋{fmtMoney(ex.reduce((s, x) => s + Number(x.amount || 0), 0))}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 年度统计 */}
      <div className="cost-year">
        <div className="cost-year-title">{year}年各月合计</div>
        <div className="cost-year-bars">
          {monthTotals.map((v, m) => (
            <div
              key={m}
              className={`cost-bar ${m === cursor.getMonth() ? 'on' : ''}`}
              title={`${m + 1}月 ${fmtMoney(v)}`}
              onClick={() => setCursor(new Date(year, m, 1))}
            >
              <div className="cost-bar-fill" style={{ height: `${Math.round((v / maxMonth) * 100)}%` }} />
              <div className="cost-bar-label">{m + 1}</div>
            </div>
          ))}
        </div>
      </div>

      {formOpen && (
        <CostForm
          initial={editing}
          onSubmit={onSave}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {dayDate && (
        <CostDayModal
          date={dayDate}
          employees={activeSelected}
          extras={store.extras}
          onAdd={async (costId, amount, note) => {
            await store.addExtra({ costId, costDate: ymdStr(dayDate), amount, note });
            // 重新拉取当前范围，保证跨月格一致
            const first = new Date(dayDate.getFullYear(), dayDate.getMonth(), 1);
            const last = new Date(dayDate.getFullYear(), dayDate.getMonth() + 1, 0);
            await store.loadExtras(ymdStr(addDays(first, -7)), ymdStr(addDays(last, 7)));
          }}
          onDelete={async (id) => {
            await store.removeExtra(id);
            const first = new Date(dayDate.getFullYear(), dayDate.getMonth(), 1);
            const last = new Date(dayDate.getFullYear(), dayDate.getMonth() + 1, 0);
            await store.loadExtras(ymdStr(addDays(first, -7)), ymdStr(addDays(last, 7)));
          }}
          onClose={() => setDayDate(null)}
        />
      )}
    </div>
  );
}
