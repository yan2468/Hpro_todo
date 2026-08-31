import { useEffect, useMemo, useRef, useState } from 'react';
import type { Report, ReportType } from '../types';

function typeLabel(t: ReportType) {
  return t === 'daily' ? '日报' : '周报';
}

function toLocalYMD(d: string | Date | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DEFAULT_TIME = '00:00:00';
const DEFAULT_COMPANY = '霞数智算';

function addDays(d: string | Date, days: number): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  date.setDate(date.getDate() + days);
  return toLocalYMD(date);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function weekStartOf(d: string): string {
  const date = new Date(d);
  const day = date.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day; // 回退到本周一
  date.setDate(date.getDate() + diff);
  return toLocalYMD(date);
}

function defaultReportTitle(t: ReportType, d: string): string {
  if (t === 'daily') return `${d} 工作日报`;
  const ws = weekStartOf(d);
  return `${ws} 至 ${addDays(ws, 6)} 工作周报`;
}

export interface ReportFormData {
  type: ReportType;
  title: string;
  reportDate: string;
  endDate: string;
  reportTime: string;
  company: string;
  status: import('../types').ReportStatus;
  bullets: string[];
}

interface Props {
  initial?: Report | null;
  defaultType?: ReportType;
  onSubmit: (data: ReportFormData) => void;
  onClose: () => void;
}

export function ReportForm({ initial, defaultType = 'daily', onSubmit, onClose }: Props) {
  const [type] = useState<ReportType>(initial?.type ?? defaultType);
  const [date, setDate] = useState(() => {
    if (initial?.reportDate) return toLocalYMD(initial.reportDate);
    const todayStr = toLocalYMD(new Date());
    return !initial && defaultType === 'weekly' ? weekStartOf(todayStr) : todayStr;
  });
  const [title, setTitle] = useState(
    initial?.title ??
      defaultReportTitle(initial?.type ?? defaultType, toLocalYMD(initial?.reportDate) || toLocalYMD(new Date()))
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const [time, setTime] = useState(
    initial?.reportTime ||
      (initial
        ? DEFAULT_TIME
        : `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}:${pad2(new Date().getSeconds())}`)
  );
  const [company, setCompany] = useState(initial?.company || DEFAULT_COMPANY);
  const [bullets, setBullets] = useState<string[]>(initial?.bullets?.length ? initial.bullets : ['']);
  const endRef = useRef<HTMLInputElement>(null);

  const endDate = useMemo(() => addDays(date, type === 'weekly' ? 6 : 0), [date, type]);

  useEffect(() => {
    if (!initial) endRef.current?.focus();
  }, [initial]);

  useEffect(() => {
    if (!initial && !titleTouched) setTitle(defaultReportTitle(type, date));
  }, [date, type, titleTouched, initial]);

  const updateBullet = (i: number, v: string) => {
    setBullets((prev) => prev.map((b, idx) => (idx === i ? v : b)));
  };

  const addBullet = (i: number) => {
    setBullets((prev) => [...prev.slice(0, i + 1), '', ...prev.slice(i + 1)]);
    setTimeout(() => {
      const el = document.getElementById(`bullet-${i + 1}`) as HTMLInputElement | null;
      el?.focus();
    }, 0);
  };

  const removeBullet = (i: number) => {
    setBullets((prev) => (prev.length <= 1 ? [''] : prev.filter((_, idx) => idx !== i)));
  };

  const moveBullet = (i: number, dir: -1 | 1) => {
    setBullets((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBullet(i);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = bullets.map((b) => b.trim()).filter((b) => b.length > 0);
    if (!title.trim()) return;
    // 时间/公司若被清空，回退到默认值
    const finalTime = time.trim() || DEFAULT_TIME;
    const finalCompany = company.trim() || DEFAULT_COMPANY;
    onSubmit({
      type,
      title: title.trim(),
      reportDate: date,
      endDate,
      reportTime: finalTime,
      company: finalCompany,
      status: 'published',
      bullets: trimmed.length ? trimmed : [''],
    });
  };

  const handleSaveDraft = () => {
    const trimmed = bullets.map((b) => b.trim()).filter((b) => b.length > 0);
    const finalTime = time.trim() || DEFAULT_TIME;
    const finalCompany = company.trim() || DEFAULT_COMPANY;
    onSubmit({
      type,
      title: title.trim() || defaultReportTitle(type, date),
      reportDate: date,
      endDate,
      reportTime: finalTime,
      company: finalCompany,
      status: 'draft',
      bullets: trimmed.length ? trimmed : [''],
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal report-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{initial ? '编辑报告' : '新建报告'}</h3>
        <div className="modal-body">
          <div className="field">
            <label>类型</label>
            <div className="report-type-badge">{typeLabel(type)}</div>
          </div>
          <div className="field">
            <label>标题</label>
            <input
              value={title}
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
              placeholder={type === 'daily' ? '例如：2026-08-19 工作日报' : '例如：第 34 周工作周报'}
              required
            />
          </div>
          <div className="field">
            <label>日期与时间</label>
            <div className="date-time-row">
              <input
                type="date"
                className="date-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <input
                type="time"
                className="time-input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="时间"
              />
            </div>
            {type === 'weekly' && (
              <p className="hint">
                结束时间：{endDate}
                {time ? ` ${time}` : ''}（自动 = 开始时间 + 6 天）
              </p>
            )}
          </div>
          <div className="field">
            <label>公司 / 单位</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="例如：威希德 / 画景食品 / 智算畅科"
            />
          </div>
          <div className="field">
            <label>分点内容（回车新增分点）</label>
            <div className="bullet-list">
              {bullets.map((b, i) => (
                <div key={i} className="bullet-row">
                  <span className="bullet-dot">{i + 1}.</span>
                  <input
                    id={`bullet-${i}`}
                    ref={i === bullets.length - 1 ? endRef : undefined}
                    value={b}
                    onChange={(e) => updateBullet(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    placeholder="输入一条内容"
                  />
                  <div className="bullet-actions">
                    <button type="button" className="icon-btn" onClick={() => moveBullet(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveBullet(i, 1)}
                      disabled={i === bullets.length - 1}
                    >
                      ↓
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => removeBullet(i)}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn add-bullet" onClick={() => addBullet(bullets.length - 1)}>
              + 添加分点
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <div className="btn-row">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn" onClick={handleSaveDraft}>
              📌 暂存
            </button>
            <button type="submit" className="btn primary">
              {initial ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
