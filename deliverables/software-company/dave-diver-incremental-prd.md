# 🐮🐴的打工日志 · 增量产品需求文档（PRD）

## 1. 项目信息

| 项 | 内容 |
| --- | --- |
| 语言 | 中文 |
| 编程语言/技术栈 | Vite + React 18 + TypeScript；Electron（PC exe）；Capacitor（Android apk）；Fastify + PostgreSQL 后端 |
| 项目名称 | `dave_diver_tasks`（代码仓库：`dave-diver-tasks`） |
| 原始需求 | 在已有任务清单、报告、日历、设置、桌面小组件、提醒双通道等能力基础上，新增 5 项增量功能：① 移动端提醒弹窗；② 报告页返回顶部；③ 启动加载动画；④ 任务卡片视觉优化；⑤ 习惯打卡功能（含 Android 2×2 圆形桌面小组件与桌面小组件展示）。 |

## 2. 产品定义

### 2.1 Product Goals

1. **提升移动端提醒触达体验**：在 Android 应用内增加强提醒弹窗，确保用户在 App 打开时也能被任务到期时间准确打断，降低漏提醒率。
2. **优化长页面浏览效率**：在报告页增加返回顶部入口，减少用户在日报/周报列表中反复滑动的操作成本。
3. **强化品牌一致性与启动感知**：将启动页/启动动画统一为橘黄色墨镜牛马图标，覆盖 Android 原生启动屏与 Electron 桌面端启动体验。
4. **改善任务信息密度与可读性**：在不改变四段式卡片结构的前提下，通过间距、字体、色彩、状态反馈等视觉细节让任务卡片更饱满、更易扫描。
5. **拓展习惯养成场景**：新增习惯打卡核心链路（创建 → 提醒 → 打卡 → 统计 → 桌面小组件快捷打卡），并通过云端同步实现多端数据一致。

### 2.2 User Stories

1. 作为一名 **Android 用户**，当我在应用内时收到任务提醒弹窗，我希望弹窗居中显示并提供「知道了」与「10分钟后提醒」两个明确选项，以便快速处理或延后提醒。
2. 作为一名 **经常查看报告的用户**，当我滚动到报告页底部时，我希望看到一个返回顶部按钮，点击后能快速回到页面顶部，以便继续筛选或新建报告。
3. 作为一名 **每天打开 App 的用户**，我希望启动页展示橘黄色墨镜牛马图标，而不是白屏或默认加载，以获得更鲜明的品牌印象。
4. 作为一名 **任务清单重度用户**，我希望任务卡片的标题、标签、步骤、操作按钮在视觉上更有层次，空状态更友好，深色/浅色主题下都舒适可读。
5. 作为一名 **希望培养习惯的用户**，我希望创建每日习惯并设置提醒，在 App 内查看月历打卡记录，并能通过 Android 桌面 2×2 圆形小组件一键打卡/取消打卡，数据与其他端保持同步。

## 3. 需求池（P0 / P1 / P2）

### 3.1 移动端提醒弹窗

| 优先级 | 需求项 | 验收要点 |
| --- | --- | --- |
| P0 | 弹窗居中显示 | 在 Android（Capacitor）应用内，提醒弹窗必须水平/垂直居中覆盖当前页面，背景半透明遮罩，禁止点击外部关闭。 |
| P0 | 「知道了」按钮 | 点击后关闭弹窗，并关闭当前提醒窗口/覆盖层；该提醒当天不再以应用内弹窗形式重复触发。 |
| P0 | 「10分钟后提醒」按钮 | 点击后关闭弹窗/窗口，并重新 scheduling 一条 10 分钟后的提醒；到点后再次弹出同一提醒。 |
| P1 | 桌面端不受影响 | Electron 桌面端保持现有右下角独立提醒窗口逻辑，按钮与交互不变。 |
| P1 | 品牌与无障碍 | 弹窗标题保持「牛马的提醒」或统一文案，按钮字体 ≥ 16px，支持 TalkBack 读取按钮含义。 |
| P2 | 震动/音效反馈 | 弹窗出现时可选轻微震动 + 电子音效，与现有提醒音效风格一致。 |

### 3.2 报告页「返回顶部」按钮

