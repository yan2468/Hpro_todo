import { useEffect, useState } from 'react';
import { getProfile } from '../lib/profile';
import {
  getWorkStatus,
  setWorkStatus,
  computeCountdown,
  dateKey,
  MODE_LABELS,
  type WorkMode,
} from '../lib/workStatus';

const MODES: WorkMode[] = ['normal', 'overtime', 'dayoff'];

export function OffWorkCountdown() {
  const [now, setNow] = useState(() => Date.now());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const profile = getProfile();
  const cfg = getWorkStatus();
  const view = computeCountdown(cfg, profile, new Date(now));

  const today = dateKey();
  const currentMode = cfg.plans[today]?.mode ?? (view.mode || 'normal');

  const switchMode = (mode: WorkMode) => {
    const plans = { ...cfg.plans };
    plans[today] = { ...(plans[today] || { mode: 'normal' }), mode };
    setWorkStatus({ ...cfg, plans });
    setShowPicker(false);
  };

  return (
    <span className="offwork-wrap">
      <span
        className={`offwork-countdown tone-${view.tone}`}
        onClick={() => setShowPicker(!showPicker)}
        role="button"
        tabIndex={0}
        title="点击切换工作状态"
      >
        {view.text}
      </span>
      {showPicker && (
        <span className="offwork-picker">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`offwork-opt ${currentMode === m ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                switchMode(m);
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
