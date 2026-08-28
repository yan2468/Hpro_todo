# 戴夫的任务清单 · 后端部署手册（阿里云 ECS · 小白版）

> 本手册假设你已经有：
> - 一台阿里云 ECS（Ubuntu 22.04，公网 IP `8.163.32.86`，能用 SSH 证书登录）
> - 一个阿里云 RDS PostgreSQL（数据库 `hpro_todo` 已建表，已验证可用）
> - 一个域名 `www.hbywqx.top`（当前指向你的网站）
>
> 目标：把「戴夫的任务清单」后端跑在 ECS 上，让你的 App（电脑版/手机版）能连上来存数据。

---

## 路径约定（全程都用这三处）

| 用途 | 路径 |
|------|------|
| 后端代码目录 | `/var/www/dev-todo` |
| 配置文件 | `/var/www/dev-todo/.env` |
| 日志目录 | `/var/www/dev-todo/logs` |

> 下面所有命令都基于这个路径，照抄即可。

---

## ⚠️ 如果你「之前已经部署过旧版本」（升级到支持子任务/步骤的版本）

新版本给 `tasks` 表增加了 `parent_id`（子任务）和 `steps`（步骤）两个字段。老表没有这两列，直接跑新代码会报错。按下面 3 步升级：

```bash
# 1) 重新上传并解压新版部署包（.env 里已含你的 RDS 凭证，不会丢）
cd /var/www && unzip -o -q dave-tasks-server.zip

# 2) 给旧表补齐新字段（可重复执行，已有字段会自动跳过）
cd /var/www/dev-todo
node migrate.cjs

# 3) 重启后端让新代码生效
pm2 restart dave-tasks-server
```

`node migrate.cjs` 看到 `迁移完成` + 列出 `parent_id, steps` 就说明成功。
（全新首次部署、表还没建过的用户，先按下方方案一第 4 步建表，再跑 `node migrate.cjs` 即可。）

---

## 先说结论：两种用法

| 方案 | App 里填的地址 | 难度 | 说明 |
|------|----------------|------|------|
| **A. 直接用 IP + 端口**（最快） | `http://8.163.32.86:8787` | ⭐ 简单 | 不用动域名，适合先跑通 |
| **B. 用子域名 + HTTPS**（推荐长期） | `https://tasks.hbywqx.top` | ⭐⭐⭐ 中等 | 走你自己的域名，更安全、地址好记 |

两个方案**后端代码完全一样**，区别只在「域名怎么解析 + 要不要装 Nginx 反代」。
建议：先用方案 A 跑通，再按需上方案 B。

---

# 方案一：直接用 IP + 端口（最简流程）

## 第 1 步：把部署包传到服务器

在你**自己的电脑**（Windows / Mac 都行）上打开终端，把 `dave-tasks-server.zip` 上传到 ECS 的 `/var/www/` 目录。

```bash
# ① 上传（把 你的密钥.pem 换成你自己的私钥路径）
scp -i ~/.ssh/你的密钥.pem dave-tasks-server.zip root@8.163.32.86:/var/www/

# ② 登录服务器
ssh -i ~/.ssh/你的密钥.pem root@8.163.32.86
```

登录成功后，你会看到类似 `root@xxxx:~#` 的命令行提示符，下面所有命令都在**服务器**里执行。

```bash
# ③ 确保 /var/www 存在，解压
sudo mkdir -p /var/www
cd /var/www
unzip -q dave-tasks-server.zip        # 解压出 /var/www/dev-todo
cd /var/www/dev-todo
ls                                    # 应看到 server/ .env package.json ecosystem.config.cjs README.md
```

> 解压后目录就是 `/var/www/dev-todo`（正是上面约定的路径）。

## 第 2 步：确认服务器装了 Node.js

```bash
node -v
npm -v
```

- 如果显示了版本号（如 `v20.x` / `10.x`），跳过第 3 步。
- 如果提示 `command not found`，执行下面安装：

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
node -v     # 确认显示 v20.x
```

## 第 3 步：安装后端依赖

```bash
cd /var/www/dev-todo
npm install
```

（会花一两分钟，看到 `added xxx packages` 之类就成功了。）

## 第 4 步：检查 / 修改 .env

```bash
cat /var/www/dev-todo/.env
```

这个文件里**已经填好**你的 RDS 连接串、JWT 密钥和端口，正常情况下不用改。重点看这两行：

```
PORT=8787
CORS_ORIGINS=["https://www.hbywqx.top","http://8.163.32.86","http://localhost:8000","http://localhost","https://localhost"]
```

- `PORT`：后端监听的端口，保持 `8787`。
- `CORS_ORIGINS`：允许哪些前端地址访问。**方案 A 至少要包含 `http://8.163.32.86`**（已包含）；**手机 APK 默认 origin 是 `http://localhost`，也已包含**。如果以后要加别的地址，用编辑器改这里，格式必须是 JSON 数组。