| 优先级 | 需求项 | 验收要点 |
| --- | --- | --- |
| P0 | 悬浮/固定按钮 | 在 `ReportsView` 页面右下角（或其他不遮挡核心操作的位置）展示返回顶部按钮，滚动超过一屏（约 400px）时显示。 |
| P0 | 平滑/直接回顶 | 点击后滚动至页面最顶部；移动端使用 `window.scrollTo({ top: 0, behavior: 'smooth' })`，桌面端同理。 |
| P0 | 双端适配 | 同时适配移动端（小屏、底部 tab 栏避让）与桌面端（自定义标题栏、滚动区域）。 |
| P1 | 显隐动效 | 按钮出现/隐藏带 200ms 透明度过渡，避免突兀跳动。 |
| P2 | 滚动进度提示 | 可选在按钮上或附近显示当前滚动进度百分比。 |

### 3.3 启动加载动画

| 优先级 | 需求项 | 验收要点 |
| --- | --- | --- |
| P0 | Android 启动页 | 替换 `android/app/src/main/res/drawable*` 各密度下的 `splash.png`，使用橘黄色墨镜牛马图标（源文件：`public/icon.png` / `public/icon-android-foreground.png`），并在 `styles.xml` 的 `AppTheme.NoActionBarLaunch` 中正确引用。 |
| P0 | Electron 启动体验 | 主窗口 `createWindow` 加载 `index.html` 前，先展示一个无边框 Splash 窗口（居中、固定尺寸、品牌背景色），加载完成后关闭并显示主窗口；或采用 HTML 内嵌启动动画（需保证首屏白屏时间 < 300ms）。 |
| P1 | 启动时长控制 | 启动动画/启动屏展示 1.5–2.5 秒，或在主窗口 `did-finish-load` 后自动消失，以较晚者为准。 |
| P1 | 图标尺寸规范 | Android 启动图标在不同密度下清晰无拉伸，推荐以图标为中心、四周留白 ≥ 20%。 |
| P2 | 启动页动效 | Electron 端可加入图标轻微缩放/呼吸动画；Android 端保持静态启动图以遵循系统规范。 |

### 3.4 任务卡片视觉优化

| 优先级 | 需求项 | 验收要点 |
| --- | --- | --- |
| P0 | 保持四段式结构 | 第 1 段标题、第 2 段标签、第 3 段步骤、第 4 段操作按钮的结构不变，避免破坏现有拖拽/展开/子任务逻辑。 |
| P0 | 间距与字体层次 | 标题字号 ≥ 15px、行高 1.4；标签字号 11–12px；步骤区与标题区增加 8–12px 分隔；卡片内边距统一为 12–14px。 |
| P0 | 双主题兼容 | 所有颜色必须使用 CSS 变量，确保深色/浅色主题下对比度 ≥ 4.5:1；完成状态、延期状态、悬停/按态均有明确视觉区分。 |
| P1 | 图标与空状态 | 操作按钮使用风格统一的像素/游戏感图标；无步骤时隐藏步骤区，无标签时不显示空标签占位。 |
| P1 | 悬停/按态 | 桌面端悬停时卡片轻微上浮/阴影加深；移动端按下时背景色变化 100–150ms，提供明确触感反馈。 |
| P2 | 优先级色带优化 | 左侧色带宽度统一为 4px，圆角与卡片一致；无优先级时显示分类色或默认灰，避免色带「断掉」。 |

### 3.5 习惯打卡功能

| 优先级 | 需求项 | 验收要点 |
| --- | --- | --- |
| P0 | 习惯创建 | 支持创建习惯：名称（必填）、图标/颜色（可选）、每日提醒时间（可选）、开始日期（默认今天）。 |
| P0 | 习惯列表 | 在底部导航新增「习惯」入口，列表展示今日待打卡习惯、累计打卡次数、当前连续天数。 |
| P0 | 习惯详情/日历打卡页 | 参考用户截图：深色卡片顶部展示「月打卡 / 总打卡 / 月完成率 / 当前连续」四项统计；中部为月历，已打卡日期高亮；底部为当月打卡日志。 |
| P0 | 云端同步 | 习惯数据与打卡记录通过 Fastify + PostgreSQL 存储，登录后自动同步，离线时本地缓存、联网后合并。 |
| P1 | Android 2×2 圆形桌面小组件 | 点击小组件即为当日打卡一次；再次点击取消当日打卡；每天仅可打卡一次（以设备本地日期为准）；次日 00:00 自动开启新一天打卡；圆形中心显示习惯名称与累计打卡次数。 |
| P1 | 桌面小组件展示 | 现有桌面小组件支持展示指定习惯的今日打卡状态与累计次数（读取云端 API）。 |
| P1 | 每日打卡提醒 | 按用户设置的提醒时间，通过移动端系统通知 + 应用内提醒双通道推送习惯打卡提醒。 |
| P2 | 习惯统计图表 | 在详情页展示近 7 天 / 近 30 天打卡趋势 mini 图表。 |

