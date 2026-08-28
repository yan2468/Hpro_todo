import { api } from './api';
import { getProfile, setProfile, type Profile } from './profile';
import { getAIConfig, setAIConfig, type AIConfig } from './aiConfig';
import { getConfigTags, setConfigTags } from './tags';
import { getWorkStatus, setWorkStatus, type WorkStatusConfig } from './workStatus';
import { getTheme, setTheme, type ThemeMode, applyTheme } from './theme';

const KEYS = {
  profile: 'profile',
  aiConfig: 'ai_config',
  tags: 'tags',
  workStatus: 'work_status',
  theme: 'theme',
} as const;

function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 从服务端拉取设置并覆盖本地 localStorage */
export async function loadSettingsFromServer(): Promise<void> {
  try {
    const data = (await api.settings.getAll()) as Record<string, string>;
    if (data[KEYS.profile]) {
      const p = safeParse<Profile>(data[KEYS.profile]);
      if (p) setProfile({ ...getProfile(), ...p });
    }
    if (data[KEYS.aiConfig]) {
      const c = safeParse<AIConfig>(data[KEYS.aiConfig]);
      if (c) setAIConfig({ ...getAIConfig(), ...c });
    }
    if (data[KEYS.tags]) {
      const tags = safeParse<string[]>(data[KEYS.tags]);
      if (tags) setConfigTags(tags);
    }
    if (data[KEYS.workStatus]) {
      const w = safeParse<WorkStatusConfig>(data[KEYS.workStatus]);
      if (w) setWorkStatus({ ...getWorkStatus(), ...w });
    }
    if (data[KEYS.theme]) {
      setTheme(data[KEYS.theme] as ThemeMode);
    }
    applyTheme();
  } catch {
    // 离线或失败时保持本地设置不变
  }
}

/** 把当前本地设置批量上传到服务端 */
export async function saveSettingsToServer(): Promise<void> {
  try {
    await api.settings.updateAll({
      [KEYS.profile]: JSON.stringify(getProfile()),
      [KEYS.aiConfig]: JSON.stringify(getAIConfig()),
      [KEYS.tags]: JSON.stringify(getConfigTags()),
      [KEYS.workStatus]: JSON.stringify(getWorkStatus()),
      [KEYS.theme]: getTheme(),
    });
  } catch {
    // 失败时本地设置仍保留，下次再同步
  }
}
