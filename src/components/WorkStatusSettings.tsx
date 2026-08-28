import { useState } from 'react';
import {
  getWorkStatus,
  setWorkStatus,
  dateKey,
  MODE_LABELS,
  type WorkMode,
  type WorkStatusConfig,
  type DayPlan,
} from '../lib/workStatus';

const MODES: WorkMode[] = ['normal', 'overtime', 'dayoff'];

export function WorkStatusSettings() {
  const [cfg, setCfg] = useState<WorkStatusConfig>(getWorkStatus());
  const [wsMsg, setWsMsg] = useState('');
  // 预设未来安排
  const [presetDate, setPresetDate] = useState('');
  const [presetMode, setPresetMode] = useState<WorkMode>('overtime');
  const [presetOtEnd, setPresetOtEnd] = useState('20:00');
  const [presetCross, setPresetCross] = useState(false);
  const [presetRest, setPresetRest] = useState('');

  const flash = (t: string) => {
    setWsMsg(t);
    setTimeout(() => setWsMsg(''), 4000);
  };

  const today = dateKey();
  const todayPlan: DayPlan = cfg.plans[today] || { mode: 'normal' };

  // 所有变更即时持久化，保证刷新/重启后可恢复
  const persist = (next: WorkStatusConfig) => {
    setCfg(next);
    setWorkStatus(next);
  };

  const setTodayMode = (mode: WorkMode) => {
    const plans = { ...cfg.plans };
    plans[today] = { ...(plans[today] || { mode: 'normal' }), mode };
    persist({ ...cfg, plans });
    flash(`今日状态已设为「${MODE_LABELS[mode]}」`);
  };

  const updateTodayOt = (patch: Partial<DayPlan>) => {
    const plans = { ...cfg.plans };
    plans[today] = { ...(plans[today] || { mode: 'overtime' }), ...patch, mode: 'overtime' };
    persist({ ...cfg, plans });
    flash('加班设置已保存');
  };

  const updateTodayRest = (restText: string) => {
    const plans = { ...cfg.plans };
    plans[today] = { ...(plans[today] || { mode: 'dayoff' }), restText, mode: 'dayoff' };
    persist({ ...cfg, plans });
    flash('调休文案已保存');
  };

  const saveTexts = () => {
    persist(cfg);
    flash('文案设置已保存');
  };

  const addPreset = () => {
    if (!presetDate) {
      flash('请先选择要预设的日期');
      return;
    }
    const plans = { ...cfg.plans };
    const plan: DayPlan = { mode: presetMode };
    if (presetMode === 'overtime') {
      plan.overtimeEnd = presetOtEnd;
      plan.overtimeCrossMidnight = presetCross;
    }
    if (presetMode === 'dayoff') {
      plan.restText = presetRest.trim() || undefined;
    }
    plans[presetDate] = plan;
    persist({ ...cfg, plans });
    flash(`已预设 ${presetDate} 为「${MODE_LABELS[presetMode]}」`);
  };

  const delPreset = (d: string) => {
    const plans = { ...cfg.plans };
    delete plans[d];
    persist({ ...cfg, plans });
    flash(`已删除 ${d} 的预设`);
  };

  const planList = Object.entries(cfg.plans)
    .filter(([d]) => d !== today)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const detailOf = (p: DayPlan): string => {
    if (p.mode === 'overtime')
      return `加班结束 ${p.overtimeEnd || '—'}${p.overtimeCrossMidnight ? '（跨天）' : ''}`;
    if (p.mode === 'dayoff') return p.restText?.trim() ? `文案：${p.restText.trim()}` : '休息';
    return '正常工作';
  };

  return (
    <div className="ws-wrap">
      {/* —— 今日状态手动切换 —— */}
      <div className="field-label">今天的工作状态</div>
      <div className="ws-mode-btns">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`ws-mode-btn ${todayPlan.mode === m ? 'on' : ''}`}
            onClick={() => setTodayMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {todayPlan.mode === 'overtime' && (
        <div className="field-row" style={{ marginTop: 8 }}>
          <div className="field">
            <label>加班结束时间</label>
            <input
              type="time"
              value={todayPlan.overtimeEnd || '20:00'}
              onChange={(e) => updateTodayOt({ overtimeEnd: e.target.value })}
            />
          </div>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={!!todayPlan.overtimeCrossMidnight}
              onChange={(e) => updateTodayOt({ overtimeCrossMidnight: e.target.checked })}
            />
            跨天（次日）
          </label>
        </div>
      )}

      {todayPlan.mode === 'dayoff' && (
        <div className="field" style={{ marginTop: 8 }}>
          <label>休息文案（可留空用默认）</label>
          <input
            value={todayPlan.restText || ''}
            placeholder="今日调休"
            onChange={(e) => updateTodayRest(e.target.value)}
          />
        </div>
      )}

      {/* —— 按日期预设未来安排 —— */}
      <div className="field-label" style={{ marginTop: 14 }}>
        按日期预设未来安排
      </div>
      <div className="ws-preset-row">
        <div className="field" style={{ flex: '1 1 130px' }}>
          <label>日期</label>
          <input type="date" value={presetDate} onChange={(e) => setPresetDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '1 1 120px' }}>
          <label>状态</label>
          <select
            value={presetMode}
            onChange={(e) => setPresetMode(e.target.value as WorkMode)}
          >
            <option value="normal">正常工作日</option>
            <option value="overtime">临时加班</option>
            <option value="dayoff">调休/休息</option>
          </select>
        </div>
      </div>
      {presetMode === 'overtime' && (
        <div className="ws-preset-row" style={{ marginTop: 6 }}>
          <div className="field" style={{ flex: '1 1 120px' }}>
            <label>加班结束时间</label>
            <input
              type="time"
              value={presetOtEnd}
              onChange={(e) => setPresetOtEnd(e.target.value)}
            />
          </div>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={presetCross}
              onChange={(e) => setPresetCross(e.target.checked)}
            />
            跨天（次日）
          </label>
        </div>
      )}
      {presetMode === 'dayoff' && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>休息文案（可留空用默认）</label>
          <input
            value={presetRest}
            placeholder="今日调休"
            onChange={(e) => setPresetRest(e.target.value)}
          />
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn primary" type="button" onClick={addPreset}>
          ＋ 添加预设
        </button>
      </div>

      {planList.length > 0 && (
        <div className="ws-plan-list">
          {planList.map(([d, p]) => (
            <div className="ws-plan-item" key={d}>
              <span className="ws-plan-date">{d}</span>
              <span className="ws-plan-mode">{MODE_LABELS[p.mode]}</span>
              <span className="ws-plan-detail">{detailOf(p)}</span>
              <button
                type="button"
                className="tag-chip-x"
                aria-label={`删除 ${d} 预设`}
                onClick={() => delPreset(d)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* —— 文案自定义 —— */}
      <div className="field-label" style={{ marginTop: 14 }}>
        自定义展示文案
      </div>
      <div className="field">
        <label>正常倒计时前缀</label>
        <input
          value={cfg.texts.normalCountdown}
          onChange={(e) =>
            setCfg({ ...cfg, texts: { ...cfg.texts, normalCountdown: e.target.value } })
          }
        />
      </div>
      <div className="field">
        <label>加班倒计时前缀</label>
        <input
          value={cfg.texts.overtimeCountdown}
          onChange={(e) =>
            setCfg({ ...cfg, texts: { ...cfg.texts, overtimeCountdown: e.target.value } })
          }
        />
      </div>
      <div className="field">
        <label>调休/休息文案</label>
        <input
          value={cfg.texts.dayoff}
          onChange={(e) => setCfg({ ...cfg, texts: { ...cfg.texts, dayoff: e.target.value } })}
        />
      </div>
      <div className="field">
        <label>倒计时归零后文案</label>
        <input
          value={cfg.texts.done}
          onChange={(e) => setCfg({ ...cfg, texts: { ...cfg.texts, done: e.target.value } })}
        />
      </div>
      <div className="field">
        <label>未到上班时间文案</label>
        <input
          value={cfg.texts.pre}
          onChange={(e) => setCfg({ ...cfg, texts: { ...cfg.texts, pre: e.target.value } })}
        />
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn primary" type="button" onClick={saveTexts}>
          保存文案
        </button>
      </div>

      {wsMsg && <div className="hint set-inline-msg">{wsMsg}</div>}
    </div>
  );
}
