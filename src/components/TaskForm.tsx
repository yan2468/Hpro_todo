import { useState } from 'react';
import {
  CATEGORIES,
  PRIORITIES,
  type CategoryId,
  type PriorityId,
  type Step,
  type Task,
} from '../types';
import { TagSelect } from './TagSelect';
import { ParentSelect } from './ParentSelect';
import {
  buildTags,
  getConfigTags,
  SYSTEM_TAG_CHILD,
  SYSTEM_TAG_PARENT,
} from '../lib/tags';

export interface TaskFormData {
  title: string;
  category: CategoryId;
  tags: string[];
  steps: Step[];
  priority?: PriorityId;
  parentId?: string | null;
  note?: string;
  reminderAt: string | null;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function TaskForm({
  initial,
  parentId,
  tasks,
  onSubmit,
  onClose,
}: {
  initial?: Task | null;
  /** 由父任务「+」按钮带过来的父任务 id（自动关联，预填且可改） */
  parentId?: string | null;
  /** 全部任务，供父任务搜索下拉使用 */
  tasks?: Task[];
  onSubmit: (data: TaskFormData) => void;
  onClose: () => void;
}) {
  const allTasks = tasks ?? [];
  const initParent =
    allTasks.find((t) => t.id === (initial?.parentId ?? parentId)) ?? null;
  const [selParent, setSelParent] = useState<Task | null>(initParent);
  const isSub = !!selParent;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<CategoryId>(
    ((initial?.category as CategoryId) || selParent?.category || 'main') as CategoryId
  );
  // 配置标签：编辑时取「非系统标签」部分；新建时为空，由用户从下拉选
  const initSelected = (initial?.tags ?? []).filter(
    (t) => t !== SYSTEM_TAG_PARENT && t !== SYSTEM_TAG_CHILD
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(initSelected);
  const [priority, setPriority] = useState<PriorityId>(
    (initial?.priority as PriorityId) || 'normal'
  );
  const [steps, setSteps] = useState<Step[]>(
    initial?.steps ?? [{ text: '', done: false }]
  );
  const [reminder, setReminder] = useState(
    initial?.reminderAt ? toLocalInput(initial.reminderAt) : ''
  );
  const [note, setNote] = useState(initial?.note ?? '');

  const configTags = getConfigTags();

  const setStep = (i: number, patch: Partial<Step>) =>
    setSteps((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addStep = () => setSteps((s) => [...s, { text: '', done: false }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const systemTag = isSub ? SYSTEM_TAG_CHILD : SYSTEM_TAG_PARENT;

  const submit = () => {
    if (!title.trim()) return;
    const cleaned = steps
      .map((s) => ({ text: s.text.trim(), done: !!s.done }))
      .filter((s) => s.text);
    onSubmit({
      title: title.trim(),
      category: isSub ? ((selParent?.category as CategoryId) || 'main') : category,
      tags: buildTags(systemTag, selectedTags),
      steps: cleaned,
      priority,
      parentId: selParent?.id ?? null,
      note: note.trim(),
      reminderAt: isSub ? null : reminder ? new Date(reminder).toISOString() : null,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3>
          {initial ? '编辑任务' : isSub ? '添加子任务' : '新建任务'}
          {isSub && <span className="sub-badge">子任务</span>}
        </h3>

        <div className="modal-body">
          <div className="field">
            <label>{isSub ? '子任务标题' : '标题'}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isSub ? '子任务要做什么？' : '要做什么？'}
              autoFocus
            />
          </div>

          {/* 父任务关联：新建时可选（直接建子任务）；由父任务「+」进来时预填并自动关联 */}
          <div className="field">
            <label>关联父任务（可选）</label>
            <ParentSelect
              tasks={allTasks}
              value={selParent}
              excludeId={initial?.id}
              onChange={setSelParent}
            />
            <p className="hint">
              {isSub
                ? '已关联为「' + selParent?.title + '」的子任务，会自动带上「子任务」标签。'
                : '不选择则为顶级任务，自动带上「父任务」标签。想在别处建子任务？在这里搜父任务即可。'}
            </p>
          </div>

          {!isSub && (
            <div className="field">
              <label>分类</label>
              <div className="cat-pick">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={category === c.id ? 'on' : ''}
                    onClick={() => setCategory(c.id)}
                    type="button"
                  >
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label>优先级（四色小旗，列表按此排序）</label>
            <div className="prio-pick">
              {PRIORITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`prio-btn ${priority === p.id ? 'on' : ''}`}
                  style={
                    priority === p.id
                      ? { borderColor: p.color, background: `${p.color}1f` }
                      : undefined
                  }
                  onClick={() => setPriority(p.id)}
                >
                  <span className="prio-flag" style={{ background: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>步骤（序号自动递增，数量自动计算，无需填写总数）</label>
            <div className="steps-editor">
              {steps.map((s, i) => (
                <div className="step-row" key={i}>
                  <span className="step-num">{i + 1}</span>
                  <input
                    className="step-text"
                    value={s.text}
                    placeholder={`第 ${i + 1} 步：例如 买菜`}
                    onChange={(e) => setStep(i, { text: e.target.value })}
                  />
                  <button
                    className="step-del"
                    type="button"
                    onClick={() => removeStep(i)}
                    aria-label="删除步骤"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="step-add" type="button" onClick={addStep}>
                ＋ 添加步骤
              </button>
            </div>
            {steps.filter((s) => s.text.trim()).length > 0 && (
              <p className="hint">
                共 {steps.filter((s) => s.text.trim()).length} 个步骤（已完成{' '}
                {steps.filter((s) => s.text.trim() && s.done).length} 个）
              </p>
            )}
          </div>

          <div className="field">
            <label>
              标签（仅可从已配置标签中选择；「{systemTag}」由系统自动添加）
            </label>
            <TagSelect
              options={configTags}
              value={selectedTags}
              onChange={setSelectedTags}
            />
            <p className="hint">
              想新增标签？去「设置 → 标签配置」里添加。系统标签「{systemTag}」已自动带上，无需手选。
            </p>
          </div>

          <div className="field">
            <label>备注（可选，桌面小组件与移动端都会展示）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="补充说明、链接、注意事项…"
              rows={2}
            />
          </div>

          {!isSub && (
            <div className="field">
              <label>提醒时间（可选）</label>
              <input
                type="datetime-local"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="btn-row">
            <button className="btn" onClick={onClose} type="button">
              取消
            </button>
            <button className="btn primary" type="submit">
              {initial ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