> 改 .env 的方法（服务器里）：
> ```bash
> nano /var/www/dev-todo/.env
> ```
> 改完按 `Ctrl+O` 回车保存，`Ctrl+X` 退出。

数据库表之前已经建好，不用再建。如果这是**全新首次部署**（表还没建），用 psql 建表：

```bash
cd /var/www/dev-todo
psql "$DATABASE_URL" -f schema.sql     # 需要服务器装了 postgresql-client
```

无论新旧，都跑一次迁移脚本确保新字段存在（老表会自动补齐，新表无影响）：

```bash
cd /var/www/dev-todo
node migrate.cjs
```

## 第 5 步：用 PM2 启动并保活

PM2 是进程管理器，能让后端在后台一直跑，断线/重启也不会挂。

```bash
# 安装 PM2（只需一次）
sudo npm install -g pm2

# 创建日志目录
cd /var/www/dev-todo
mkdir -p logs

# 启动
pm2 start ecosystem.config.cjs

# 设为开机自动启动
pm2 save
pm2 startup systemd -u root --hp /root
```

`pm2 startup` 最后会**打印出一条命令**（类似 `sudo env ... pm2 startup ...`），把它**完整复制**再执行一次，开机自启才生效。
（如果它没报错、也没给命令，一般可以忽略。）

## 第 6 步：看一眼有没有跑起来

```bash
pm2 status
pm2 logs dave-tasks-server --lines 20
```

`pm2 status` 里 `dave-tasks-server` 的状态应该是 `online`。
日志里应该能看到 `Dave tasks server listening on :8787`。

## 第 7 步：放行阿里云安全组端口

后端跑在 `8787` 端口，但阿里云默认只开 22(SSH)。要去控制台开 8787：

1. 打开 **阿里云控制台** → **云服务器 ECS** → 找到这台实例。
2. 点 **安全组** → 点安全组名称进入 → **入方向** → **手动添加**（或「添加规则」）。
3. 填写：
   - 协议类型：`自定义 TCP`
   - 端口范围：`8787`
   - 授权对象：`0.0.0.0/0`（意思是所有人都能连；如果你只自己在用，可以填你家里的 IP，例如 `1.2.3.4/32` 更安全）
4. 保存。

## 第 8 步：确认 RDS 白名单包含 ECS 公网 IP

因为后端在 ECS 上、数据库在 RDS 上，两者是两台机器，RDS 必须「允许 ECS 的公网 IP 来连」：

1. 阿里云控制台 → **云数据库 RDS** → 找到你的实例 → **白名单设置**（或「数据安全性」）。
2. 确认白名单里有 `8.163.32.86/32`（ECS 公网 IP）。
3. 没有就「添加白名单分组」或编辑现有分组，把 `8.163.32.86/32` 加进去。

> 如果你之前已经用本机连过 RDS，那说明白名单里可能有你本机 IP；**ECS 的 IP 是另一回事，必须单独加**。

## 第 9 步：测试接口通不通

在你**自己电脑**的终端（不是服务器）执行：

```bash
curl http://8.163.32.86:8787/health
```

期望返回：`{"ok":true}`

再测注册（随便填个邮箱密码，后面可删）：

```bash
curl -X POST http://8.163.32.86:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"12345678"}'
```

期望返回带 `token` 的 JSON。能返回说明**全链路通了**。

> 如果 `curl` 没返回或超时：回到第 7、8 步检查安全组和 RDS 白名单；用 `pm2 logs dave-tasks-server` 看后端有没有报错。

## 第 10 步：在 App 里填后端地址

打开电脑版或手机版 App → 登录页或右上角 **⚙ 配置服务器**，填写：

```
http://8.163.32.86:8787
```

点「测试连接」，显示成功后再注册 / 登录账号。数据就会存进你的阿里云 RDS。

✅ 到此方案一完成，App 已经能用了。

---

# 方案二：用子域名 + HTTPS（让地址变成 https://tasks.hbywqx.top）

适合你不想在 App 里填 IP、想用自己域名的情况。前置：方案一已经跑通（后端在 8787 正常服务）。

## 第 1 步：域名解析加一条子域名

