import { useLayoutEffect, useRef, useState } from 'react';
import {
  categoryColor,
  categoryLabel,
  priorityById,
  type Task,
} from '../types';
import { isMobileView, isTouchMode } from '../lib/platform';

function Flag({ color }: { color: string }) {
  return (
    <svg className="priority-flag" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <rect x="2" y="0.5" width="1.7" height="15" rx="0.8" fill="#5d736a" />
      <path d="M3.7 2 H13.4 L11.3 4.6 L13.4 7.2 H3.7 Z" fill={color} />
    </svg>
  );
}

/** 长按触发的拖拽相关回调（仅移动端使用） */
export type LongPressHandlers = {
  onLongPressStart?: (taskId: string, point: { x: number; y: number }) => void;
  onLongPressMove?: (taskId: string, point: { x: number; y: number }) => void;
  onLongPressEnd?: (taskId: string, cancelled: boolean) => void;
};

export function TaskCard({
  task,
  depth = 0,
  hasChildren = false,
  expanded = false,
  isDragging = false,
  isMobileDragging = false,
  onToggle,
  onDelete,
  onEdit,
  onAddSub,
  onSetReminder,
  onToggleExpand,
  onToggleStep,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropCard,
  longPress,
}: {
  task: Task;
  depth?: number;
  hasChildren?: boolean;
  expanded?: boolean;
  isDragging?: boolean;
  isMobileDragging?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onAddSub?: () => void;
  onSetReminder?: () => void;
  onToggleExpand?: () => void;
  onToggleStep?: (taskId: string, index: number) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOverCard?: (e: React.DragEvent) => void;
  onDropCard?: (e: React.DragEvent) => void;
  longPress?: LongPressHandlers;
}) {
  const done = task.status === 'completed';
  const postponed = task.status === 'postponed';
  const isSub = depth > 0;
  const steps = task.steps ?? [];
  const hasSteps = steps.length > 0;
  // 视觉推导“进行中"步骤：第一个未完成的步骤（仅用于样式区分，不改变数据/交互）
  const currentStep = steps.findIndex((s) => !s.done);
  const pMeta = priorityById(task.priority);
  // 复选框左侧颜色 = 优先级色；无优先级时父/子任务分别回退到分类色 / 子任务蓝
  const barColor = pMeta
    ? pMeta.color
    : isSub
    ? '#7fb8d6'
    : categoryColor(task.category);

  const cardClick = () => {
    // 长按拖拽结束后浏览器仍会补发一次 click，吞掉它避免误触发展开/收起
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (hasChildren && onToggleExpand) onToggleExpand();
  };

  // 是否在移动端样式下（决定跑马灯等纯布局行为）
  const mobile = isMobileView();
  // 拖拽交互模式：触摸设备走长按拖拽；鼠标设备（含窄窗口桌面）走 HTML5 拖拽
  const touchMode = isTouchMode();

  // 移动端标题不跑马灯，直接多行展示；桌面端保留 marquee
  // 标题跑马灯：先轮播到最后一个字，复原到起始位置，隔 3 秒再开始下一轮
  const titleRowRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (mobile) return; // 移动端不做跑马灯
    const row = titleRowRef.current;
    const el = marqueeRef.current;
    if (!row || !el) return;

    let cancelled = false;
    let timers: number[] = [];
    const SCROLL_MS = 3500; // 滚动到最后一个字的时长
    const PAUSE_MS = 3000; // 复原后停留时长

    const reset = () => {
      el.style.transition = 'none';
      el.style.transform = 'translateX(0)';
      void el.offsetWidth; // 强制回流，确保复位在下一帧动画前生效
    };

    const start = () => {
      const overflow = row.scrollWidth - row.clientWidth;
      if (overflow <= 0) {
        el.style.transform = 'translateX(0)';
        return; // 标题未溢出，无需滚动，静态展示
      }
      const run = () => {
        if (cancelled) return;
        reset();
        el.style.transition = `transform ${SCROLL_MS}ms linear`;
        el.style.transform = `translateX(-${overflow}px)`; // 轮播到最后一个字
        const t1 = window.setTimeout(() => {
          if (cancelled) return;
          reset(); // 复原到起始位置
          const t2 = window.setTimeout(() => {
            if (cancelled) return;
            run(); // 隔 3 秒后开始下一轮
          }, PAUSE_MS);
          timers.push(t2);
        }, SCROLL_MS);
        timers.push(t1);
      };
      run();
    };

    start();
    const onResize = () => {
      timers.forEach((t) => clearTimeout(t));
      timers = [];
      cancelled = false;
      start();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener('resize', onResize);
    };
  }, [task.title, pMeta?.color, mobile]);

  const handleDrop = (e: React.DragEvent) => {
    if (!onDropCard) return;
    onDropCard(e);
  };

  // 长按检测：仅触摸模式使用（桌面鼠标走 HTML5 拖拽）
  const longPressTimer = useRef<number | null>(null);
  const longPressStarted = useRef(false);
  const longPressStartPt = useRef<{ x: number; y: number } | null>(null);
  const [readyForLongPress, setReadyForLongPress] = useState(false);
  // 长按拖拽结束后抑制一次 click（避免误触发展开/收起）
  const suppressNextClick = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setReadyForLongPress(false);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!touchMode || !longPress) return;
    // 只对主按钮或单指触摸生效
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    longPressStartPt.current = { x: e.clientX, y: e.clientY };
    longPressStarted.current = false;
    // 600ms 触发，给设备采样留时间窗
    longPressTimer.current = window.setTimeout(() => {
      longPressStarted.current = true;
      setReadyForLongPress(true);
      // 震动反馈：明确告知"已进入拖拽模式"
      navigator.vibrate?.(25);
      longPress.onLongPressStart?.(task.id, longPressStartPt.current || { x: 0, y: 0 });
    }, 600);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!touchMode || !longPress) return;
    if (!longPressStarted.current) {
      const start = longPressStartPt.current;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        // 14px 阈值，容忍手指微抖与设备采样噪声
        if (Math.hypot(dx, dy) > 14) clearLongPress();
      }
      return;
    }
    longPress.onLongPressMove?.(task.id, { x: e.clientX, y: e.clientY });
  };
  const handlePointerUp = () => {
    if (!touchMode || !longPress) return;
    if (longPressStarted.current) {
      suppressNextClick.current = true;
      longPress.onLongPressEnd?.(task.id, false);
    }
    clearLongPress();
  };
  const handlePointerCancel = () => {
    if (!touchMode || !longPress) return;
    // 系统手势（长按选词 / 系统菜单）触发的 cancel 不立即退出长按状态；
    // 全局 pointerup 兜底决定最终落点。
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      data-task-id={task.id}
      className={[
        'task-card',
        done ? 'done' : '',
        postponed ? 'postponed' : '',
        isSub ? 'subtask' : '',
        hasChildren ? 'expandable' : '',
        hasChildren && expanded ? 'open' : '',
        isDragging ? 'dragging' : '',
        readyForLongPress ? 'long-press-ready' : '',
        isMobileDragging ? 'long-press-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={!touchMode}
      onDragStart={(e) => {
        if (touchMode) return; // 触摸模式不触发 HTML5 拖拽（走长按路径）
        e.dataTransfer.setData('task/id', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(e);
      }}
      onDragOver={onDragOverCard}
      onDrop={handleDrop}
      onDragEnd={onDragEnd}
      onClick={cardClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className="bar"
        style={{ background: barColor }}
        aria-hidden
      />

      <div className="task-col">
        {/* 第 1 段：标题（含完成勾选、展开箭头、优先级旗） */}
        <div className="task-head">
          <div className="task-top-left">
            <button
              className={`check ${done ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-label="标记完成"
            />
            {hasChildren && (
              <span
                className="caret"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand?.();
                }}
              >
                {expanded ? '▾' : '▸'}
              </span>
            )}
            {isSub && <span className="sub-dot" />}
          </div>

          <div className="task-title-row" title={task.title} ref={titleRowRef}>
            <div className="task-title-marquee" ref={marqueeRef}>
              <span className="task-title-text">
                {pMeta && <Flag color={pMeta.color} />}
                {task.title}
              </span>
            </div>
          </div>
        </div>

        {/* 第 2 段：标签（分类 / 优先级 / 进度 / 标签） */}
        <div className="task-tags">
          {!isSub && (
            <span
              className="cat-chip"
              style={{
                color: categoryColor(task.category),
                borderColor: categoryColor(task.category),
              }}
            >
              {categoryLabel(task.category)}
            </span>
          )}
          {pMeta && <span className="prio-chip">{pMeta.label}</span>}
          {task.total > 0 && (
            <span className="progress">
              {task.current}/{task.total}
            </span>
          )}
          {task.tags.map((t) => (
            <span className="tag" key={t}>
              #{t}
            </span>
          ))}
        </div>

        {/* 备注（如有） */}
        {task.note && (
          <div className="task-note" title={task.note}>
            📝 {task.note}
          </div>
        )}

        {/* 第 3 段：步骤列表（独占区块，层级分明） */}
        {hasSteps && (
          <div className="steps">
            {steps.map((s, i) => {
              const isCurrent = !s.done && i === currentStep;
              return (
                <div
                  className={`step-item ${s.done ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                  key={i}
                >
                  <button
                    className={`step-toggle ${s.done ? 'on' : ''} ${isCurrent ? 'current' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStep?.(task.id, i);
                    }}
                    aria-label={s.done ? '取消完成步骤' : '完成步骤'}
                  >
                    <span className="step-mark">{s.done ? '✓' : i + 1}</span>
                  </button>
                  <span className="step-label">{s.text}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 第 4 段：操作按钮（编辑 / 子任务 / 提醒 / 删除） */}
        <div className="task-actions-bottom">
          {!done && onEdit && (
            <button
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="编辑"
            >
              ✎
            </button>
          )}
          {!done && onAddSub && (
            <button
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onAddSub();
              }}
              title="添加子任务"
            >
              ＋
            </button>
          )}
          {!done && (
            <button
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSetReminder?.();
              }}
              title="设置提醒时间"
            >
              ⏰
            </button>
          )}
          <button
            className="icon-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="删除"
          >
            🗑
          </button>
        </div>
      </div>

      {done && <div className="stamp">CLEAR</div>}
      {postponed && <div className="stamp postpone">延期</div>}
    </div>
  );
}