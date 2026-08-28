import { useEffect, useRef, useState } from 'react';

/**
 * 可搜索的多选下拉框：仅允许从 options（配置好的标签池）中选择。
 * - 已选标签以 chip 展示，可点 ✕ 删除
 * - 输入框过滤 options，点击 / 回车 添加第一个匹配项
 * - 空输入时显示全部可选标签；无匹配时提示去设置添加
 */
export function TagSelect({
  options,
  value,
  onChange,
  placeholder = '搜索并选择标签…',
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const picked = new Set(value);
  const filtered = options
    .filter((o) => !picked.has(o))
    .filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));

  const add = (t: string) => {
    const v = t.trim();
    if (!v || picked.has(v)) return;
    onChange([...value, v]);
    setQ('');
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <div className="tag-select" ref={rootRef}>
      <div
        className="tag-select-box"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {value.map((t) => (
          <span className="tag-chip" key={t}>
            {t}
            <button
              type="button"
              className="tag-chip-x"
              aria-label={`移除 ${t}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="tag-select-input"
          value={q}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length) add(filtered[0]);
              else if (q.trim() && options.includes(q.trim())) add(q.trim());
            } else if (e.key === 'Backspace' && !q && value.length) {
              remove(value[value.length - 1]);
            }
          }}
        />
        <span className="tag-caret">▾</span>
      </div>
      {open && (
        <div className="tag-menu">
          {filtered.length === 0 ? (
            <div className="tag-menu-empty">
              {q.trim() ? '无匹配标签，请到「设置 → 标签配置」添加' : '暂无可添加标签，请到设置添加'}
            </div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o}
                className="tag-menu-item"
                onClick={() => add(o)}
              >
                {o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
