import { useState } from 'react';

export function CloseConfirmModal({
  open,
  onCancel,
  onChoose,
}: {
  open: boolean;
  onCancel: () => void;
  onChoose: (action: 'minimize' | 'quit', remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  if (!open) return null;
  return (
    <div className="modal-backdrop cute" onClick={onCancel}>
      <div className="confirm-modal close-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-mascot">😺</div>
        <h3>要退出「🐮🐴的打工日志」吗？</h3>
        <p className="confirm-msg">
          最小化到后台：主窗口隐藏，桌面小组件继续运行与实时刷新。
          <br />
          直接关闭：程序完全退出，桌面小组件一并移除。
        </p>
        <div className="close-actions">
          <button
            className="btn primary"
            type="button"
            onClick={() => onChoose('minimize', remember)}
          >
            最小化到后台
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => onChoose('quit', remember)}
          >
            直接关闭
          </button>
        </div>
        <label className="close-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          记住我的选择（下次不再询问）
        </label>
      </div>
    </div>
  );
}
