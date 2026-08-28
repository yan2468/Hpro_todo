import { useEffect, useMemo, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotate: number;
  delay: number;
}

/**
 * 礼花/烟花飘落动画组件。
 * 从中心向上喷射粒子并受重力下落，2.6 秒后自动消失。
 */
export function Confetti({ active, originX, originY }: { active: boolean; originX?: number; originY?: number }) {
  const [particles] = useState<Particle[]>(() => {
    const colors = ['#f5a623', '#34a06a', '#4a90e2', '#e94b3c', '#9b59b6', '#1abc9c', '#f1c40f'];
    return Array.from({ length: 60 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      return {
        id: i,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: -120 - Math.random() * 180,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 5 + Math.random() * 7,
        rotate: Math.random() * 360,
        delay: Math.random() * 0.15,
      };
    });
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      setTick((t) => t + dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const timer = setTimeout(() => cancelAnimationFrame(raf), 2600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [active]);

  const rendered = useMemo(() => {
    if (!active) return null;
    return particles.map((p) => {
      const t = Math.max(0, tick - p.delay);
      const x = p.vx * t;
      const y = p.vy * t + 0.5 * 420 * t * t;
      const opacity = Math.max(0, 1 - t / 2.2);
      const transform = `translate(${x}px, ${y}px) rotate(${p.rotate + t * 180}deg)`;
      return (
        <span
          key={p.id}
          className="confetti-particle"
          style={{
            background: p.color,
            width: p.size,
            height: p.size,
            opacity,
            transform,
          }}
        />
      );
    });
  }, [active, particles, tick]);

  if (!active) return null;
  return (
    <div
      className="confetti-root"
      style={{
        left: originX ?? '50%',
        top: originY ?? '50%',
      }}
    >
      {rendered}
    </div>
  );
}
