import { useEffect, useState } from 'react';
import iconUrl from '/icon.png';

interface Props {
  onReady: () => void;
  minMs?: number;
}

export function Splash({ onReady, minMs = 1800 }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), minMs - 350);
    const doneTimer = setTimeout(() => onReady(), minMs);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onReady, minMs]);

  return (
    <div className={`splash-screen${exiting ? ' splash-exit' : ''}`}>
      <div className="splash-bubbles">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="splash-card">
        <div className="splash-icon-wrap">
          <img className="splash-icon" src={iconUrl} alt="牛马的打工日志" />
        </div>
        <h1 className="splash-title">牛马的打工日志</h1>
        <p className="splash-tagline">打工不易，每一滴汗水都值得被记录</p>
        <div className="splash-mascot">
          <span className="splash-cow">🐮</span>
          <span className="splash-horse">🐴</span>
        </div>
        <div className="splash-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
