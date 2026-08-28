# 🐮🐴的打工日志 · Android APK 构建与安装指南（完整详细版）

> 目标：把本项目打包成一个 `app-debug.apk`，传到安卓手机上安装就能用，数据走你自己的阿里云后端。
> 适用：你自己的 **Windows 电脑**（Node.js 已装好，项目代码已克隆/拷贝到本机，例如 `D:\dave-diver-tasks`）。
> 全程预计：首次约 30~60 分钟（主要在下载 Android Studio / SDK / Gradle），之后每次重新打包约 3~5 分钟。

---

## 〇、先讲清楚三件事（避免走弯路）

1. **打包工具是 Capacitor**：本项目用 `@capacitor/android` 把前端（Vite 产物）套一层安卓原生壳，最终由 Android 官方工具 Gradle 打出 APK。你不需要写 Java，但**必须装 Android 官方工具链**（最省心的是装 Android Studio，它自带 JDK 和 SDK）。
2. **后端地址是 http 明文**：你的后端是 `http://8.163.32.86:8787`。Android 9 以上默认禁止 App 访问明文 http，所以**必须**在安卓工程里放开明文访问（第⑥步），否则手机上会连不上后端、一直转圈。
3. **分两步理解**：
   - 「生成安卓工程 + 同步代码」只要做一次（`cap:add` + `cap:sync`）；
   - 之后你只要**改了前端代码 → 重新 `cap:sync` → 重新 Build APK** 即可，无需重装 Android Studio。

---

## 整体流程一览

```
① 装 Android Studio（自带 JDK + SDK，最省心）
② 在 SDK Manager 里装 Android 14 (API 34) + Build-Tools + Platform-Tools
③ 配置环境变量 ANDROID_HOME / Path
④ 项目里生成安卓工程： npm run cap:add
⑤ 同步前端代码到安卓：   npm run cap:sync
⑥ 放开 http 明文访问（关键！否则手机连不上后端）
⑦ 构建 APK（Android Studio 图形界面，最省心）
⑧ 安装到手机 + App 里填后端地址
⑨（以后）代码改了怎么重新出包
```

---

## ① 安装 Android Studio（推荐，自带 JDK 和 SDK）

1. 官网下载：<https://developer.android.com/studio>（国内若打不开，可搜「Android Studio 国内镜像下载」）。
2. 双击安装，到 **Choose Components** 这一步**全部勾选**（默认含 Android Studio + Android SDK + AVD 模拟器）。
3. 到 **SDK Components Setup**（安装路径设置）这步：
   - **Android SDK 路径**改成你想要的盘，例如：`D:\Android\Sdk`（建议放在非系统盘、路径**不要含中文和空格**）。
   - JDK 它会自带（Embedded JDK），**不用单独装**。
4. 一路 Next 装完，启动 Android Studio（首次启动会再下载一些组件，耐心等）。

> 如果你实在不想装 Android Studio（体积大），也可以只装「Command-line Tools + 单独 JDK 17」，但新手强烈建议用 Android Studio，后面图形点几下就出包。本指南以 Android Studio 为主路线。

## ② 装 Android 14 (API 34) 平台与工具

1. Android Studio 打开后，点右上角 **SDK Manager**（扳手+安卓小人图标），或菜单 `File → Settings → Android SDK`。
2. **SDK Platforms** 标签页：勾选 **Android 14 (API 34)**（也可顺手勾 Android 13/15，兼容更广）。
3. **SDK Tools** 标签页，确保勾选以下三项（没有就勾上）：
   - `Android SDK Build-Tools`（选 34.x 最新版）
   - `Android SDK Platform-Tools`
   - `Android SDK Command-line Tools (latest)`
4. 点 **Apply**，等待下载安装（几百 MB，需联网）。

## ③ 配置环境变量（Windows）

1. 桌面「此电脑」右键 → **属性** → **高级系统设置** → **环境变量**。
2. 在「系统变量」点 **新建**：
   - 变量名：`ANDROID_HOME`
   - 变量值：`D:\Android\Sdk`（和你第①步装的路径一致）

   > ⚠️ **变量名最容易出错的地方**：变量名只能是大写英文字母 + 下划线，**不要带任何标点或反引号**。
   > 曾经有用户把变量名写成了 `ANDROID_HOME``（末尾多了一个反引号 `` ` ``），系统识别不到，导致 `%ANDROID_HOME%` 解析为空、执行 `adb` 报「不是内部或外部命令」。
   > 如果发现怎么配 `adb` 都找不到，请到「环境变量」里检查变量名**逐字符**是否是纯 `ANDROID_HOME`，把带多余符号的那个删掉重建即可。

