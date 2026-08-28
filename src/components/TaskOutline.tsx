import { Fragment, useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { priorityOrder } from '../types';
import { TaskCard } from './TaskCard';

// 列表排序：先优先级（重要且紧急→…→不重要不紧急），同父级同优先级按 sort_order（拖拽顺序），最后按创建时间
function sortCmp(a: Task, b: Task): number {
  const d = priorityOrder(a.priority) - priorityOrder(b.priority);
  if (d !== 0) return d;
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function childrenOf(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.parentId === id).sort(sortCmp);
}

function isDescendant(tasks: Task[], ancestorId: string, childId: string): boolean {
  if (ancestorId === childId) return true;
  return tasks.filter((t) => t.parentId === childId).some((c) => isDescendant(tasks, ancestorId, c.id));
}

type DropPos = 'before' | 'after' | 'child';

/**
 * 落点分区（两端统一）：
 * - 上 40% → before（插到目标上方）
 * - 中 20% → child（拖入为目标的子任务，刻意收窄避免误触）
 * - 下 40% → after（插到目标下方）
 */
const ZONE_BEFORE = 0.4;
const ZONE_CHILD = 0.6;

/** 在指定 Y 坐标下找出最近的顶层 TaskCard 与落点位置 */
function findDropAtY(
  listEl: HTMLElement,
  pointerY: number,
  excludeId: string
): { id: string; position: DropPos } | null {
  const cards = Array.from(listEl.querySelectorAll('.task-card')) as HTMLElement[];
  if (cards.length === 0) return null;
  for (const el of cards) {
    const id = el.dataset.taskId;
    if (!id || id === excludeId) continue;
    const rect = el.getBoundingClientRect();
    if (pointerY < rect.top + rect.height * ZONE_BEFORE) {
      return { id, position: 'before' };
    }
    if (pointerY < rect.top + rect.height * ZONE_CHILD) {
      return { id, position: 'child' };
    }
    if (pointerY <= rect.bottom) {
      return { id, position: 'after' };
    }
  }
  // 落到列表末尾
  const last = cards[cards.length - 1];
  const lastId = last.dataset.taskId;
  if (lastId && lastId !== excludeId) {
    return { id: lastId, position: 'after' };
  }
  return null;
}

export function TaskOutline({
  tasks,
  catFilter,
  expanded,
  onToggleExpand,
  onToggle,
  onDelete,
  onEdit,
  onAddSub,
  onSetReminder,
  onToggleStep,
  onReorder,
  emptyText,
}: {
  tasks: Task[];
  catFilter?: string;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
  onEdit?: (t: Task) => void;
  onAddSub?: (t: Task) => void;
  onSetReminder?: (t: Task) => void;
  onToggleStep?: (taskId: string, index: number) => void;
  onReorder?: (payload: { sourceId: string; targetId: string; position: DropPos }) => void;
  emptyText?: string;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const dropTargetRef = useRef<{ id: string; position: DropPos } | null>(null);
  const childTargetRef = useRef<string | null>(null);

  // ===== 移动端长按拖拽引擎 =====
  // 状态只存 id（开始/结束各渲染一次）；指针位置走 ref + rAF 直写 DOM，避免每帧 setState 全列表重渲染（卡顿根因之一）
  const [mobileDragId, setMobileDragId] = useState<string | null>(null);
  const mobileDragIdRef = useRef<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const dragEndedRef = useRef(false);

  const sorted = [...tasks].sort(sortCmp);
  const tops = sorted.filter(
    (t) => !t.parentId && (!catFilter || catFilter === 'all' || t.category === catFilter)
  );

  const taskById = (id: string) => tasks.find((t) => t.id === id);

  const clearIndicator = () => {
    if (indicatorRef.current) indicatorRef.current.style.display = 'none';
    if (hintRef.current) hintRef.current.style.display = 'none';
    if (childTargetRef.current && listRef.current) {
      const prev = listRef.current.querySelector(`[data-task-id="${childTargetRef.current}"]`) as HTMLElement | null;
      prev?.classList.remove('drop-child-active');
    }
    childTargetRef.current = null;
    dropTargetRef.current = null;
  };

  const computePosition = (e: React.DragEvent, el: HTMLElement): DropPos => {
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    if (y < h * ZONE_BEFORE) return 'before';
    if (y > h * ZONE_CHILD) return 'after';
    return 'child';
  };

  const moveIndicator = (targetId: string, position: DropPos) => {
    const list = listRef.current;
    const ind = indicatorRef.current;
    const hint = hintRef.current;
    if (!list || !ind) return;

    const el = list.querySelector(`[data-task-id="${targetId}"]`) as HTMLElement | null;
    if (!el) return clearIndicator();

    const listRect = list.getBoundingClientRect();
    const rect = el.getBoundingClientRect();

    // 清除上一个「作为子任务」高亮
    if (childTargetRef.current && childTargetRef.current !== targetId) {
      const prev = list.querySelector(`[data-task-id="${childTargetRef.current}"]`) as HTMLElement | null;
      prev?.classList.remove('drop-child-active');
    }

    if (position === 'child') {
      ind.style.display = 'none';
      el.classList.add('drop-child-active');
      childTargetRef.current = targetId;
      if (hint) {
        hint.textContent = '松开：设为子任务';
        hint.className = 'drop-hint child';
        hint.style.display = 'block';
        hint.style.transform = 'translate(-50%, -100%)';
        hint.style.left = `${rect.left + rect.width / 2 - listRect.left}px`;
        hint.style.top = `${rect.top - listRect.top - 10}px`;
      }
    } else {
      el.classList.remove('drop-child-active');
      childTargetRef.current = null;
      // before 放在卡片上沿，after 放在卡片下沿（留出 4px 视觉间隙）
      const gap = 4;
      const top = position === 'before' ? rect.top - listRect.top - gap : rect.bottom - listRect.top + gap;
      ind.style.top = `${top}px`;
      ind.style.display = 'block';
      if (hint) {
        // 提示条主要服务触摸拖拽（手指遮挡视线 + 精度低）；桌面鼠标指针精确，指示线已足够
        const touchDragging = !!mobileDragIdRef.current;
        if (touchDragging) {
          hint.textContent = position === 'before' ? '松开：移到上方' : '松开：移到下方';
          hint.className = 'drop-hint';
          hint.style.display = 'block';
          if (position === 'before') {
            hint.style.transform = 'translate(-50%, -100%)';
            hint.style.top = `${top - 8}px`;
          } else {
            hint.style.transform = 'translate(-50%, 0)';
            hint.style.top = `${top + 8}px`;
          }
          hint.style.left = `${rect.left + rect.width / 2 - listRect.left}px`;
        } else {
          hint.style.display = 'none';
        }
      }
    }
    dropTargetRef.current = { id: targetId, position };
  };

  const handleCardDragOver = (targetId: string, e: React.DragEvent) => {
    if (!draggingId || draggingId === targetId) {
      clearIndicator();
      return;
    }
    if (isDescendant(tasks, targetId, draggingId)) {
      clearIndicator();
      return;
    }
    const source = taskById(draggingId);
    const target = taskById(targetId);
    if (!source || !target) {
      clearIndicator();
      return;
    }

    const el = e.currentTarget as HTMLElement;
    let position = computePosition(e, el);

    // before/after 只对「同父级 + 同优先级」有意义（排序先按优先级分组，跨组插入会被分组"弹回"）。
    // 跨父级 / 跨优先级时与移动端保持一致：降级为 child（拖入目标为子任务），给用户一个明确可预期的结果。
    const sameParent = (source.parentId ?? null) === (target.parentId ?? null);
    const samePriority = priorityOrder(source.priority) === priorityOrder(target.priority);
    if ((position === 'before' || position === 'after') && !(sameParent && samePriority)) {
      position = 'child';
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    moveIndicator(targetId, position);
  };

  const handleListDragOver = (e: React.DragEvent) => {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const list = listRef.current;
    const ind = indicatorRef.current;
    if (!list || !ind) return;

    // 清除卡片上的子任务高亮
    if (childTargetRef.current) {
      const prev = list.querySelector(`[data-task-id="${childTargetRef.current}"]`) as HTMLElement | null;
      prev?.classList.remove('drop-child-active');
      childTargetRef.current = null;
    }

    const listRect = list.getBoundingClientRect();
    const cards = Array.from(list.querySelectorAll('.task-card')) as HTMLElement[];

    if (cards.length === 0) {
      ind.style.top = '8px';
      ind.style.display = 'block';
      dropTargetRef.current = { id: '', position: 'after' };
      return;
    }

    const first = cards[0];
    const last = cards[cards.length - 1];
    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();

    if (e.clientY < firstRect.top + firstRect.height * ZONE_BEFORE) {
      ind.style.top = `${firstRect.top - listRect.top - 4}px`;
      ind.style.display = 'block';
      dropTargetRef.current = { id: '', position: 'before' };
    } else if (e.clientY > lastRect.top + lastRect.height * ZONE_CHILD) {
      ind.style.top = `${lastRect.bottom - listRect.top + 4}px`;
      ind.style.display = 'block';
      dropTargetRef.current = { id: '', position: 'after' };
    } else {
      // 处于卡片中间但未命中某张卡片的 before/after 区域时，不显示指示器
      ind.style.display = 'none';
      dropTargetRef.current = null;
    }
  };

  const handleCardDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('task/id');
    const dt = dropTargetRef.current;
    // 若当前落点记录的就是这张卡片，采用记录的位置；
    // 若落点记录在列表空白处（id=''），把该位置应用到最近的这张卡片上；
    // 其余情况默认 after
    let position: DropPos = 'after';
    if (dt?.id === targetId) {
      position = dt.position;
    } else if (dt?.id === '' && (dt.position === 'before' || dt.position === 'after')) {
      position = dt.position;
    }
    clearIndicator();
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    if (isDescendant(tasks, targetId, sourceId)) return;
    onReorder?.({ sourceId, targetId, position });
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('task/id');
    const position = dropTargetRef.current?.position ?? 'after';
    clearIndicator();
    setDraggingId(null);
    if (!sourceId) return;
    onReorder?.({ sourceId, targetId: '', position });
  };

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    clearIndicator();
    setDraggingId(null);
  };

  // ===== 移动端长按拖拽（触摸模式） =====
  // 核心修复：
  // ① 长按激活后用非被动 touchmove + preventDefault 阻止浏览器滚动接管（pointercancel 会掐断拖拽的根因）；
  // ② 指针位置/幽灵卡片/指示器更新收敛到单个 rAF 循环，直写 DOM，不再每帧 setState；
  // ③ 拖到屏幕上下边缘时自动滚动列表，长列表也能拖；
  // ④ 结束/取消统一走 endMobileDrag，dragEndedRef 保证幂等（卡片与全局监听双入口只生效一次）。

  const stopDragLoop = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const autoScroll = (pt: { x: number; y: number }) => {
    const scroller = document.scrollingElement ?? document.documentElement;
    const H = window.innerHeight;
    const EDGE = 96; // 距上下边缘的感应区
    const MAX_SPEED = 18; // 每帧最大滚动像素
    if (pt.y > 0 && pt.y < EDGE) {
      scroller.scrollTop -= Math.min(MAX_SPEED, (EDGE - pt.y) * 0.35);
    } else if (pt.y > H - EDGE && pt.y < H) {
      scroller.scrollTop += Math.min(MAX_SPEED, (pt.y - (H - EDGE)) * 0.35);
    }
  };

  const updateDropAtPointer = (pt: { x: number; y: number }) => {
    const id = mobileDragIdRef.current;
    const list = listRef.current;
    if (!id || !list) return;
    const drop = findDropAtY(list, pt.y, id);
    if (!drop) {
      clearIndicator();
      return;
    }
    const source = taskById(id);
    const target = taskById(drop.id);
    if (!source || !target) {
      clearIndicator();
      return;
    }
    if (isDescendant(tasks, drop.id, id)) {
      clearIndicator();
      return;
    }
    const sameParent = (source.parentId ?? null) === (target.parentId ?? null);
    const samePriority = priorityOrder(source.priority) === priorityOrder(target.priority);
    let position = drop.position;
    if ((position === 'before' || position === 'after') && !(sameParent && samePriority)) {
      // 跨父级/跨优先级时降级为 child（与桌面端一致）
      position = 'child';
    }
    moveIndicator(drop.id, position);
  };

  const dragStep = () => {
    rafRef.current = null;
    const pt = pointerRef.current;
    if (pt && mobileDragIdRef.current) {
      // 幽灵卡片跟随手指（直写 style，不触发 React 渲染）
      if (ghostRef.current) {
        ghostRef.current.style.left = `${pt.x}px`;
        ghostRef.current.style.top = `${pt.y}px`;
      }
      autoScroll(pt);
      updateDropAtPointer(pt);
    }
    rafRef.current = requestAnimationFrame(dragStep);
  };

  const startDragLoop = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(dragStep);
    }
  };

  const endMobileDrag = (id: string, cancelled: boolean) => {
    if (dragEndedRef.current) return;
    dragEndedRef.current = true;
    const target = cancelled ? null : dropTargetRef.current;
    stopDragLoop();
    document.body.classList.remove('drag-active');
    clearIndicator();
    mobileDragIdRef.current = null;
    setMobileDragId(null);
    if (!cancelled && target?.id && !isDescendant(tasks, target.id, id)) {
      onReorder?.({ sourceId: id, targetId: target.id, position: target.position });
    }
  };

  const onLongPressStart = (id: string, pt: { x: number; y: number }) => {
    dragEndedRef.current = false;
    pointerRef.current = pt;
    mobileDragIdRef.current = id;
    setMobileDragId(id);
    document.body.classList.add('drag-active');
    startDragLoop();
  };

  const onLongPressMove = (_id: string, pt: { x: number; y: number }) => {
    // 只更新 ref；渲染由 rAF 循环直写 DOM
    pointerRef.current = pt;
  };

  const onLongPressEnd = (id: string, cancelled: boolean) => {
    endMobileDrag(id, cancelled);
  };

  // 全局监听：手指离开原卡片仍可继续追踪；touchmove 阻止默认滚动；contextmenu 阻止长按系统菜单
  useEffect(() => {
    if (!mobileDragId) return;
    const id = mobileDragId;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      endMobileDrag(id, false);
    };
    const onCancel = () => endMobileDrag(id, true);
    const onTouchMove = (e: TouchEvent) => {
      // 关键：非被动监听 + preventDefault，阻止浏览器把触摸接管为滚动
      // （否则浏览器会发出 pointercancel，拖拽立即中断——移动端无法拖拽的根因）
      e.preventDefault();
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('contextmenu', onContextMenu);
      stopDragLoop();
      document.body.classList.remove('drag-active');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileDragId]);

  const renderNode = (t: Task, depth: number) => {
    const kids = childrenOf(tasks, t.id);
    const isOpen = expanded.has(t.id) && kids.length > 0;
    return (
      <Fragment key={t.id}>
        <TaskCard
          task={t}
          depth={depth}
          hasChildren={kids.length > 0}
          expanded={isOpen}
          isDragging={draggingId === t.id}
          isMobileDragging={mobileDragId === t.id}
          onToggle={() => onToggle(t)}
          onDelete={() => onDelete(t)}
          onEdit={onEdit ? () => onEdit(t) : undefined}
          onAddSub={onAddSub ? () => onAddSub(t) : undefined}
          onSetReminder={onSetReminder ? () => onSetReminder(t) : undefined}
          onToggleExpand={() => onToggleExpand(t.id)}
          onToggleStep={onToggleStep}
          onDragStart={() => handleDragStart(t.id)}
          onDragEnd={handleDragEnd}
          onDragOverCard={(e) => handleCardDragOver(t.id, e)}
          onDropCard={(e) => handleCardDrop(t.id, e)}
          longPress={{
            onLongPressStart,
            onLongPressMove,
            onLongPressEnd,
          }}
        />
        {isOpen && (
          <div className="subtree">
            {kids.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </Fragment>
    );
  };

  const ghostTask = mobileDragId ? taskById(mobileDragId) : null;

  const content = !tops.length ? (
    <div className="empty">
      <span className="big">🐮</span>
      {emptyText || '暂无任务，点右下角 + 添加一个吧！'}
    </div>
  ) : (
    <>
      <div ref={indicatorRef} className="drop-indicator" />
      <div ref={hintRef} className="drop-hint" />
      {tops.map((t) => renderNode(t, 0))}
    </>
  );

  return (
    <>
      <div
        ref={listRef}
        className="task-list"
        onDragOver={handleListDragOver}
        onDrop={handleListDrop}
      >
        {content}
      </div>
      {/* 移动端拖拽浮动预览：位置由 rAF 直写，不经过 React 渲染 */}
      {ghostTask && (
        <div
          ref={ghostRef}
          className="task-drag-ghost"
          style={{ left: pointerRef.current?.x ?? 0, top: pointerRef.current?.y ?? 0 }}
        >
          <TaskCard
            task={ghostTask}
            hasChildren={childrenOf(tasks, ghostTask.id).length > 0}
            expanded={expanded.has(ghostTask.id)}
            isMobileDragging
            onToggle={() => {}}
            onDelete={() => {}}
          />
        </div>
      )}
    </>
  );
}
