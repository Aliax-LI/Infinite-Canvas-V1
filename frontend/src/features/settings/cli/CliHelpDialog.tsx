import { RefreshCw, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../shared/api/client";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import { CLI_HELP_COMMANDS } from "./cliHelpCommands";
import { formatCliActionMessage } from "../../../shared/api/cliFormat";

interface CliHelpDialogProps {
  open: boolean;
  panelId: string;
  title: string;
  subtitle: string;
  helpPath: string;
  onClose: () => void;
}

export function CliHelpDialog({ open, panelId, title, subtitle, helpPath, onClose }: CliHelpDialogProps) {
  const group = CLI_HELP_COMMANDS[panelId];
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");

  useEscapeKey(open, onClose);

  const helpMutation = useMutation({
    mutationFn: (cmd: string) =>
      api.post<{ text?: string; message?: string; output?: string; raw?: unknown }>(helpPath, {
        command: cmd,
      }),
    onSuccess: (res) => setOutput(formatCliActionMessage(res)),
    onError: (err: Error) => setOutput(err.message || String(err)),
  });

  useEffect(() => {
    if (!open) return;
    setCommand("");
    setOutput("");
    helpMutation.mutate("");
  }, [open, helpPath]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !group) return null;

  const options = [
    { value: "", label: group.defaultLabel },
    ...group.commands.map((cmd) => ({ value: cmd.value, label: cmd.label })),
  ];

  return (
    <div
      className="studio-picker-overlay"
      data-testid={`cli-help-overlay-${panelId}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="studio-cli-help-modal" role="dialog" aria-modal="true" aria-labelledby={`cli-help-title-${panelId}`}>
        <div className="studio-cli-help-head">
          <div>
            <h2 id={`cli-help-title-${panelId}`} className="studio-cli-help-title">
              {title}
            </h2>
            <p className="studio-cli-help-subtitle">{subtitle}</p>
          </div>
          <button
            type="button"
            className="studio-icon-btn"
            onClick={onClose}
            aria-label="关闭"
            data-testid={`cli-help-close-${panelId}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="studio-cli-help-toolbar">
          <StudioSelect
            value={command}
            onChange={(value) => {
              setCommand(value);
              helpMutation.mutate(value);
            }}
            options={options}
            data-testid={`cli-help-command-${panelId}`}
          />
          <button
            type="button"
            className="studio-action-btn primary-soft"
            onClick={() => helpMutation.mutate(command)}
            disabled={helpMutation.isPending}
            data-testid={`cli-help-refresh-${panelId}`}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden />
            <span>刷新</span>
          </button>
        </div>

        <pre className="studio-cli-help-output" data-testid={`cli-help-output-${panelId}`}>
          {helpMutation.isPending ? "加载中..." : output || "—"}
        </pre>
      </div>
    </div>
  );
}
