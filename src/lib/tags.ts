// 可配置标签池：用户只能在「设置」里管理这些标签，任务表单的标签下拉框只从这些里选。
// 「父任务 / 子任务」属于系统自动标签，不在配置池内，按是否为子任务自动追加。

const KEY = 'dd_config_tags';

// 首次使用时给一批合理默认，避免下拉框为空；用户可在「设置 → 标签配置」里增删。
const DEFAULT_TAGS = ['主线', '支线', '周期性', '临时', '重要', '学习', '生活'];

export const SYSTEM_TAG_PARENT = '父任务';
export const SYSTEM_TAG_CHILD = '子任务';

export function getConfigTags(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(DEFAULT_TAGS));
      return [...DEFAULT_TAGS];
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [...DEFAULT_TAGS];
  } catch {
    return [...DEFAULT_TAGS];
  }
}

export function setConfigTags(tags: string[]): void {
  const clean = Array.from(
    new Set(tags.map((t) => t.trim()).filter(Boolean))
  );
  localStorage.setItem(KEY, JSON.stringify(clean));
}

export function addConfigTag(tag: string): string[] {
  const t = tag.trim();
  if (!t) return getConfigTags();
  const cur = getConfigTags();
  if (cur.includes(t)) return cur;
  const next = [...cur, t];
  setConfigTags(next);
  return next;
}

export function removeConfigTag(tag: string): string[] {
  const next = getConfigTags().filter((t) => t !== tag);
  setConfigTags(next);
  return next;
}

/** 把系统标签 + 用户自选配置标签合并成最终标签数组（去重） */
export function buildTags(systemTag: string | null, selected: string[]): string[] {
  return Array.from(new Set([...(systemTag ? [systemTag] : []), ...selected]));
}
