import { useEffect, useState } from 'react';
import { getProfile } from '../lib/profile';
import { getWorkStatus, computeCountdown } from '../lib/workStatus';

export function OffWorkCountdown() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const profile = getProfile();
  const cfg = getWorkStatus();
  const view = computeCountdown(cfg, profile, new Date(now));

  return <span className={`offwork-countdown tone-${view.tone}`}>{view.text}</span>;
}
