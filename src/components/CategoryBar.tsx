import { CATEGORIES, type CategoryId } from '../types';

export function CategoryBar({
  active,
  counts,
  onPick,
}: {
  active: CategoryId | 'all';
  counts?: Record<string, number>;
  onPick: (c: CategoryId | 'all') => void;
}) {
  return (
    <div className="cat-bar">
      <button
        className={`cat-btn ${active === 'all' ? 'active' : ''}`}
        onClick={() => onPick('all')}
        title="全部"
      >
        <span className="cat-icon">📋</span>
        <span className="cat-label">全部</span>
      </button>
      {CATEGORIES.map((c) => {
        const count = counts?.[c.id] ?? 0;
        return (
          <button
            key={c.id}
            className={`cat-btn ${active === c.id ? 'active' : ''}`}
            onClick={() => onPick(active === c.id ? 'all' : c.id)}
            title={c.label}
          >
            {count > 0 && <span className="dot" style={{ background: c.color }} />}
            <span className="cat-icon">{c.icon}</span>
            <span className="cat-label">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