3. 再次点 **新建**（这是第二个环境变量，不是 Path）：
   - 变量名：`JAVA_HOME`
   - 变量值：你 Android Studio 里选中的 Gradle JDK 路径，例如 `C:\Users\72980\.jdks\jbr-17.0.14`（或你后来自己装的 JDK 17 目录）

   > 为什么要配 `JAVA_HOME`：命令行运行 `gradlew.bat` 构建 APK 时，脚本会先检查这个变量；Android Studio 虽然有自己的 Gradle JDK 设置，但缺少系统 `JAVA_HOME` 时也可能导致 Gradle daemon 初始化失败，从而报出 `prepareKotlinBuildScriptModel not found` 等表面错误。

4. 找到系统变量里的 `Path`，双击编辑 → **新建** 三行：
   - `%ANDROID_HOME%\platform-tools`
   - `%ANDROID_HOME%\cmdline-tools\latest\bin`
   - `%JAVA_HOME%\bin`
5. 确定保存，**重启一个命令行窗口**让变量生效。

> 💡 **快速验证 adb 本身是否完好（与配置无关）**：直接用绝对路径跑
> ```bat
> "C:\Users\你的用户名\AppData\Local\Android\Sdk\platform-tools\adb.exe" --version
> ```
> 若绝对路径能出版本号、但 `adb` 不行，就说明是环境变量没配好（变量名/Path 问题）；若绝对路径都报错 `系统找不到指定的文件`，说明 `platform-tools` 没装上，回第②步重装。

验证（新开 cmd / PowerShell）：

```bat
adb --version
java -version
```

两个都能显示版本号（`adb` 和 `java`），就说明配好了。

---

## ④ 生成安卓工程（首次，只需一次）

在本机项目目录打开终端（cmd 或 PowerShell），进入项目根目录：

```bat
cd D:\dave-diver-tasks
npm install
npm run cap:add
```

- `cap:add` 会生成 `android/` 目录（安卓原生工程），**只需生成一次**。
- 如果提示 `cap` 不是命令，先执行 `npm install -g @capacitor/cli` 再试。
- 如果提示 `android` 已存在，说明之前生成过，直接跳过这步即可。
- 生成后，`android/app/src/main/res/values/strings.xml` 里的 `app_name` 会自动取 `capacitor.config.ts` 里的 `appName`（当前为「🐮🐴的打工日志」）。若你的手机桌面图标下方的名字显示异常，可手动改这个文件里的 `app_name`。

## ⑤ 同步前端代码到安卓

```bat
npm run cap:sync
```

这条命令会做两件事：先 `vite build` 打包前端 → 再把 `dist/` 复制到 `android/app/src/main/assets/public/`。
**以后你只要改了前端代码（如新增了「工作状态配置」功能），重新跑这条即可把最新代码同步进安卓工程。**

> 小提示：在极少数的受限环境里（例如本项目的 AI 开发会话沙箱有「禁止删除」钩子），`vite build` 清理旧 `dist` 时可能被拦截。在你**自己普通的 Windows 电脑上直接运行即可**，不受此限制。
>
> 💡 **国内网络加速**：本项目已把 `android/build.gradle` 的仓库改为优先走阿里云镜像，并把 `gradle-wrapper.properties` 的 Gradle 下载地址改为腾讯云镜像。如果你仍遇到依赖下载失败，参考第⑩排错表「Build 卡在 downloading gradle」条目处理。

## ⑥ 放开 http 明文访问（非常重要，否则手机连不上后端）

你的后端地址是 `http://8.163.32.86:8787`（http 明文）。不放开的话，手机上 App 会连不上后端、一直转圈。

**修改文件**：`android/app/src/main/AndroidManifest.xml`

在 `<application ...>` 标签里加上这一句属性：

```xml
android:usesCleartextTraffic="true"
```

