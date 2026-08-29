import { useState } from 'react';
import { DEFAULT_API_BASE } from '../lib/platform';
import { getBase } from '../lib/api';

const electronAPI = (window as any).electronAPI;

/**
 * 仅含"服务器配置"的简化弹窗。
 * 用在登录前，让用户能修改 API 地址再尝试登录；
 * 登录后完整的设置中心由 SettingsModal 提供。
 */
export function ServerConfigModal({ onClose }: { onClose: () => void }) {
  const [base, setBase] = useState(getBase());
  const [msg, setMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  const save = () => {
    const v = base.trim().replace(/\/$/, '');
    localStorage.setItem('dd_api_base', v);
    electronAPI?.setAuth?.({
      token: localStorage.getItem('dd_token'),
      base: v,
    });
    flash('服务器地址已保存，下一次请求生效');
  };

  const test = async () => {
    setTesting(true);
    flash('连接测试中…');
    try {
      const res = await fetch(`${base.trim().replace(/\/$/, '')}/health`);
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        flash(j.ok ? '连接成功 ✓ 服务正常' : '已连接，但返回异常');
      } else {
        flash(`连接失败：HTTP ${res.status}`);
      }
    } catch (e: any) {
      flash(`连接失败：${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <h3>🌐 配置服务器</h3>

        <div className="modal-body">
          <div className="set-section">
            <div className="set-section-title">🌐 服务器配置</div>
            <div className="field">
              <label>服务器地址（后端 API / 数据库入口）</label>
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder={DEFAULT_API_BASE}
              />
              <p className="hint">
                后端服务部署在你的阿里云服务器，由它负责连接 PostgreSQL 数据库。
                此处填写该服务的公网地址（本地调试填 {DEFAULT_API_BASE.replace(/^http/, 'http')})。
              </p>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={test} disabled={testing} type="button">
                测试连接
              </button>
              <button className="btn primary" onClick={save} type="button">
                保存
              </button>
            </div>
            {msg && <div className="hint set-inline-msg">{msg}</div>}
          </div>
        </div>

        <div className="modal-footer">
          <div className="btn-row">
            <button className="btn" onClick={onClose} type="button">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}