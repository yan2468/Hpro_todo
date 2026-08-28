export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '再想想',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop cute" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-mascot">😺</div>
        <h3>{title}</h3>
        <p className="confirm-msg">{message}</p>
        <div className="btn-row">
          <button className="btn" onClick={onCancel} type="button">
            {cancelText}
          </button>
          <button className="btn danger" onClick={onConfirm} type="button">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