改完大致长这样（只示意关键行）：

```xml
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"
    android:theme="@style/AppTheme"
    android:usesCleartextTraffic="true">
```

> 只要后端还是 `http://IP`，这句就必须加。若日后后端换成 https 子域名，则可去掉。
>
> 💡 进阶（可选，更安全）：不想全局放开明文，也可只允许你的 IP。在 `android/app/src/main/res/xml/` 下新建 `network_security_config.xml`：
> ```xml
> <?xml version="1.0" encoding="utf-8"?>
> <network-security-config>
>     <domain-config cleartextTrafficPermitted="true">
>         <domain includeSubdomains="true">8.163.32.86</domain>
>     </domain-config>
> </network-security-config>
> ```
> 再在 Manifest 的 application 里加 `android:networkSecurityConfig="@xml/network_security_config"`。新手直接加 `usesCleartextTraffic="true"` 最简单。

> 另外确认 `AndroidManifest.xml` 里包含联网权限（Capacitor 默认已加，若没有就手动加一行）：
> ```xml
> <uses-permission android:name="android.permission.INTERNET" />
> ```

### 额外检查：`capacitor.config.ts` 的 `androidScheme`

如果你的后端是 `http://` 明文，Capacitor App 的 WebView scheme 也建议设为 `http`，避免 **https origin 请求 http 后端被 Mixed Content 策略拦截**（会直接报 `Failed to fetch`，且请求到不了服务器）。

确认项目根目录 `capacitor.config.ts` 里：

```ts
server: {
  androidScheme: 'http',
},
```

如果设成 `https`，App 的 origin 是 `https://localhost`，去请求 `http://8.163.32.86:8787` 会被浏览器安全策略拦截。除非后端也是 https，否则请保持 `http`。

---

## ⑦ 构建 APK

### 方式 A：用 Android Studio（最省心，推荐）

1. Android Studio 菜单 `File → Open`，选择项目里的 `android` 文件夹打开。
2. 第一次打开会下载 Gradle（几百 MB，较慢，耐心等，别关窗口）。底部出现 `Gradle sync finished` 即就绪。
3. 菜单 `Build → Build APK(s)`（注意不是 `Build Bundle(s)`；APK 才能直接传手机装，`aab` 是上架商店用的）。
4. 构建完成后，右下角弹出提示，点 **locate** 或在文件路径找到：
   ```
   android\app\build\outputs\apk\debug\app-debug.apk
   ```

### 方式 B：命令行（你已有 gradlew）

在项目根目录的终端里：

```bat
npm run apk:debug
```

成功后 apk 在：

```
android\app\build\outputs\apk\debug\app-debug.apk
```

> 首次构建要联网下载 Gradle 和依赖，可能要几分钟。卡住就多等，或看报错信息。

---

## ⑧ 安装到手机 + 配置后端

1. 把 `app-debug.apk` 传到手机（微信文件传输 / 数据线拷贝 / U 盘都行），在手机上点击安装。
   - 首次安装可能提示「允许安装未知来源应用」，按提示开启对应来源的权限即可。
   - 若提示「版本冲突 / 已安装同名应用」，先卸载旧版再装。
2. 打开 App → 在登录页或设置（⚙）里 **配置服务器**，填写你的后端地址：
   ```
   http://8.163.32.86:8787
   ```
3. 点「测试连接」，通过后注册 / 登录，数据就存进你的阿里云 RDS 了。

> 手机和电脑**必须在同一网络能访问该后端 IP**（手机用流量时，需后端公网可达；本例 `8.163.32.86` 已是公网 IP，手机流量/WiFi 均可，只要不被运营商/防火墙拦）。

---

## ⑨ 以后代码改了，怎么重新出包（迭代流程）

假设你又改了前端功能（比如调整了「工作状态配置」文案），重新出包只需 3 步：

```bat
cd D:\dave-diver-tasks
npm run cap:sync      # 重新打包前端并同步进 android/（第⑥步的明文配置仍在，无需重改）
```

然后回到 **Android Studio → Build → Build APK(s)**（或命令行 `npm run apk:debug`），拿到新的 `app-debug.apk` 传手机覆盖安装即可。

