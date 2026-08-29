import { useEffect, useState } from 'react';
import { AVATARS, getProfile, setProfile } from '../lib/profile';
import {
  getAIConfig,
  setAIConfig,
  normalizeAIUrl,
  type AIConfig,
  type GenFrequency,
  type GenMode,
} from '../lib/aiConfig';
import { callLLM } from '../lib/aiReport';
import { WorkStatusSettings } from './WorkStatusSettings';
import {
  addConfigTag,
  getConfigTags,
  removeConfigTag,
} from '../lib/tags';
import { getTheme, setTheme, type ThemeMode } from '../lib/theme';
import { loadSettingsFromServer, saveSettingsToServer } from '../lib/settingsSync';
import { getBase } from '../lib/api';

const electronAPI = (window as any).electronAPI;

export function SettingsModal({
  onClose,
  onLogout,
}: {
  onClose: () => void;
  onLogout: () => void;
}) {
  // —— 各操作项的就近提示状态 ——（每条保存/测试结果在自己下方显示）
  const [profileMsg, setProfileMsg] = useState('');
  const [widgetMsg, setWidgetMsg] = useState('');
  const [tagMsg, setTagMsg] = useState('');
  const [aiMsg, setAiMsg] = useState('');
  const [aiTestMsg, setAiTestMsg] = useState('');
  const [aiTesting, setAiTesting] = useState(false);

  // —— 外观（浅色 / 深色） ——
  const [theme, setThemeMode] = useState<ThemeMode>(getTheme());
  const changeTheme = (m: ThemeMode) => {
    setThemeMode(m);
    setTheme(m);
  };

  const flash = (setter: (v: string) => void, text: string) => {
    setter(text);
    setTimeout(() => setter(''), 4000);
  };

  // —— 个人资料 ——
  const profile = getProfile();
  const [avatar, setAvatar] = useState(profile.avatar || '🐮');
  const [name, setName] = useState(profile.name || '');
  const [workStart, setWorkStart] = useState(profile.workStart || '09:00');
  const [workEnd, setWorkEnd] = useState(profile.workEnd || '18:00');
  const saveProfile = () => {
    setProfile({ avatar, name: name.trim(), workStart, workEnd });
    flash(setProfileMsg, '个人资料已保存 🐮');
  };

  // —— 桌面小组件 ——
  const addWidget = () => {
    electronAPI?.openWidget?.();
    flash(setWidgetMsg, '已发送桌面小组件，请查看桌面右下角 🖥');
  };

  // —— 标签配置 ——
  const [tags, setTags] = useState<string[]>(getConfigTags());
  const [newTag, setNewTag] = useState('');
  const addTag = () => {
    const v = newTag.trim();
    if (!v) return;
    setTags(addConfigTag(v));
    setNewTag('');
    flash(setTagMsg, `标签「${v}」已添加 🏷`);
  };
  const delTag = (t: string) => {
    setTags(removeConfigTag(t));
    flash(setTagMsg, `标签「${t}」已删除`);
  };

  // —— AI 周报（DeepSeek）配置 ——
  const ai0 = getAIConfig();
  const [aiEnabled, setAiEnabled] = useState(ai0.enabled);
  const [aiKey, setAiKey] = useState(ai0.apiKey);
  const [aiUrl, setAiUrl] = useState(ai0.url);
  const [aiModel, setAiModel] = useState(ai0.model);
  const [aiTemp, setAiTemp] = useState(ai0.temperature);
  const [aiPrompt, setAiPrompt] = useState(ai0.prompt);
  const [aiSkills, setAiSkills] = useState(ai0.skills);
  const [aiGenMode, setAiGenMode] = useState<GenMode>(ai0.genMode);
  const [aiFrequency, setAiFrequency] = useState<GenFrequency>(ai0.genFrequency);
  const [aiGenTime, setAiGenTime] = useState(ai0.genTime);
  const [aiWeekday, setAiWeekday] = useState(ai0.genWeekday);
  const [aiInterval, setAiInterval] = useState(ai0.genInterval);

  const buildCfg = (): AIConfig => ({
    enabled: aiEnabled,
    apiKey: aiKey.trim(),
    url: normalizeAIUrl(aiUrl),
    model: aiModel.trim() || 'deepseek-chat',
    temperature: Number(aiTemp) || 0.7,
    prompt: aiPrompt,
    skills: aiSkills,
    genMode: aiGenMode,
    genFrequency: aiFrequency,
    genTime: aiGenTime,
    genWeekday: aiWeekday,
    genInterval: Math.max(1, Number(aiInterval) || 1),
    genLastAt: ai0.genLastAt,
  });

  const saveAI = () => {
    const cfg = buildCfg();
    setAIConfig(cfg);
    setAiUrl(cfg.url);
    const scheduleText =
      aiGenMode === 'event'
        ? '本周日报达到 5 条时立即生成'
        : `${aiFrequency === 'daily' ? '每日' : aiFrequency === 'weekly' ? '每周' : `每 ${cfg.genInterval} 天`} ${cfg.genTime} 生成`;
    flash(setAiMsg, `AI 周报配置已保存 · ${scheduleText} 🤖`);
  };

  const testAI = async () => {
    setAiTesting(true);
    flash(setAiTestMsg, '连接测试中…');
    try {
      const content = await callLLM(buildCfg(), [
        { role: 'user', content: '你好，请用一句话回复：连接成功' },
      ]);
      flash(setAiTestMsg, '测试成功 ✓ ' + content.slice(0, 40));
    } catch (e: any) {
      let msg = e?.message || '未知错误';
      if (msg.includes('404')) {
        msg += '。请检查：①接口地址是否以 /v1/chat/completions 结尾；②模型名称是否正确。';
      } else if (msg.includes('401')) {
        msg += '。请检查 API Key 是否正确。';
      }
      flash(setAiTestMsg, '测试失败：' + msg);
    } finally {
      setAiTesting(false);
    }
  };

  const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 打开设置时先从服务端拉取最新设置（多端同步）
  useEffect(() => {
    loadSettingsFromServer().then(() => {
      const p = getProfile();
      setAvatar(p.avatar || '🐮');
      setName(p.name || '');
      setWorkStart(p.workStart || '09:00');
      setWorkEnd(p.workEnd || '18:00');
      setThemeMode(getTheme());
      setTags(getConfigTags());
      const ai = getAIConfig();
      setAiEnabled(ai.enabled);
      setAiKey(ai.apiKey);
      setAiUrl(ai.url);
      setAiModel(ai.model);
      setAiTemp(ai.temperature);
      setAiPrompt(ai.prompt);
      setAiSkills(ai.skills);
      setAiGenMode(ai.genMode || 'timed');
      setAiFrequency(ai.genFrequency);
      setAiGenTime(ai.genTime);
      setAiWeekday(ai.genWeekday);
      setAiInterval(ai.genInterval);
    });
  }, []);

  const closeAndSync = async () => {
    await saveSettingsToServer();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={closeAndSync}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙ 设置中心</h3>

        <div className="modal-body">
          {/* 个人资料 */}
          <div className="set-section">
            <div className="set-section-title">🙂 个人资料</div>
            <div className="avatar-preview">{avatar}</div>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`avatar-opt ${avatar === a ? 'on' : ''}`}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>昵称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：打工の牛马"
              />
            </div>
            <div className="field">
              <label>上班时间</label>
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
              />
            </div>
            <div className="field">
              <label>下班时间（用于首页倒计时）</label>
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
              />
            </div>
            <p className="hint">
              上班时间之后 ~ 下班时间之前，首页显示「离下班还有 xx时xx分xx秒」；其余时间显示休息提示，提醒你别加班。
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={saveProfile} type="button">
                保存资料
              </button>
            </div>
            {profileMsg && <div className="hint set-inline-msg">{profileMsg}</div>}
          </div>

          {/* 外观：浅色 / 深色 */}
          <div className="set-section">
            <div className="set-section-title">🌗 外观</div>
            <p className="hint">选择浅色或深色风格，立即生效并记住你的选择。</p>
            <div className="theme-switch">
              <button
                type="button"
                className={`theme-opt ${theme === 'light' ? 'on' : ''}`}
                onClick={() => changeTheme('light')}
              >
                ☀ 浅色
              </button>
              <button
                type="button"
                className={`theme-opt ${theme === 'dark' ? 'on' : ''}`}
                onClick={() => changeTheme('dark')}
              >
                🌙 深色
              </button>
            </div>
          </div>

          {/* 工作状态 / 下班倒计时 */}
          <div className="set-section">
            <div className="set-section-title">⏰ 工作状态 / 下班倒计时</div>
            <p className="hint">
              设置当天工作状态（正常 / 加班 / 调休），或按日期预设未来的加班与调休；各状态文案可自定义。
            </p>
            <WorkStatusSettings />
          </div>

          {/* 桌面小组件（仅桌面端显示，移动端由用户在手机桌面自行配置） */}
          {electronAPI && (
          <div className="set-section">
            <div className="set-section-title">🖥 桌面小组件</div>
            <p className="hint">
              把「进行中」任务固定到桌面：嵌入桌面层（与壁纸同级），不悬浮遮挡应用。
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={addWidget} type="button">
                ＋ 添加到桌面
              </button>
            </div>
            {widgetMsg && <div className="hint set-inline-msg">{widgetMsg}</div>}
          </div>
          )}

          {/* 标签配置 */}
          <div className="set-section">
            <div className="set-section-title">🏷 标签配置</div>
            <p className="hint">
              这里的标签会出现在「新建 / 编辑任务」的标签下拉框里，只能从中选择。系统标签「父任务 / 子任务」会按是否为子任务自动添加，无需在此配置。
            </p>
            <div className="tag-config-list">
              {tags.length === 0 && <div className="hint">还没有配置标签，先在下方添加吧～</div>}
              {tags.map((t) => (
                <span className="tag-config-item" key={t}>
                  {t}
                  <button
                    type="button"
                    className="tag-chip-x"
                    aria-label={`删除标签 ${t}`}
                    onClick={() => delTag(t)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="tag-config-add">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="新标签名称"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTag();
                }}
              />
              <button className="btn primary" type="button" onClick={addTag}>
                添加
              </button>
            </div>
            {tagMsg && <div className="hint set-inline-msg">{tagMsg}</div>}
          </div>

          {/* AI 周报（DeepSeek）配置 */}
          <div className="set-section">
            <div className="set-section-title">🤖 AI 周报（DeepSeek）</div>
            <p className="hint">
              接入兼容 OpenAI 协议的大模型（如 DeepSeek），按设定时间自动生成本周周报。前提：本周日报需 ≥ 5 条。
            </p>
            <div className="ai-switch-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
                <span className="slider" />
              </label>
              <span>启用自动生成</span>
            </div>

            <div className="field">
              <label>触发方式</label>
              <select value={aiGenMode} onChange={(e) => setAiGenMode(e.target.value as GenMode)}>
                <option value="timed">定时触发（到设定时间且本周日报 ≥ 5 条时生成）</option>
                <option value="event">事件触发（本周日报达到 5 条时立即生成）</option>
              </select>
              <p className="hint">
                {aiGenMode === 'timed'
                  ? '到达下方配置的生成周期与时刻，且本周已有 5 条日报时，才自动生成周报。'
                  : '无需等待指定时间，一旦本周日报累计达到 5 条，立即自动生成周报。'}
              </p>
            </div>

            <div className="field">
              <label>API Key</label>
              <input
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="field">
              <label>接口地址（自动补齐 /v1/chat/completions）</label>
              <input
                value={aiUrl}
                onChange={(e) => setAiUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1/chat/completions"
              />
              <p className="hint">例如：https://api.deepseek.com/v1/chat/completions</p>
            </div>
            <div className="field-row">
              <div className="field">
                <label>模型</label>
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="deepseek-chat"
                  list="ai-models"
                />
                <datalist id="ai-models">
                  <option value="deepseek-chat" label="DeepSeek V3（通用对话）" />
                  <option value="deepseek-reasoner" label="DeepSeek R1（推理）" />
                  <option value="deepseek-coder" label="DeepSeek Coder" />
                </datalist>
              </div>
              <div className="field field-sm">
                <label>温度（0~1）</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={aiTemp}
                  onChange={(e) => setAiTemp(Number(e.target.value))}
                />
              </div>
            </div>

            {/* 周期 + 时刻 */}
            <div className="field-row">
              <div className="field">
                <label>生成周期</label>
                <select
                  value={aiFrequency}
                  onChange={(e) => setAiFrequency(e.target.value as GenFrequency)}
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周某天</option>
                  <option value="custom">自定义间隔（每 N 天）</option>
                </select>
              </div>
              <div className="field">
                <label>触发时刻</label>
                <input
                  type="time"
                  value={aiGenTime}
                  onChange={(e) => setAiGenTime(e.target.value)}
                />
              </div>
            </div>
            {aiFrequency === 'weekly' && (
              <div className="field">
                <label>每周几触发</label>
                <select
                  value={aiWeekday}
                  onChange={(e) => setAiWeekday(Number(e.target.value))}
                >
                  {weekdayLabels.map((w, i) => (
                    <option value={i} key={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {aiFrequency === 'custom' && (
              <div className="field field-sm">
                <label>每多少天生成一次</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={aiInterval}
                  onChange={(e) => setAiInterval(Number(e.target.value))}
                />
              </div>
            )}

            <div className="field">
              <label>提示词（系统级要求）</label>
              <textarea
                rows={4}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="你是一名严谨的周报助理……"
              />
            </div>
            <div className="field">
              <label>技能 / 附加指令（Skills，可留空）</label>
              <textarea
                rows={3}
                value={aiSkills}
                onChange={(e) => setAiSkills(e.target.value)}
                placeholder="例如：重点关注设备监测与数转报价进展；输出不超过 8 条分点"
              />
            </div>

            <div className="btn-row">
              <button className="btn" onClick={testAI} disabled={aiTesting} type="button">
                {aiTesting ? '测试中' : '测试连接'}
              </button>
              <button className="btn primary" onClick={saveAI} type="button">
                保存 AI 配置
              </button>
            </div>
            {aiTestMsg && <div className="hint set-inline-msg">{aiTestMsg}</div>}
            {aiMsg && <div className="hint set-inline-msg">{aiMsg}</div>}
          </div>

          {/* 服务器配置：登录后如需修改 API 地址，可通过登录页「配置服务器」或退出登录后再次访问 */}
          <div className="set-section">
            <div className="set-section-title">🌐 服务器配置</div>
            <p className="hint">
              服务器地址仅在登录前可配置；当前已连接到 <code>{getBase()}</code>。
              如需切换服务器，请先退出登录。
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <div className="btn-row">
            <button className="btn danger" onClick={onLogout} type="button">
              退出登录
            </button>
            <button className="btn" onClick={closeAndSync} type="button">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}