## 4. UI/UX 要点

### 4.1 移动端提醒弹窗

- **位置**：`position: fixed; inset: 0; display: flex; align-items: center; justify-content: center`，遮罩 `rgba(0,0,0,0.55)`。
- **尺寸**：宽度 ≤ 80% 屏幕宽，最大 320px；高度自适应。
- **按钮布局**：两个按钮纵向或横向并排，主按钮「知道了」使用品牌绿/主色，次按钮「10分钟后提醒」使用中性色。
- **文案**：弹窗标题「牛马的提醒」，副标题显示习惯/任务名称，按钮文案不可省略为「取消/确定」。

### 4.2 报告页返回顶部

- **位置**：固定于 `ReportsView` 可视区域右下角，移动端 `bottom: 80px`（避让底部 tab），桌面端 `bottom: 24px`。
- **样式**：圆形按钮，直径 44px，背景品牌绿，白色向上箭头图标，阴影 `var(--shadow)`。
- **触发条件**：滚动距离 > 400px 显示，回顶后隐藏。

### 4.3 启动加载动画

- **Android**：使用 `Theme.SplashScreen` + `@drawable/splash`，背景色与 App 主背景色 `--sea-bg` 一致（`#d7ece4`），图标居中，不额外添加文字。
- **Electron**：新增 `SplashWindow`（400×400 或按图标比例），背景 `#d7ece4`，中央展示橘黄色墨镜牛马图标，底部可选加载点动画；主窗口加载完成后 `splash.destroy()`。

### 4.4 任务卡片视觉优化

- **卡片外框**：圆角保持 `var(--radius)`（16px），背景 `var(--card)`，边框 1px `var(--card-border)`，阴影 `var(--shadow)`。
- **标题区**：勾选框 22px，优先级旗与标题同行；标题使用 `font-weight: 700`。
- **标签区**：分类 chip、优先级 chip、进度、标签之间 gap 6px；标签使用圆角 pill 样式。
- **步骤区**：左侧步骤按钮 24px，当前步骤高亮，已完成步骤置灰加删除线。
- **操作区**：四个图标按钮统一 32px，间距 8px，hover 时背景色变化。

### 4.5 习惯打卡

- **列表项**：左侧习惯图标/颜色块，中间名称与今日状态，右侧今日打卡按钮（已打卡显示 ✓）。
- **详情页**：顶部统计卡片 2×2 网格；月历每个日期为圆形，当天蓝边高亮，已打卡填充品牌绿。
- **桌面小组件**：2×2 圆形 widget，外圈进度环（今日已打卡 100%，未打卡 0%），中心显示习惯名称（最多 4 字截断）与累计次数。

## 5. 数据模型建议

### 5.1 新增数据表

#### habits（习惯表）

```sql
CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT DEFAULT '#f5a623',        -- 习惯主题色，默认橘黄
  icon TEXT DEFAULT '🔥',              -- emoji 或图标标识
  reminder_at TIME,                    -- 每日提醒时间，可选
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### habit_checkins（习惯打卡记录表）

```sql
CREATE TABLE habit_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, check_date)         -- 每天仅一条打卡记录
);
```

### 5.2 索引建议

```sql
CREATE INDEX idx_habits_user ON habits(user_id);
CREATE INDEX idx_habit_checkins_habit_date ON habit_checkins(habit_id, check_date);
CREATE INDEX idx_habit_checkins_user_date ON habit_checkins(user_id, check_date);
```

### 5.3 前端类型扩展（src/types.ts）

```ts
export interface Habit {
  id: string;
  user_id: string;
  title: string;
  color: string;
  icon: string;
  reminderAt: string | null; // HH:mm
  startDate: string;         // YYYY-MM-DD
  createdAt: string;
  updatedAt?: string;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  userId: string;
  checkDate: string; // YYYY-MM-DD
  createdAt: string;
}
```

## 6. 接口需求

### 6.1 习惯接口

| 方法 | 路径 | 说明 | 请求体 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/habits` | 获取当前用户全部习惯 | - | `Habit[]` |
| POST | `/habits` | 创建习惯 | `{ title, color?, icon?, reminderAt?, startDate? }` | `Habit` |
| GET | `/habits/:id` | 获取单个习惯详情 | - | `Habit` |
| PUT | `/habits/:id` | 更新习惯 | `{ title?, color?, icon?, reminderAt?, startDate? }` | `Habit` |
| DELETE | `/habits/:id` | 删除习惯（级联删除打卡记录） | - | `{ ok: true }` |

