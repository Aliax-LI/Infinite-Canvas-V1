import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import { formatCliActionMessage } from "../../../shared/api/cliFormat";
import { fetchCliStatus, type CliStatusView } from "../../../shared/api/cliStatus";
import { useStatusToast } from "../../../shared/hooks/useStatusToast";
import { CliHelpDialog } from "./CliHelpDialog";
import { CliStatusInfo } from "./CliStatusInfo";

interface CliPanel {
  id: string;
  name: string;
  title: string;
  description: string;
  statusPath: string;
  helpPath?: string;
  helpTitle?: string;
  helpSubtitle?: string;
  extra?: { label: string; path: string; method?: "get" | "post"; tone?: "primary" | "danger" }[];
}

interface JimengLoginState {
  text?: string;
  qr_url?: string;
  running?: boolean;
  logged_in?: boolean;
}

const CLI_PANELS: CliPanel[] = [
  {
    id: "codex",
    name: "Codex CLI",
    title: "OpenAI CLI 账户",
    description: "使用本机 codex 登录态，无需在本项目保存 API Key。",
    statusPath: "/api/codex/status",
    helpPath: "/api/codex/help",
    helpTitle: "OpenAI Codex CLI 帮助",
    helpSubtitle: "查看 codex 官方命令帮助输出",
    extra: [
      {
        label: "安装 GPT Image 2 helper",
        path: "/api/codex/install-image-helper",
        method: "post",
        tone: "primary",
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    title: "Antigravity CLI 账户",
    description: "使用本机 agy 登录态，无需在本项目保存 API Key。",
    statusPath: "/api/gemini-cli/status",
    helpPath: "/api/gemini-cli/help",
    helpTitle: "Antigravity CLI 帮助",
    helpSubtitle: "查看 gemini / agy 官方命令帮助输出",
  },
  {
    id: "jimeng",
    name: "即梦 CLI",
    title: "即梦 CLI 账户",
    description: "使用本机 dreamina 登录态，无需 API Key。",
    statusPath: "/api/jimeng/status",
    helpPath: "/api/jimeng/help",
    helpTitle: "即梦 CLI 帮助",
    helpSubtitle: "查看 dreamina 官方命令帮助输出",
    extra: [
      { label: "查询积分", path: "/api/jimeng/credit" },
      { label: "扫码登录", path: "/api/jimeng/login/start", method: "post", tone: "primary" },
      { label: "登出", path: "/api/jimeng/logout", method: "post", tone: "danger" },
    ],
  },
];

function statusPillClass(ok: CliStatusView["ok"]) {
  if (ok === true) return "studio-status-pill ok";
  if (ok === false) return "studio-status-pill bad";
  return "studio-status-pill";
}

function actionBtnClass(tone?: CliPanel["extra"][0]["tone"]) {
  if (tone === "primary") return "studio-action-btn primary-soft";
  if (tone === "danger") return "studio-action-btn danger";
  return "studio-action-btn";
}

const CLI_DETECT_MIN_MS = 500;

function CliPanelCard({ panel }: { panel: CliPanel }) {
  const queryClient = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const [creditText, setCreditText] = useState("");
  const [loginBox, setLoginBox] = useState<JimengLoginState | null>(null);
  const [loginPolling, setLoginPolling] = useState(false);
  const [detectHoldBusy, setDetectHoldBusy] = useState(false);
  const detectHoldTimerRef = useRef<number | null>(null);
  const { statusText: actionMsg, setStatusText: setActionMsg } = useStatusToast(8000);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["cli-status", panel.id],
    queryFn: () => fetchCliStatus(panel.id, panel.statusPath, api.get),
    staleTime: 0,
  });

  const detecting = isLoading || detectHoldBusy;

  useEffect(() => {
    return () => {
      if (detectHoldTimerRef.current !== null) {
        window.clearTimeout(detectHoldTimerRef.current);
      }
    };
  }, []);

  const handleDetect = () => {
    if (detectHoldBusy) return;
    const startedAt = Date.now();
    setDetectHoldBusy(true);
    void refetch().finally(() => {
      const remaining = CLI_DETECT_MIN_MS - (Date.now() - startedAt);
      if (detectHoldTimerRef.current !== null) {
        window.clearTimeout(detectHoldTimerRef.current);
      }
      detectHoldTimerRef.current = window.setTimeout(() => {
        setDetectHoldBusy(false);
        detectHoldTimerRef.current = null;
      }, Math.max(0, remaining));
    });
  };

  useEffect(() => {
    if (panel.id !== "jimeng") return;
    if (status?.creditSummary) setCreditText(status.creditSummary);
  }, [panel.id, status?.creditSummary]);

  useEffect(() => {
    if (!loginPolling || panel.id !== "jimeng") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await api.get<JimengLoginState & { raw?: unknown }>("/api/jimeng/login/status");
        if (cancelled) return;
        setLoginBox(data);
        if (data.logged_in) {
          setLoginPolling(false);
          if (data.raw) setCreditText(formatCliActionMessage({ raw: data.raw }));
          queryClient.invalidateQueries({ queryKey: ["cli-status", panel.id] });
        } else if (!data.running) {
          setLoginPolling(false);
        }
      } catch {
        if (!cancelled) setLoginPolling(false);
      }
    };

    const timer = window.setInterval(poll, 2500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loginPolling, panel.id, queryClient]);

  const actionMutation = useMutation({
    mutationFn: async (extra: CliPanel["extra"][0]) => {
      if (panel.id === "jimeng" && extra.path === "/api/jimeng/logout") {
        if (!window.confirm("确认退出即梦 CLI 登录？")) {
          throw new Error("__cancelled__");
        }
      }
      const method = extra.method ?? "get";
      return method === "post"
        ? api.post<{ message?: string; ok?: boolean; raw?: unknown; text?: string; qr_url?: string; running?: boolean }>(
            extra.path,
          )
        : api.get<{ message?: string; credit?: unknown; raw?: unknown }>(extra.path);
    },
    onSuccess: (res, extra) => {
      if (panel.id === "jimeng" && extra.path === "/api/jimeng/login/start") {
        setLoginBox(res as JimengLoginState);
        setLoginPolling(true);
        setActionMsg("");
        return;
      }
      if (panel.id === "jimeng" && extra.path === "/api/jimeng/logout") {
        setLoginBox(null);
        setLoginPolling(false);
        setCreditText(formatCliActionMessage(res));
        queryClient.invalidateQueries({ queryKey: ["cli-status", panel.id] });
        return;
      }
      if (panel.id === "jimeng" && extra.path === "/api/jimeng/credit") {
        setCreditText(formatCliActionMessage(res));
        queryClient.invalidateQueries({ queryKey: ["cli-status", panel.id] });
        return;
      }
      setActionMsg(formatCliActionMessage(res));
      queryClient.invalidateQueries({ queryKey: ["cli-status", panel.id] });
    },
    onError: (err: Error) => {
      if (err.message === "__cancelled__") return;
      setActionMsg(err.message || String(err));
    },
  });

  const visibleExtra =
    panel.extra?.filter((extra) => {
      if (panel.id === "codex" && extra.path === "/api/codex/install-image-helper") {
        return status?.image2HelperInstalled !== true;
      }
      return true;
    }) ?? [];

  const showLoginBox = panel.id === "jimeng" && loginBox && (loginPolling || Boolean(loginBox.text || loginBox.qr_url));

  return (
    <section className="studio-cli-panel" data-testid={`cli-panel-${panel.id}`}>
      <div className="studio-cli-head">
        <div>
          <div className="studio-cli-title">{panel.title}</div>
          <div className="studio-cli-desc">{panel.description}</div>
        </div>
        <span className={statusPillClass(detecting ? null : (status?.ok ?? null))} data-testid={`cli-status-${panel.id}`}>
          {detecting ? "检测中..." : status?.label ?? "—"}
        </span>
      </div>

      {status ? <CliStatusInfo panelId={panel.id} status={status} /> : null}

      {status?.versionWarning && (
        <p className="studio-cli-warning" data-testid={`cli-version-warning-${panel.id}`}>
          {status.versionWarning}
        </p>
      )}

      {panel.id === "jimeng" && creditText && (
        <div className="studio-cli-credit" data-testid={`cli-credit-${panel.id}`}>
          {creditText}
        </div>
      )}

      <div className="studio-cli-actions">
        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          className={`studio-action-btn primary-soft${detecting ? " is-busy" : ""}`}
          data-testid={`cli-refresh-${panel.id}`}
          aria-busy={detecting}
        >
          <RefreshCw className={`w-3.5 h-3.5${detecting ? " studio-icon-spin" : ""}`} aria-hidden />
          <span>{detecting ? "检测中..." : "检测 CLI"}</span>
        </button>
        {visibleExtra.map((extra) => (
          <button
            key={extra.path}
            type="button"
            onClick={() => actionMutation.mutate(extra)}
            disabled={actionMutation.isPending}
            className={actionBtnClass(extra.tone)}
            data-testid={`cli-action-${panel.id}-${extra.label}`}
          >
            {panel.id === "jimeng" && extra.path === "/api/jimeng/login/start" ? (
              <QrCode className="w-3.5 h-3.5" aria-hidden />
            ) : null}
            <span>{extra.label}</span>
          </button>
        ))}
        {panel.helpPath && (
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="studio-action-btn"
            data-testid={`cli-help-open-${panel.id}`}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden />
            <span>帮助</span>
          </button>
        )}
      </div>

      {showLoginBox && (
        <div className="studio-cli-login-box" data-testid={`cli-login-box-${panel.id}`}>
          {loginBox?.qr_url?.startsWith("http") ? (
            <img className="studio-cli-login-qr" src={loginBox.qr_url} alt="即梦登录二维码" />
          ) : null}
          <pre>{loginBox?.text || "等待 CLI 输出登录二维码..."}</pre>
        </div>
      )}

      {actionMsg && (
        <p className="studio-cli-action-msg" data-testid={`cli-action-msg-${panel.id}`}>
          {actionMsg}
        </p>
      )}

      {panel.helpPath && (
        <CliHelpDialog
          open={helpOpen}
          panelId={panel.id}
          title={panel.helpTitle ?? `${panel.name} 帮助`}
          subtitle={panel.helpSubtitle ?? "查看官方命令帮助输出"}
          helpPath={panel.helpPath}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </section>
  );
}

export function CliSettingsPanel() {
  const { t } = useTranslation("studio");

  return (
    <div className="studio-settings-native" data-testid="cli-settings-page">
      <header className="studio-cli-page-head">
        <h2>{t("settings.cliPageTitle")}</h2>
        <p>{t("settings.cliPageDesc")}</p>
      </header>
      <div className="studio-cli-grid">
        {CLI_PANELS.map((panel) => (
          <CliPanelCard key={panel.id} panel={panel} />
        ))}
      </div>
    </div>
  );
}