> 注意：`cap:sync` 每次都会用最新 `dist` 覆盖安卓工程里的 `assets/public`，但**不会**动你手动改过的 `AndroidManifest.xml`（明文配置保留）。只有当你执行 `npx cap sync --force` 或删了 `android/` 重新 `cap:add` 时才需要重做第⑥步。

---

## ⑩（可选）打出「正式签名版」APK / AAB

`app-debug.apk` 是调试包，能正常用，但不能上架应用商店。若要分发得更正式或上架：

- **正式签名 APK**：Android Studio 菜单 `Build → Generate Signed Bundle / APK` → 选 APK → 新建/选择你的签名密钥（jks）→ 选 `release` → 产出 `android\app\release\app-release.apk`。
- **上架商店用 AAB**：同上流程选 `Android App Bundle`，产出 `.aab`（Google Play 要求）。
- 签名密钥（`*.jks`）请妥善保管，**丢失将无法更新已上架的 App**。

---

## 常见问题（排错表）

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `cap` 不是命令 | 没装 CLI | `npm install -g @capacitor/cli` |
| Build 报 `SDK location not found` | `ANDROID_HOME` 没配或路径错 | 回到第③步检查环境变量，重启终端 |
| `adb` 报「不是内部或外部命令」/ `cannot be recognized` | 环境变量未生效，或 `ANDROID_HOME` 变量名带多余字符（如反引号） | 第③步里用绝对路径验证 adb 是否完好；检查变量名是否为纯 `ANDROID_HOME`、Path 两行是否完整；**务必关掉所有终端重开** |
| `Incompatible Gradle JVM version`（Gradle 8.2.1 incompatible with JVM 25/xx） | Gradle 版本与当前选中的 JDK 版本不兼容 | `Settings → Build Tools → Gradle → Gradle JDK` 选择 **JDK 17**（或 Android Studio 自带的 `jbr-17`），然后重新 Sync；若没有 JDK 17 则去 <https://adoptium.net/zh-CN/temurin/releases/?version=17> 下载安装 |
| 手机上 App 连后端一直转圈 / `Failed to fetch` | ① 没放开 http 明文；② `capacitor.config.ts` 的 `androidScheme` 为 `https` 但后端是 `http`，被 Mixed Content 拦截；③ 后端 CORS 白名单未包含 App 的 origin | ① 回到第⑥步加 `usesCleartextTraffic="true"`；② `capacitor.config.ts` 里 `androidScheme` 改为 `'http'` 后重新 `cap:sync` + Build；③ 检查服务器 `.env` 的 `CORS_ORIGINS` 是否包含 `"http://localhost"`，并 `pm2 stop` 后 `pm2 start ecosystem.config.cjs` 重载配置 |
| Build 卡在 `downloading gradle` 或报 `prepareKotlinBuildScriptModel not found` | 首次联网下载 Gradle/依赖，国内访问官方仓库慢/失败 | 项目已配置阿里云镜像 + 腾讯云 Gradle 镜像；若仍失败，可手动浏览器下载 <https://mirrors.cloud.tencent.com/gradle/gradle-8.2.1-all.zip> 并放到 `C:\Users\你的用户名\.gradle\wrapper\dists\gradle-8.2.1-all\` 下对应随机目录，或挂梯子后重新 Sync |
| 安装 apk 提示版本冲突 | 之前装过同名包 | 先卸载旧版再装 |
| 桌面图标下方的 App 名显示异常 | 含 emoji 的 `app_name` 在个别启动器渲染问题 | 改 `android/app/src/main/res/values/strings.xml` 里的 `app_name` 为纯文字（如「打工日志」）后重新 Build |
| 真机调试想看日志 | 用 adb | `adb logcat` 或 Android Studio 的 Logcat 面板 |

---

## 一句话总结

装 Android Studio（SDK 装到 `D:\Android\Sdk`）→ SDK Manager 装 API 34 → 配 `ANDROID_HOME` → `npm run cap:add` → `npm run cap:sync` → 改 `AndroidManifest.xml` 加 `usesCleartextTraffic="true"` → Android Studio 里 `Build → Build APK(s)` → 拿到 `android\app\build\outputs\apk\debug\app-debug.apk` → 手机安装 → App 里填 `http://8.163.32.86:8787` → 登录即用。