### 6.2 打卡接口

| 方法 | 路径 | 说明 | 请求体 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/habits/:id/checkin` | 为某日打卡 | `{ checkDate: 'YYYY-MM-DD' }` | `HabitCheckin` |
| DELETE | `/habits/:id/checkin/:date` | 取消某日打卡 | - | `{ ok: true }` |
| GET | `/habits/:id/checkins` | 获取某习惯打卡记录 | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | `HabitCheckin[]` |
| GET | `/habits/stats` | 获取习惯的聚合统计 | - | `{ habitId: { total, currentStreak, monthlyCount, monthlyRate } }[]` |

### 6.3 接口约束

- 所有 `/habits*` 路由需 JWT 鉴权，与现有 `/tasks*` 保持一致。
- `checkDate` 必须 ≥ `habit.start_date`，且同一天同一习惯仅允许一条记录（通过数据库唯一约束 + 接口幂等处理）。
- 删除习惯时必须校验 `user_id`，防止越权。

## 7. 验收标准

### 7.1 通用验收

1. 所有新增功能在深色/浅色双主题下正常显示，无样式崩坏。
2. 所有新增功能在 Android apk 与 Electron exe 上分别验证通过。
3. 未登录状态下，习惯、报告、任务相关功能均不报错，并按现有逻辑引导登录。

### 7.2 功能逐项验收

| 功能 | 验收标准 |
| --- | --- |
| 移动端提醒弹窗 | ① Android 真机/模拟器到点后弹窗居中；② 点击「知道了」弹窗消失且当天不再弹；③ 点击「10分钟后提醒」10 分钟后再次弹窗；④ Electron 端交互与文案不变。 |
| 报告页返回顶部 | ① 报告列表滚动超过 400px 按钮出现；② 点击后页面回到顶部；③ 移动端不遮挡底部 tab；④ 桌面端不遮挡报告操作按钮。 |
| 启动加载动画 | ① Android 冷启动显示橘黄色墨镜牛马图标，无白屏；② Electron 启动时显示启动窗口/动画，主窗口加载完成后切换；③ 各密度图标清晰。 |
| 任务卡片视觉优化 | ① 四段式结构完整；② 卡片不显得空旷，信息层级清晰；③ 完成/延期/悬停/按态视觉明确；④ 深浅主题均通过视觉走查。 |
| 习惯打卡 | ① 可创建/编辑/删除习惯；② 列表/详情/日历页数据正确；③ 打卡/取消打卡云端同步；④ Android 2×2 圆形小组件点击可打卡/取消，次日重置；⑤ 桌面小组件可读取习惯数据。 |

## 8. 待确认问题

1. **习惯提醒与任务提醒的冲突策略**：当 habit 提醒时间与 task 提醒时间重叠时，是否允许同时弹出两个提醒？是否需要合并为一条通知？
2. **习惯桌面小组件的权限与刷新**：Android 12+ 对小组件点击事件、精确闹钟权限（`SCHEDULE_EXACT_ALARM`）和后台刷新有何要求？是否需要申请新权限？
3. **Electron 启动动画形式**：优先采用独立 Splash 窗口，还是直接在 `index.html` 中做首屏动画？后者更简单但需确保白屏时间可控。
4. **习惯跨天判定**：打卡以服务器时间还是设备本地时间为准？多设备登录时如何冲突处理（例如手机已打卡，电脑端缓存未刷新）？
5. **任务卡片「更饱满」的具体方向**：是否接受卡片高度增加以容纳更多信息（如显示创建时间、截止日期），还是仅在现有内容内优化排版？
6. **返回顶部按钮的常驻策略**：是否需要在所有长页面（任务列表、日历）均添加返回顶部，还是仅报告页？
7. **习惯数据来源**：习惯图标是否复用现有分类/标签的 emoji 池，还是允许用户自定义上传/选择？

---

*文档版本：v1.0*  
*编制：产品经理 许清楚*  
*日期：2026-08-24*
