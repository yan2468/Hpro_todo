import { useState } from 'react';
import type { EmployeeCost, OtherCost } from '../types';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function CostForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial?: EmployeeCost | null;
  onSubmit: (data: Partial<EmployeeCost>) => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [salary, setSalary] = useState(initial ? String(initial.salary) : '');
  const [otherCosts, setOtherCosts] = useState<OtherCost[]>(
    initial?.otherCosts?.length ? initial.otherCosts.map((c) => ({ ...c })) : []
  );
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? todayStr());
  const [noEnd, setNoEnd] = useState(initial?.validTo == null);
  const [validTo, setValidTo] = useState(initial?.validTo ?? todayStr());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const totalOther = otherCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const salaryNum = Number(salary) || 0;
  const monthlyTotal = salaryNum + totalOther;

  const addRow = () => setOtherCosts((p) => [...p, { label: '', amount: 0 }]);
  const updateRow = (i: number, patch: Partial<OtherCost>) =>
    setOtherCosts((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeRow = (i: number) => setOtherCosts((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!name.trim()) {
      setErr('请填写员工姓名');
      return;
    }
    if (salaryNum < 0) {
      setErr('月薪不能为负');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await onSubmit({
        name: name.trim(),
        salary: salaryNum,
        otherCosts: otherCosts
          .filter((c) => c.label.trim())
          .map((c) => ({ label: c.label.trim(), amount: Number(c.amount) || 0 })),
        validFrom,
        validTo: noEnd ? null : validTo,
      });
      onClose();
    } catch (e: any) {
      setErr(`保存失败：${e?.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cost-form" onClick={(e) => e.stopPropagation()}>
        <h3 className="cost-form-title">{initial ? '编辑人员' : '添加人员'}</h3>

        <div className="modal-body">
          {err && <div className="err cost-err">{err}</div>}

          <label className="field-label">姓名</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：张三"
          />

          <label className="field-label">月薪（元/月）</label>
          <input
            className="field-input"
            type="number"
            min={0}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="如：8000"
          />

          <div className="cost-other-head">
            <label className="field-label">其他花费（每月）</label>
            <button type="button" className="cost-add-row" onClick={addRow}>
              ＋ 添加一项
            </button>
          </div>
          {otherCosts.length === 0 && (
            <div className="cost-other-empty">暂无，可添加油费、差旅费、打印费等</div>
          )}
          {otherCosts.map((c, i) => (
            <div className="cost-other-row" key={i}>
              <input
                className="field-input cost-other-label"
                value={c.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="名称，如油费"
              />
              <input
                className="field-input cost-other-amount"
                type="number"
                min={0}
                value={c.amount}
                onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
                placeholder="金额"
              />
              <button type="button" className="cost-row-del" onClick={() => removeRow(i)} aria-label="删除">
                ✕
              </button>
            </div>
          ))}

          <div className="cost-date-row">
            <div className="cost-date-col">
              <label className="field-label">在职起始</label>
              <input
                className="field-input"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="cost-date-col">
              <label className="field-label">在职截止</label>
              <div className="cost-date-end">
                <input
                  className="field-input"
                  type="date"
                  value={validTo}
                  disabled={noEnd}
                  onChange={(e) => setValidTo(e.target.value)}
                />
                <label className="cost-noend">
                  <input
                    type="checkbox"
                    checked={noEnd}
                    onChange={(e) => setNoEnd(e.target.checked)}
                  />
                  至今
                </label>
              </div>
            </div>
          </div>

          <div className="cost-summary">
            月度合计：<strong>¥{monthlyTotal.toLocaleString()}</strong>
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-actions">
            <button className="btn" type="button" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" type="button" onClick={submit} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