1. 登录你买域名的平台（阿里云/腾讯云/DNSPod 等）→ **域名解析 / DNS**。
2. 给 `hbywqx.top` 加一条 **A 记录**：
   - 主机记录（子域名）：`tasks`
   - 记录类型：`A`
   - 记录值（指向）：`8.163.32.86`（ECS 公网 IP）
   - TTL：默认 10 分钟
3. 保存。等几分钟，命令行验证：
   ```bash
   ping tasks.hbywqx.top
   ```
   能看到 `8.163.32.86` 就说明解析生效。

## 第 2 步：在 ECS 上装 Nginx 并做反向代理

回到服务器终端：

```bash
sudo apt update
sudo apt install -y nginx
```

新建一个站点配置文件：

```bash
sudo nano /etc/nginx/sites-available/tasks.hbywqx.top
```

把下面内容**整段粘贴**进去（注意把域名改成你的）：

```nginx
server {
    listen 80;
    server_name tasks.hbywqx.top;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

保存退出后启用它：

```bash
sudo ln -s /etc/nginx/sites-available/tasks.hbywqx.top /etc/nginx/sites-enabled/
sudo nginx -t          # 测试配置，看到 "test is successful" 再继续
sudo systemctl reload nginx
```

## 第 3 步：申请免费 HTTPS 证书（Let's Encrypt）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tasks.hbywqx.top
```

按提示输入邮箱、同意条款。成功后 Certbot 会**自动**把上面的配置改成 443(HTTPS) 并重载 Nginx。
证书 90 天有效，Certbot 会自动续期，不用管。

## 第 4 步：放行 443 端口 + （可选）关掉 8787 公网

1. 安全组里**再加一条**入方向：`自定义 TCP` / 端口 `443` / 授权对象 `0.0.0.0/0`。
2. 如果你只想通过域名访问、不想暴露 IP 直连，可以把之前 8787 那条规则删掉（后端仍监听 8787，只是外部访问走 Nginx 的 443→127.0.0.1:8787）。

## 第 5 步：把域名加进 CORS 白名单

因为前端现在从 `https://tasks.hbywqx.top` 访问后端，要在 `.env` 里允许它：

```bash
sudo nano /var/www/dev-todo/.env
```

确认 `CORS_ORIGINS` 含有 `"https://tasks.hbywqx.top"`（同时保留 `http://localhost` 给手机 APK）：

```
CORS_ORIGINS=["https://tasks.hbywqx.top","http://8.163.32.86","http://localhost:8000","http://localhost","https://localhost"]
```

改完重启后端让配置生效：

```bash
cd /var/www/dev-todo
pm2 restart dave-tasks-server
```

## 第 6 步：测试 + App 填新地址

```bash
curl https://tasks.hbywqx.top/health
# 期望 {"ok":true}
```

App 里 **⚙ 配置服务器** 改为：

```
https://tasks.hbywqx.top
```

✅ 方案二完成，App 走你自己的 HTTPS 域名。

---

# 常用运维命令（记一下）

```bash
# 进入后端目录
cd /var/www/dev-todo

# 看后端状态 / 日志
pm2 status
pm2 logs dave-tasks-server

# 改了 .env 或代码后重启
pm2 restart dave-tasks-server

# 停止 / 彻底删掉
pm2 stop dave-tasks-server
pm2 delete dave-tasks-server

# 服务器重启后如果没自动起来
pm2 resurrect
```

---

# 故障速查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| App 连不上 / Failed to fetch | 安全组没开 8787、RDS 白名单没加 ECS IP、或手机端 CORS 白名单没加 `http://localhost` | 回看方案A 第7、8步；并检查 `CORS_ORIGINS` 是否含 `http://localhost` |
| `curl` 返回 403 CORS | 前端地址不在 `CORS_ORIGINS` | 改 `.env` 加地址，`pm2 restart` |
| 后端 `online` 但连不上库 | RDS 白名单 / 密码错 | 检查 `.env` 的 `DATABASE_URL`、RDS 白名单 |
| Nginx 502 | 后端没起或端口错 | `pm2 status` 确认 8787 在跑 |
| 域名 ping 不通 | 解析没生效 | 等几分钟 / 检查 A 记录 |

---

# 关于你原网站和这个后端的共存

- `www.hbywqx.top` 指向你的网站，**完全不受影响**，这个后端是独立进程、独立端口。
- 只有在「方案二」里我们新建了 `tasks.hbywqx.top` 子域名来专门服务这个后端，父域名照常。
- 如果你希望后端挂在**同一个域名下的路径**（例如 `www.hbywqx.top/api`），那需要改你网站那边的 Nginx 配置把 `/api` 反代到 8787——这要动你现有网站配置，风险略高，新手建议先用子域名方案。
