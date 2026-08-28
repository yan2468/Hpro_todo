import { useState } from 'react';
import type { EmployeeCost, CostExtra } from '../types';

function ymdStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtMoney(n: number): string {
  return '¥' + Math.round(n).toLocaleString();
}

interface Props {
  date: Date;
  employees: EmployeeCost[]; // 当前选中的人员
  extras: CostExtra[]; // 全部补录（组件内按日期过滤）
  onAdd: (costId: string, amount: number, note: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onClose: () => void;
}

export function CostDayModal({ date, employees, extras, onAdd, onDelete, onClose }: Props) {
  const ds = ymdStr(date);
  const dayExtras = extras.filter((x) => x.costDate === ds);
  const [costId, setCostId] = useState(employees[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const amt = Number(amount);
    if (!costId) {
      setErr('请选择人员');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('请输入大于 0 的金额');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onAdd(costId, amt, note.trim());
      setAmount('');
      setNote('');
    } catch (e: any) {
      setErr(`添加失败：${e?.message || '未知错误'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cost-day-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cost-day-head">
          <h3>{ds} 补录其他花费</h3>
          <button className="modal-x" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="cost-day-body">
          <p className="cost-day-sub">如某天出差加油、临时差旅、打印费等，点此补充到当天成本。</p>

          {/* 已录列表 */}
          {dayExtras.length > 0 && (
            <div className="cost-day-list">
              {dayExtras.map((x) => {
                const who = employees.find((e) => e.id === x.costId);
                return (
                  <div key={x.id} className="cost-day-row">
                    <div className="cost-day-row-main">
                      <span className="cost-day-amt">{fmtMoney(Number(x.amount || 0))}</span>
                      <span className="cost-day-note">{x.note || '（无说明）'}</span>
                      <span className="cost-day-who">{who?.name ?? '已删人员'}</span>
                    </div>
                    <button className="cost-mini del" title="删除" onClick={() => onDelete(x.id)}>🗑</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 新增表单 */}
          {employees.length === 0 ? (
            <div className="cost-empty-hint">请先在“查看人员”中添加人员</div>
          ) : (
            <div className="cost-day-form">
              <label className="field">
                <span className="field-label">人员</span>
                <select value={costId} onChange={(e) => setCostId(e.target.value)}>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">金额（元）</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  placeholder="如 200"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">说明（可选）</span>
                <input
                  type="text"
                  value={note}
                  placeholder="如：出差加油"
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {err && <div className="err cost-err">{err}</div>}
            </div>
          )}
        </div>

        {employees.length > 0 && (
          <div className="cost-day-footer">
            <div className="btn-row">
              <button className="btn" type="button" onClick={onClose}>
                取消
              </button>
              <button className="btn primary" onClick={submit} disabled={busy}>
                {busy ? '保存中…' : '添加补录'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
