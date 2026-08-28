import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../types';

function collectDescendants(tasks: Task[], rootId: string): Set<string> {
  const byParent = new Map<string, string[]>();
  tasks.forEach((t) => {
    if (t.parentId) {
      const arr = byParent.get(t.parentId) || [];
      arr.push(t.id);
      byParent.set(t.parentId, arr);
    }
  });
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    (byParent.get(cur) || []).forEach((c) => {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    });
  }
  return out;
}

/**
 * 可搜索的单选下拉框：用于「直接新建子任务」时选择父任务。
 * - 排除自身及其所有子孙，避免把任务挂成自己的祖先（环）
 * - 未选时即「作为顶级任务」；选中后以 chip 展示，可清除
 */
export function ParentSelect({
  tasks,
  value,
  onChange,
  excludeId,
  placeholder = '搜索并选择父任务（留空=顶级任务）…',
}: {
  tasks: Task[];
  value: Task | null;
  onChange: (t: Task | null) => void;
  excludeId?: string;
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

  const banned = useMemo(
    () => (excludeId ? new Set([excludeId, ...collectDescendants(tasks, excludeId)]) : new Set<string>()),
    [tasks, excludeId]
  );

  const candidates = useMemo(
    () =>
      tasks
        .filter((t) => !banned.has(t.id))
        .filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase())),
    [tasks, banned, q]
  );

  return (
    <div className="parent-select" ref={rootRef}>
      <div
        className="tag-select-box"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {value ? (
          <span className="tag-chip parent-chip">
            🔗 {value.title}
            <button
              type="button"
              className="tag-chip-x"
              aria-label="取消关联父任务"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              ✕
            </button>
          </span>
        ) : null}
        <input
          ref={inputRef}
          className="tag-select-input"
          value={q}
          placeholder={value ? '' : placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <span className="tag-caret">▾</span>
      </div>
      {open && (
        <div className="tag-menu">
          {!value && (
            <button
              type="button"
              className="tag-menu-item"
              onClick={() => {
                onChange(null);
                setQ('');
                setOpen(false);
              }}
            >
              （无 · 作为顶级任务）
            </button>
          )}
          {candidates.length === 0 ? (
            <div className="tag-menu-empty">{q.trim() ? '无匹配任务' : '暂无可选父任务'}</div>
          ) : (
            candidates.slice(0, 50).map((t) => (
              <button
                type="button"
                key={t.id}
                className="tag-menu-item"
                onClick={() => {
                  onChange(t);
                  setQ('');
                  setOpen(false);
                }}
              >
                {t.title}
                {t.tags?.includes('子任务') ? ' · 子任务' : ''}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
