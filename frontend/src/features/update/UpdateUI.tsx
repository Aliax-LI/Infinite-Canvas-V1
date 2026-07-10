import { Download } from "lucide-react";
import { useCheckUpdate } from "./hooks";

export function UpdateBadge() {
  const { data } = useCheckUpdate();
  if (!data?.updateAvailable) return null;

  return (
    <span
      className="studio-update-badge animate-pulse"
      title="有可用更新"
      data-testid="update-badge"
    />
  );
}

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpdateModal({ open, onClose }: UpdateModalProps) {
  const { data } = useCheckUpdate();

  if (!open || !data?.updateAvailable) return null;

  return (
    <div className="studio-modal-backdrop" data-testid="update-modal">
      <div className="studio-modal-card">
        <div className="studio-modal-title">
          <Download aria-hidden />
          <h2>发现新版本</h2>
        </div>
        <p className="studio-modal-meta">当前版本：{data.current}</p>
        <p className="studio-modal-meta">最新版本：{data.latestVersion}</p>
        {data.releaseNotes && <p className="studio-modal-notes">{data.releaseNotes}</p>}
        <div className="studio-modal-actions">
          <button type="button" onClick={onClose} className="studio-action-btn">
            稍后
          </button>
          {data.releaseUrl && (
            <a
              href={data.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="studio-action-btn primary"
            >
              下载
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
