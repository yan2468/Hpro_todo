import { useMemo, useState } from 'react';
import type { HabitCheckin } from '../types';

type Dimension = 'year' | 'month' | 'week';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** 根据维度生成时间桶标签和日期范围 */
function buildBuckets(dim: Dimension, now: Date) {
  const buckets: { label: string; from: string; to: string }[] = [];
  if (dim === 'year') {
    // 最近12个月
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(y, m + 1, 0);
      const to = ymd(last);
      buckets.push({ label: `${m + 1}月`, from, to });
    }
  } else if (dim === 'month') {
    // 最近30天
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const s = ymd(d);
      buckets.push({ label: String(d.getDate()), from: s, to: s });
    }
  } else {
    // week: 最近7天
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const s = ymd(d);
      const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      buckets.push({ label: weekday, from: s, to: s });
    }
  }
  return buckets;
}

export function HabitTrendChart({
  checkins,
  color,
}: {
  checkins: HabitCheckin[];
  color: string;
}) {
  const [dim, setDim] = useState<Dimension>('week');
  const now = useMemo(() => new Date(), []);

  const checkedSet = useMemo(() => new Set(checkins.map((c) => c.checkDate)), [checkins]);

  const buckets = useMemo(() => buildBuckets(dim, now), [dim, now]);

  const data = useMemo(() => {
    return buckets.map((b) => {
      let count = 0;
      // 遍历日期范围计数
      const from = new Date(b.from);
      const to = new Date(b.to);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (checkedSet.has(ymd(d))) count++;
      }
      return { ...b, count };
    });
  }, [buckets, checkedSet]);

  const maxVal = Math.max(1, ...data.map((d) => d.count));

  // 渐变色取第一个颜色作为柱状图颜色
  const barColor = color.startsWith('linear') ? '#3fae74' : color;

  return (
    <div className="habit-trend">
      <div className="habit-trend-head">
        <span className="habit-trend-title">📈 打卡趋势</span>
        <div className="habit-trend-dims">
          {(['week', 'month', 'year'] as Dimension[]).map((d) => (
            <button
              key={d}
              className={`habit-trend-dim ${dim === d ? 'on' : ''}`}
              onClick={() => setDim(d)}
              type="button"
            >
              {d === 'week' ? '周' : d === 'month' ? '月' : '年'}
            </button>
          ))}
        </div>
      </div>
      <div className="habit-trend-chart">
        {data.map((d, i) => (
          <div key={i} className="habit-trend-col">
            <div className="habit-trend-bar-wrap">
              <div
                className="habit-trend-bar"
                style={{
                  height: `${(d.count / maxVal) * 100}%`,
                  background: barColor,
                }}
                title={`${d.label}: ${d.count} 次`}
              />
            </div>
            <span className="habit-trend-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}