import {
  cliBinaryLabel,
  parseCliVersionDisplay,
  type CliStatusView,
} from "../../../shared/api/cliStatus";

interface CliStatusInfoProps {
  panelId: string;
  status: CliStatusView;
}

export function CliStatusInfo({ panelId, status }: CliStatusInfoProps) {
  const parsed = parseCliVersionDisplay(status.version);
  const semver = parsed.semver;
  const binary = parsed.binary ?? cliBinaryLabel(panelId);
  const hasVersionRow = Boolean(semver || status.installed);
  const hasMeta = Boolean(status.path || status.helper);
  const hasMessage = Boolean(status.message?.trim());

  if (!hasVersionRow && !hasMeta && !hasMessage) return null;

  if (!status.installed && !hasVersionRow && !hasMeta) {
    return (
      <div className="studio-cli-info" data-testid={`cli-info-${panelId}`}>
        <div className="studio-cli-info-empty">{status.message}</div>
      </div>
    );
  }

  return (
    <div className="studio-cli-info" data-testid={`cli-info-${panelId}`}>
      {hasVersionRow && (
        <div className="studio-cli-info-version">
          {binary ? (
            <span className="studio-cli-binary" data-testid={`cli-binary-${panelId}`}>
              {binary}
            </span>
          ) : null}
          {semver ? (
            <span className="studio-cli-version-tag" data-testid={`cli-version-${panelId}`}>
              v{semver.replace(/^v/i, "")}
            </span>
          ) : null}
        </div>
      )}

      {(hasMeta || hasMessage) && (
        <div className="studio-meta-list studio-cli-meta">
          {status.path ? (
            <div className="studio-meta-row">
              <span>路径</span>
              <strong title={status.path} data-testid={`cli-path-${panelId}`}>
                {status.path}
              </strong>
            </div>
          ) : null}
          {status.helper ? (
            <div className="studio-meta-row">
              <span>组件</span>
              <strong
                className={status.helper.installed ? "is-ok" : "is-warn"}
                data-testid={`cli-helper-${panelId}`}
              >
                {status.helper.label}
              </strong>
            </div>
          ) : null}
          {hasMessage ? (
            <div className="studio-cli-info-message" data-testid={`cli-message-${panelId}`}>
              {status.message}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
