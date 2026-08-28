import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import iconUrl from '/icon.png';

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

/** 把后端返回的英文错误翻成友好中文 */
function friendlyError(msg: string, mode: 'login' | 'register'): string {
  if (!msg) return '';
  const m = msg.toLowerCase();
  if (m.includes('user not registered')) return '该用户没有注册，请先注册';
  if (m.includes('invalid email or password') || m.includes('unauthorized') || m.includes('invalid credentials')) return '账号或密码错误，请重试~';
  if (m.includes('invalid email format')) return '邮箱格式不正确';
  if (m.includes('email already registered') || m.includes('23505')) return '该邮箱已注册过，直接登录试试';
  if (m.includes('password') && m.includes('short')) return '密码至少 8 位';
  if (m.includes('failed to fetch') || m.includes('network')) return '无法连接服务器，请检查网络或「⚙ 配置服务器」';
  if (mode === 'register' && m.includes('error')) return `注册失败：${msg}`;
  return msg;
}

export function LoginView({
  onAuth,
  onOpenSettings,
}: {
  onAuth: (token: string) => void;
  onOpenSettings?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [now, setNow] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const t = setInterval(() => setNow(formatTime(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async () => {
    if (submitting) return;
    setErr('');
    if (!email || !password) {
      setErr('请输入邮箱和密码');
      return;
    }
    if (!isEmail(email)) {
      setErr('邮箱格式不正确');
      return;
    }
    setSubmitting(true);
    try {
      const fn = mode === 'login' ? api.login : api.register;
      const res = await fn(email, password);
      localStorage.setItem('dd_token', res.token);
      onAuth(res.token);
    } catch (e: any) {
      setErr(friendlyError(e?.message || '登录失败', mode));
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-app-icon" src={iconUrl} alt="App 图标" />
        <h2 className="login-greeting">欢迎牛马，现在的时间是 {now}</h2>
        {err && <div className="login-err">{err}</div>}
        <div className="field">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="邮箱"
            type="email"
            autoFocus
          />
        </div>
        <div className="field">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="密码"
            type="password"
          />
        </div>
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setErr('');
            }}
            type="button"
          >
            {mode === 'login' ? '去注册' : '去登录'}
          </button>
          <button className="btn primary" onClick={submit} disabled={submitting} type="button">
            {submitting ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </div>
        {onOpenSettings && (
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={onOpenSettings} type="button">
              ⚙ 配置服务器
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
