export function FloatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="fab" onClick={onClick} aria-label="新建任务">
      +
    </button>
  );
}
