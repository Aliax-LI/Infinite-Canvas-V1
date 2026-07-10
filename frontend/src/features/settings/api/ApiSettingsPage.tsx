import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  Image,
  ListChecks,
  Plus,
  Radar,
  Save,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api/client";
import { StudioDialog } from "../../../shared/ui/StudioDialog";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import {
  KeyAcquisitionActions,
  KeyRegionTabs,
  VolcengineKeyActions,
} from "./KeyAcquisitionLinks";
import {
  isFixedProvider,
  ProviderCard,
  type ProviderListItem,
} from "./providerListUi";
import {
  detectKeyRegion,
  keyRegionEndpoint,
  MODELSCOPE_TOKEN_URLS,
  PROVIDER_REGION_ENDPOINTS,
  RUNNINGHUB_KEY_URLS,
  type KeyRegion,
} from "./providerKeyLinks";
import { ModelPickerModal } from "./ModelPickerModal";
import type { FetchedModels, ModelPickerTab } from "./modelPickerState";
import {
  hasFetchedModels,
  modelKindToPickerTab,
  normalizeFetchedModels,
} from "./modelPickerState";
import { RecommendApiModal } from "./RecommendApiModal";
import type { RecommendedPreset } from "./recommendedPresets";
import { MsLoraManager } from "./MsLoraManager";
import { normalizeMsLoras, type MsLora } from "./msLoraState";
import {
  CUSTOM_PLATFORM_PROTOCOLS,
  effectiveProtocol,
  formatProbeProtocolLabel,
  isCliProvider,
  type ProbeConnectionResult,
  protocolOptions,
  showProbeProtocolButton,
  showProtocolSelector,
} from "./providerProtocols";

const MODEL_SECTIONS = [
  {
    kind: "image_models" as const,
    title: "生图模型",
    desc: "在线生图和无限画布 API 生成使用",
  },
  {
    kind: "chat_models" as const,
    title: "聊天模型",
    desc: "GPT 对话和 LLM 节点使用",
  },
  {
    kind: "video_models" as const,
    title: "视频模型",
    desc: "无限画布视频生成节点使用",
  },
];

interface Provider extends ProviderListItem {
  api_key?: string;
  image_models?: string[];
  chat_models?: string[];
  video_models?: string[];
  ms_loras?: MsLora[];
  key_preview?: string;
}

type ModelKind = "image_models" | "chat_models" | "video_models";

function newProviderId() {
  return `p${crypto.randomUUID().replace(/-/g, "").slice(0, 11).toLowerCase()}`;
}

function providerPayload(p: Provider, extra?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    base_url: p.base_url ?? "",
    protocol: p.protocol ?? "openai",
    enabled: p.enabled !== false,
    image_models: p.image_models ?? [],
    chat_models: p.chat_models ?? [],
    video_models: p.video_models ?? [],
    ...extra,
  };
  if (p.id === "modelscope") {
    payload.ms_loras = normalizeMsLoras(p.ms_loras);
  }
  return payload;
}

const ENDPOINT_HINTS: Record<string, { label: string; url: string }[]> = {
  modelscope: [
    { label: "国内", url: "https://api-inference.modelscope.cn/v1" },
    { label: "国外", url: "https://api-inference.modelscope.ai/v1" },
  ],
  runninghub: [
    { label: "国内", url: "https://www.runninghub.cn" },
    { label: "国外", url: "https://www.runninghub.ai" },
  ],
  apimart: [{ label: "国内", url: "https://apib.ai" }],
  volcengine: [{ label: "默认", url: "https://ark.cn-beijing.volces.com/api/v3" }],
};

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function providerHasUsableKey(provider: Provider, keyInput: string) {
  if (isCliProvider(provider)) return true;
  return Boolean(provider.has_key || provider.has_wallet_key || keyInput.trim());
}

function isRunningHubContext(item: Provider, baseUrl: string) {
  const url = baseUrl.toLowerCase();
  return (
    item.id === "runninghub" ||
    effectiveProtocol(item) === "runninghub" ||
    url.includes("runninghub.cn") ||
    url.includes("runninghub.ai")
  );
}

interface VerifyResultState {
  kind: "address" | "protocol";
  ok: boolean | null;
  message: string;
  protocol?: string;
  statusCode?: number;
  raw?: unknown;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

const CLI_HINTS: Record<string, { title: string; desc: string }> = {
  jimeng: {
    title: "即梦 CLI 账户",
    desc: "使用本机 dreamina 登录态，无需在本项目保存 API Key。",
  },
  codex: {
    title: "OpenAI CLI 账户",
    desc: "使用本机 codex 登录态，无需在本项目保存 API Key。",
  },
  "gemini-cli": {
    title: "Antigravity CLI 账户",
    desc: "使用本机 agy 登录态，无需在本项目保存 API Key。",
  },
};

function ProviderCliHint({ provider }: { provider: Provider }) {
  const protocol = effectiveProtocol(provider);
  const hint = CLI_HINTS[protocol];
  if (!hint) return null;

  return (
    <div className="studio-cli-hint-panel" data-testid={`provider-cli-hint-${protocol}`}>
      <div>
        <div className="studio-block-title">{hint.title}</div>
        <div className="studio-block-desc">{hint.desc}</div>
        <p className="studio-field-hint">需要先安装 CLI 文件夹中的依赖。</p>
      </div>
      <Link to="/settings/cli" className="studio-action-btn primary-soft" data-testid="provider-cli-settings-link">
        <ExternalLink className="w-3.5 h-3.5" />
        前往 CLI 设置
      </Link>
    </div>
  );
}

function verifyDialogTitle(result: VerifyResultState) {
  if (result.kind === "protocol") {
    return result.ok ? "协议验证成功" : "协议验证失败";
  }
  return result.ok ? "地址验证成功" : "地址验证失败";
}

function verifyDialogVariant(result: VerifyResultState): "success" | "warning" | "error" {
  if (result.ok === true) return "success";
  if (result.ok === false) return "error";
  return "warning";
}

function VerifyResultDialog({
  result,
  onClose,
}: {
  result: VerifyResultState | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <StudioDialog
      open
      onClose={onClose}
      title={verifyDialogTitle(result)}
      variant={verifyDialogVariant(result)}
      data-testid="provider-verify-dialog"
      primaryAction={{ label: "确定", onClick: onClose, testId: "provider-verify-dialog-confirm" }}
    >
      <div data-testid="provider-verify-result">
        <p className="studio-dialog-message">{result.message}</p>
        {result.protocol && result.kind === "protocol" && (
          <p className="studio-field-hint">
            协议：
            <strong>{formatProbeProtocolLabel(result.protocol)}</strong>
          </p>
        )}
        {result.raw !== undefined && (
          <details className="studio-verify-details">
            <summary>
              查看原始响应
              {result.statusCode ? ` (HTTP ${result.statusCode})` : ""}
            </summary>
            <pre>{prettyJson(result.raw)}</pre>
          </details>
        )}
      </div>
    </StudioDialog>
  );
}

function getRegionEndpoints(provider: Provider) {
  const id = provider.id;
  const protocol = provider.protocol ?? "openai";
  if (id === "modelscope") return PROVIDER_REGION_ENDPOINTS.modelscope;
  if (protocol === "runninghub" || id === "runninghub") return PROVIDER_REGION_ENDPOINTS.runninghub;
  return null;
}

function providerUsesRegionTabs(provider: Provider) {
  return getRegionEndpoints(provider) !== null;
}

function isRunningHubProvider(provider: Provider) {
  const protocol = provider.protocol ?? "openai";
  return provider.id === "runninghub" || protocol === "runninghub";
}

function isVolcengineProvider(provider: Provider) {
  const protocol = provider.protocol ?? "openai";
  return provider.id === "volcengine" || protocol === "volcengine";
}

function getEndpointHints(provider: Provider) {
  const id = provider.id;
  const protocol = provider.protocol ?? "openai";
  if (providerUsesRegionTabs(provider)) return [];
  if (protocol === "apimart") return ENDPOINT_HINTS.apimart;
  if (protocol === "volcengine" || id === "volcengine") return ENDPOINT_HINTS.volcengine;
  return [];
}

function ProtocolHints({
  provider,
  onSelectUrl,
}: {
  provider: Provider;
  onSelectUrl: (url: string) => void;
}) {
  const hints = getEndpointHints(provider);
  if (!hints.length) return null;

  const current = normalizeUrl(provider.base_url ?? "");
  const alternatives = current ? hints.filter((h) => normalizeUrl(h.url) !== current) : hints;
  if (!alternatives.length) return null;

  return (
    <div className="studio-protocol-hints-compact">
      <span className="studio-protocol-hints-label">{current ? "切换：" : "可选："}</span>
      {alternatives.map((hint) => (
        <button
          key={hint.url}
          type="button"
          className="studio-endpoint-chip"
          onClick={() => onSelectUrl(hint.url)}
          title={hint.url}
        >
          {hint.label}
        </button>
      ))}
    </div>
  );
}

export function ApiSettingsPage() {
  const { t } = useTranslation("api-settings");
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModels | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pickerInitialTab, setPickerInitialTab] = useState<ModelPickerTab>("all");
  const [pendingPickerTab, setPendingPickerTab] = useState<ModelPickerTab | null>(null);
  const [draft, setDraft] = useState<Partial<Provider>>({
    name: "",
    base_url: "",
    api_key: "",
    enabled: true,
    protocol: "openai",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResultState | null>(null);
  const [saveDialogMessage, setSaveDialogMessage] = useState<string | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [regionOverride, setRegionOverride] = useState<KeyRegion | null>(null);
  const [loraDraft, setLoraDraft] = useState<MsLora[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.get<{ providers: Provider[] }>("/api/providers"),
  });

  const saveMutation = useMutation({
    mutationFn: (providers: ReturnType<typeof providerPayload>[]) =>
      api.put<{ providers: Provider[] }>("/api/providers", providers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      setKeyInput("");
    },
  });

  const notifySave = (message = "已保存") => setSaveDialogMessage(message);
  const showNotice = (message: string, title = "提示") => setNoticeDialog({ title, message });

  const providers = data?.providers ?? [];
  const selected = providers.find((p) => p.id === selectedId) ?? null;
  const selectedRegionEndpoints = selected ? getRegionEndpoints(selected) : null;
  const derivedRegion = selectedRegionEndpoints
    ? detectKeyRegion(selected?.base_url ?? "", selectedRegionEndpoints)
    : "cn";
  const selectedRegion = regionOverride ?? derivedRegion;

  useEffect(() => {
    if (!providers.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !providers.some((p) => p.id === selectedId)) {
      setSelectedId(providers[0].id);
    }
  }, [providers, selectedId]);

  useEffect(() => {
    setKeyInput("");
    setVerifyResult(null);
    setFetchedModels(null);
    setShowModelPicker(false);
    setPickerInitialTab("all");
    setPendingPickerTab(null);
    setRegionOverride(null);
    setLoraDraft([]);
  }, [selectedId]);

  useEffect(() => {
    if (selected?.id === "modelscope") {
      setLoraDraft(selected.ms_loras ?? []);
    }
  }, [selected?.id, selected?.ms_loras]);

  useEffect(() => {
    setRegionOverride(null);
  }, [selected?.base_url]);

  const providersForSave = (next: Provider[]) =>
    next.map((p) =>
      p.id === "modelscope" && p.id === selectedId ? { ...p, ms_loras: loraDraft } : p,
    );

  const persist = (
    next: Provider[],
    extra?: Record<string, unknown>,
    saveMessage?: string,
  ) => {
    saveMutation.mutate(
      providersForSave(next).map((p) => providerPayload(p, p.id === selectedId ? extra : undefined)),
      saveMessage ? { onSuccess: () => notifySave(saveMessage) } : undefined,
    );
  };

  const fetchModelsMutation = useMutation({
    mutationFn: (providerId: string) =>
      api.get<FetchedModels & { message?: string }>(`/api/providers/${providerId}/fetch-models`),
    onSuccess: (res) => {
      const normalized = normalizeFetchedModels(res);
      setFetchedModels(normalized);
      const tab = pendingPickerTab ?? "all";
      setPendingPickerTab(null);
      setPickerInitialTab(tab);
      setShowModelPicker(true);
    },
    onError: (err: Error) => showNotice(err.message, "获取模型失败"),
  });

  const applyPickedModels = (models: {
    image_models?: string[];
    chat_models?: string[];
    video_models?: string[];
  }) => {
    if (!selected) return;
    persist(
      providers.map((p) => (p.id === selected.id ? { ...p, ...models } : p)),
      undefined,
      t("modelPickerApplied", {
        image: models.image_models?.length ?? 0,
        chat: models.chat_models?.length ?? 0,
        video: models.video_models?.length ?? 0,
      }),
    );
  };

  const buildVerifyPayload = (provider: Provider) => {
    const baseUrl = (provider.base_url ?? "").trim();
    const protocol = effectiveProtocol(provider);
    const runninghubContext = isRunningHubContext(provider, baseUrl);
    return {
      base_url: baseUrl,
      api_key: keyInput.trim(),
      protocol: runninghubContext ? "runninghub" : protocol,
      provider_id: runninghubContext ? "runninghub" : provider.id,
    };
  };

  const testMutation = useMutation({
    mutationFn: (payload: {
      base_url: string;
      api_key: string;
      protocol: string;
      provider_id?: string;
    }) => api.post<ProbeConnectionResult>("/api/providers/test-connection", payload),
    onSuccess: (res, variables) => {
      const count = res.model_count ?? res.total ?? res.all?.length ?? 0;
      const ok = res.ok !== false;
      setVerifyResult({
        kind: "address",
        ok,
        message: ok
          ? `地址验证通过 · 找到 ${count} 个模型`
          : res.message ?? `地址验证未通过 (HTTP ${res.status ?? 0})`,
        protocol: res.protocol,
        statusCode: res.status,
        raw: res.raw,
      });
      if (ok && res.protocol && selected && showProtocolSelector(selected)) {
        const detected = res.protocol.toLowerCase();
        if (detected !== effectiveProtocol(selected)) {
          handleUpdate(selected.id, { protocol: detected });
        }
      }
    },
    onError: (err: Error) => {
      setVerifyResult({ kind: "address", ok: false, message: err.message });
    },
  });

  const probeAsyncMutation = useMutation({
    mutationFn: (payload: {
      base_url: string;
      api_key: string;
      protocol: string;
      provider_id?: string;
    }) => api.post<ProbeConnectionResult>("/api/providers/probe-async", payload),
    onSuccess: (res, variables) => {
      const detected = String(res.protocol ?? "").toLowerCase();
      const ok = res.ok === true;
      setVerifyResult({
        kind: "protocol",
        ok,
        message: res.message ?? (ok ? "协议验证通过" : "协议验证未通过"),
        protocol: detected || variables.protocol,
        statusCode: res.status_code ?? res.status,
        raw: res.raw,
      });
      if (selected && ok && detected && showProtocolSelector(selected)) {
        const keepManual = ["gemini", "volcengine"].includes(effectiveProtocol(selected));
        if (!keepManual && detected !== effectiveProtocol(selected)) {
          handleUpdate(selected.id, { protocol: detected });
        }
      }
    },
    onError: (err: Error) => {
      setVerifyResult({ kind: "protocol", ok: false, message: err.message });
    },
  });

  const runVerifyAddress = () => {
    if (!selected) return;
    const baseUrl = (selected.base_url ?? "").trim();
    const cli = isCliProvider(selected);
    if (!baseUrl && !cli) {
      showNotice("请先填写请求地址");
      return;
    }
    setVerifyResult(null);
    testMutation.mutate(buildVerifyPayload(selected));
  };

  const requestModelPicker = (tab: ModelPickerTab = "all") => {
    if (!selected) return;
    if (hasFetchedModels(fetchedModels)) {
      setPickerInitialTab(tab);
      setShowModelPicker(true);
      return;
    }
    if (!providerHasUsableKey(selected, keyInput)) {
      showNotice(t("fetchModelsFirst"));
      return;
    }
    setPendingPickerTab(tab);
    fetchModelsMutation.mutate(selected.id);
  };

  const handleFetchModels = () => {
    if (!selected) return;
    if (!providerHasUsableKey(selected, keyInput)) {
      showNotice(t("fillKeyFirst"));
      return;
    }
    setPendingPickerTab("all");
    fetchModelsMutation.mutate(selected.id);
  };

  const handleOpenModelPicker = () => {
    requestModelPicker("all");
  };

  const handleAddModel = (kind: ModelKind) => {
    requestModelPicker(modelKindToPickerTab(kind));
  };

  const runVerifyProtocol = () => {
    if (!selected) return;
    const baseUrl = (selected.base_url ?? "").trim();
    if (!baseUrl && selected.id !== "runninghub") {
      showNotice("请先填写请求地址");
      return;
    }
    setVerifyResult(null);
    const payload = buildVerifyPayload(selected);
    if (isRunningHubContext(selected, baseUrl)) {
      testMutation.mutate(payload);
      return;
    }
    probeAsyncMutation.mutate(payload);
  };

  const handleAdd = () => {
    if (!draft.name?.trim()) return;
    const next: Provider = {
      id: newProviderId(),
      name: draft.name.trim(),
      base_url: draft.base_url?.trim() ?? "",
      api_key: draft.api_key ?? "",
      enabled: draft.enabled ?? true,
      protocol: draft.protocol ?? "openai",
      image_models: [],
      chat_models: [],
      video_models: [],
    };
    const payload = [
      ...providers.map((p) => providerPayload(p)),
      {
        ...providerPayload(next),
        ...(next.api_key?.trim() ? { api_key: next.api_key.trim() } : {}),
      },
    ];
    saveMutation.mutate(payload, {
      onSuccess: () => {
        setSelectedId(next.id);
        setDraft({ name: "", base_url: "", api_key: "", enabled: true, protocol: "openai" });
        setShowAddForm(false);
        notifySave("已添加平台");
      },
    });
  };

  const handleRemove = (id: string) => {
    persist(providers.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdate = (id: string, patch: Partial<Provider>) => {
    persist(providers.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const handleRegionChange = (region: KeyRegion) => {
    if (!selected || !selectedRegionEndpoints) return;
    setRegionOverride(region);
    handleUpdate(selected.id, {
      base_url: keyRegionEndpoint(region, selectedRegionEndpoints),
    });
  };

  const reorderProviders = (sourceId: string, targetId: string) => {
    if (sourceId === targetId || isFixedProvider(sourceId) || isFixedProvider(targetId)) return;
    const sourceIndex = providers.findIndex((p) => p.id === sourceId);
    const targetIndex = providers.findIndex((p) => p.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...providers];
    const [moved] = next.splice(sourceIndex, 1);
    const adjustedTarget = next.findIndex((p) => p.id === targetId);
    next.splice(adjustedTarget, 0, moved);
    persist(next);
  };

  const updateModel = (kind: ModelKind, index: number, value: string) => {
    if (!selected) return;
    const list = [...(selected[kind] ?? [])];
    list[index] = value;
    handleUpdate(selected.id, { [kind]: list });
  };

  const removeModel = (kind: ModelKind, index: number) => {
    if (!selected) return;
    handleUpdate(selected.id, {
      [kind]: (selected[kind] ?? []).filter((_, i) => i !== index),
    });
  };

  const saveKeyOnly = () => {
    if (!selected) return;
    const key = keyInput.trim();
    if (!key) {
      showNotice("请输入 Key");
      return;
    }
    persist(providers, { api_key: key }, "Key 已保存");
  };

  const clearKeyOnly = () => {
    if (!selected) return;
    if (!selected.has_key && !keyInput.trim()) return;
    if (!window.confirm("确认清除当前 Key？")) return;
    persist(providers, { clear_key: true }, "Key 已清除");
  };

  const addCliProvider = (protocol: string) => {
    const labels: Record<string, string> = {
      jimeng: "即梦 CLI",
      codex: "Codex CLI",
      "gemini-cli": "Gemini CLI",
    };
    const next: Provider = {
      id: newProviderId(),
      name: labels[protocol] ?? protocol,
      protocol,
      enabled: true,
      base_url: "",
      image_models: [],
      chat_models: [],
      video_models: [],
    };
    persist([...providers, next], undefined, "已添加 CLI 平台");
    setSelectedId(next.id);
  };

  const applyRecommend = (preset: RecommendedPreset, apiKey?: string) => {
    const next: Provider = {
      id: preset.id,
      name: preset.name,
      base_url: preset.base_url,
      protocol: preset.protocol,
      enabled: true,
      image_models: preset.image_models,
      chat_models: preset.chat_models,
      video_models: preset.video_models,
    };
    const exists = providers.some((p) => p.id === preset.id);
    const payload = exists
      ? providers.map((p) => (p.id === preset.id ? { ...p, ...next } : p))
      : [...providers, next];
    saveMutation.mutate(
      payload.map((p) =>
        providerPayload(
          p,
          p.id === preset.id && apiKey ? { api_key: apiKey } : undefined,
        ),
      ),
      {
        onSuccess: () => {
          setSelectedId(preset.id);
          setShowRecommend(false);
          notifySave(`已应用推荐平台 ${preset.name}`);
        },
      },
    );
  };

  return (
    <div className="studio-workspace-page studio-workspace-page--nested" data-testid="api-settings-page">
      {verifyResult && (
        <VerifyResultDialog result={verifyResult} onClose={() => setVerifyResult(null)} />
      )}

      {saveDialogMessage && (
        <StudioDialog
          open
          onClose={() => setSaveDialogMessage(null)}
          title="已保存"
          variant="success"
          data-testid="api-settings-save-dialog"
          primaryAction={{
            label: "确定",
            onClick: () => setSaveDialogMessage(null),
            testId: "api-settings-save-dialog-confirm",
          }}
        >
          <p className="studio-dialog-message">{saveDialogMessage}</p>
        </StudioDialog>
      )}

      {noticeDialog && (
        <StudioDialog
          open
          onClose={() => setNoticeDialog(null)}
          title={noticeDialog.title}
          variant="warning"
          data-testid="api-settings-notice-dialog"
          primaryAction={{
            label: "确定",
            onClick: () => setNoticeDialog(null),
            testId: "api-settings-notice-dialog-confirm",
          }}
        >
          <p className="studio-dialog-message">{noticeDialog.message}</p>
        </StudioDialog>
      )}

      <div className="studio-workspace-layout">
        <aside className="studio-workspace-sidebar">
          <div className="studio-side-section-title">平台列表</div>
          <div className="studio-provider-list">
            {providers.map((p) => (
              <ProviderCard
                key={p.id}
                item={p}
                active={selectedId === p.id}
                sortable={!isFixedProvider(p.id)}
                dragging={dragId === p.id}
                dropTarget={dropId === p.id}
                onSelect={() => setSelectedId(p.id)}
                onDragStart={(e) => {
                  if (isFixedProvider(p.id)) {
                    e.preventDefault();
                    return;
                  }
                  setDragId(p.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === p.id || isFixedProvider(p.id)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropId(p.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = dragId || e.dataTransfer.getData("text/plain");
                  setDragId(null);
                  setDropId(null);
                  if (sourceId) reorderProviders(sourceId, p.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropId(null);
                }}
              />
            ))}
            {providers.length === 0 && !isLoading && (
              <div className="studio-field-hint px-1">暂无 API 平台，请添加</div>
            )}
          </div>

          <div className="studio-sidebar-actions">
            <button
              type="button"
              className="studio-sidebar-row-btn"
              onClick={() => setShowAddForm((v) => !v)}
              data-testid="provider-toggle-add-form"
            >
              <Plus className="w-4 h-4" />
              新增平台
            </button>
            <button
              type="button"
              className="studio-sidebar-row-btn studio-sidebar-row-recommend"
              onClick={() => setShowRecommend(true)}
              data-testid="provider-recommend-btn"
            >
              <Sparkles className="w-4 h-4" />
              推荐 API
            </button>
          </div>

          {showAddForm && (
            <div className="studio-sidebar-stack">
              <div className="studio-sidebar-form">
                <div className="studio-side-section-title">新增平台</div>
                <label className="studio-field full">
                  <span className="studio-field-label">平台名称</span>
                  <div className="studio-field-frame">
                    <input
                      value={draft.name ?? ""}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="Comfly"
                      data-testid="provider-name-input"
                    />
                  </div>
                </label>
                <label className="studio-field full">
                  <span className="studio-field-label">协议</span>
                  <div className="studio-field-frame">
                    <StudioSelect
                      framed
                      value={draft.protocol ?? "openai"}
                      onChange={(protocol) => setDraft({ ...draft, protocol })}
                      options={protocolOptions(CUSTOM_PLATFORM_PROTOCOLS)}
                      data-testid="provider-protocol-input"
                    />
                  </div>
                </label>
                <label className="studio-field full">
                  <span className="studio-field-label">请求地址</span>
                  <div className="studio-field-frame">
                    <input
                      value={draft.base_url ?? ""}
                      onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      data-testid="provider-url-input"
                    />
                  </div>
                </label>
                <label className="studio-field full">
                  <span className="studio-field-label">API Key</span>
                  <div className="studio-field-frame">
                    <input
                      value={draft.api_key ?? ""}
                      onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
                      placeholder="sk-..."
                      type="password"
                      data-testid="provider-key-input"
                    />
                  </div>
                </label>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!draft.name?.trim() || saveMutation.isPending}
                  className="studio-add-btn"
                  data-testid="provider-add-btn"
                >
                  <Plus className="w-4 h-4" />
                  添加
                </button>
              </div>
            </div>
          )}

          <div className="studio-sidebar-stack">
            <div className="studio-side-section-title">CLI 快捷入口</div>
            <div className="studio-cli-quick-list">
              <button type="button" className="studio-cli-quick-btn" onClick={() => addCliProvider("jimeng")}>
                <Image className="w-3.5 h-3.5" />
                即梦 CLI
              </button>
              <button type="button" className="studio-cli-quick-btn" onClick={() => addCliProvider("codex")}>
                <Terminal className="w-3.5 h-3.5" />
                GPT CLI
              </button>
              <button type="button" className="studio-cli-quick-btn" onClick={() => addCliProvider("gemini-cli")}>
                <Sparkles className="w-3.5 h-3.5" />
                Antigravity CLI
              </button>
            </div>
            <p className="studio-field-hint">需要先安装 CLI 文件夹中的依赖。</p>
          </div>
        </aside>

        <main className="studio-workspace-content">
          {!selected ? (
            <div className="studio-empty-state">从左侧选择平台，或使用「新增平台」创建配置。</div>
          ) : (
            <>
              <div className="studio-content-head">
                <div>
                  <div className="studio-content-head-title">{selected.name}</div>
                  <div className="studio-content-head-sub">配置基础信息、API Key 和可用模型</div>
                </div>
                <div className="studio-content-actions">
                  {!isFixedProvider(selected.id) && (
                    <button
                      type="button"
                      onClick={() => handleRemove(selected.id)}
                      className="studio-action-btn danger"
                      data-testid={`provider-delete-${selected.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除
                    </button>
                  )}
                  {!isCliProvider(selected) && (
                    <button
                      type="button"
                      onClick={() => persist(providers, undefined, "已保存")}
                      disabled={saveMutation.isPending}
                      className="studio-action-btn primary"
                      data-testid={`provider-save-${selected.id}`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      保存
                    </button>
                  )}
                </div>
              </div>

              <section className="studio-block" data-testid={`provider-editor-${selected.id}`}>
                <div className="studio-block-head">
                  <div>
                    <div className="studio-block-title">基本信息</div>
                    <div className="studio-block-desc">
                      {isCliProvider(selected)
                        ? "CLI 平台无需 API Key，请在 CLI 设置中管理登录态"
                        : "显示名与连接配置"}
                    </div>
                  </div>
                </div>

                {isCliProvider(selected) ? (
                  <ProviderCliHint provider={selected} />
                ) : (
                  <div className="studio-form-grid studio-form-grid--basic">
                    <label className="studio-field">
                      <span className="studio-field-label studio-field-label-row">
                        平台名称
                        <span className="studio-id-chip" data-testid="provider-id-chip">
                          {selected.id}
                        </span>
                      </span>
                      <div className="studio-field-frame">
                        <input
                          value={selected.name}
                          onChange={(e) => handleUpdate(selected.id, { name: e.target.value })}
                        />
                      </div>
                    </label>
                    {showProtocolSelector(selected) && (
                      <label className="studio-field">
                        <span className="studio-field-label">协议</span>
                        <div className="studio-field-frame">
                          <StudioSelect
                            framed
                            value={effectiveProtocol(selected)}
                            onChange={(protocol) => handleUpdate(selected.id, { protocol })}
                            options={protocolOptions(CUSTOM_PLATFORM_PROTOCOLS)}
                            data-testid={`provider-protocol-${selected.id}`}
                          />
                        </div>
                      </label>
                    )}
                    {providerUsesRegionTabs(selected) && (
                      <div className="studio-field full studio-key-region-block">
                        <KeyRegionTabs
                          region={selectedRegion}
                          onRegionChange={handleRegionChange}
                          testIdPrefix={
                            isRunningHubProvider(selected)
                              ? "provider-key-link-rh"
                              : "provider-key-link-ms"
                          }
                        />
                      </div>
                    )}
                    <label className="studio-field full">
                      <span className="studio-field-label">请求地址</span>
                      <div className="studio-field-frame">
                        <input
                          value={selected.base_url ?? ""}
                          onChange={(e) => handleUpdate(selected.id, { base_url: e.target.value })}
                          placeholder="https://api.example.com/v1"
                          data-testid={`provider-url-${selected.id}`}
                        />
                      </div>
                      <ProtocolHints
                        provider={selected}
                        onSelectUrl={(url) => handleUpdate(selected.id, { base_url: url })}
                      />
                    </label>
                    <label className="studio-field full studio-field-key">
                      <span className="studio-field-label">API Key</span>
                      <div className="studio-key-row">
                        <div className="studio-field-frame studio-key-input-frame">
                          <input
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            type="password"
                            placeholder={selected.has_key ? "输入新 Key 覆盖" : "输入 Key 后保存"}
                            data-testid="provider-key-editor"
                          />
                          {selected.key_preview && !keyInput && (
                            <span
                              className="studio-key-saved-badge"
                              data-testid="provider-key-hint"
                              title="已保存 Key"
                            >
                              {selected.key_preview}
                            </span>
                          )}
                        </div>
                        <div className="studio-key-actions">
                          <button
                            type="button"
                            className="studio-key-btn"
                            title="保存 Key"
                            onClick={saveKeyOnly}
                            data-testid="provider-save-key-btn"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="studio-key-btn studio-key-clear"
                            title="清除 Key"
                            onClick={clearKeyOnly}
                            data-testid="provider-clear-key-btn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </label>
                    <div className="studio-field full">
                      <div
                        className="studio-key-action-stack"
                        data-testid={
                          isRunningHubProvider(selected)
                            ? "provider-key-link-rh-hints"
                            : selected.id === "modelscope"
                              ? "provider-key-link-ms-hints"
                              : isVolcengineProvider(selected)
                                ? "provider-key-link-volc-hints"
                                : undefined
                        }
                      >
                        {isRunningHubProvider(selected) && (
                          <KeyAcquisitionActions
                            groups={[
                              { title: "RH币", links: RUNNINGHUB_KEY_URLS.coin },
                              { title: "余额", links: RUNNINGHUB_KEY_URLS.wallet },
                            ]}
                            region={selectedRegion}
                            testIdPrefix="provider-key-link-rh"
                          />
                        )}
                        {selected.id === "modelscope" && (
                          <KeyAcquisitionActions
                            groups={[
                              {
                                links: {
                                  cn: MODELSCOPE_TOKEN_URLS.cn,
                                  global: MODELSCOPE_TOKEN_URLS.global,
                                },
                              },
                            ]}
                            region={selectedRegion}
                            testIdPrefix="provider-key-link-ms"
                          />
                        )}
                        {isVolcengineProvider(selected) && <VolcengineKeyActions />}
                        <button
                          type="button"
                          className="studio-action-btn studio-key-action-btn"
                          disabled={testMutation.isPending || probeAsyncMutation.isPending}
                          onClick={runVerifyAddress}
                          data-testid={`provider-verify-address-${selected.id}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {testMutation.isPending ? "验证中..." : "验证地址"}
                        </button>
                        {showProbeProtocolButton(selected) && (
                          <button
                            type="button"
                            className="studio-action-btn studio-key-action-btn"
                            disabled={testMutation.isPending || probeAsyncMutation.isPending}
                            onClick={runVerifyProtocol}
                            data-testid={`provider-verify-protocol-${selected.id}`}
                          >
                            <Radar className="w-3.5 h-3.5" />
                            {probeAsyncMutation.isPending ? "检测中..." : "验证协议"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isCliProvider(selected) && (
                  <div className="studio-key-action-stack studio-verify-action-stack">
                    <button
                      type="button"
                      className="studio-action-btn studio-key-action-btn"
                      disabled={testMutation.isPending}
                      onClick={runVerifyAddress}
                      data-testid={`provider-verify-address-${selected.id}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {testMutation.isPending ? "检测中..." : "检测 CLI"}
                    </button>
                  </div>
                )}
              </section>

              <div className="studio-models-toolbar">
                <div>
                  <div className="studio-block-title">模型列表</div>
                  <div className="studio-block-desc">
                    从上游 API 自动拉取所有可用模型并按类型分类（image / chat / video）
                  </div>
                </div>
                <div className="studio-models-toolbar-actions">
                  <button
                    type="button"
                    className="studio-action-btn primary"
                    disabled={fetchModelsMutation.isPending}
                    onClick={handleFetchModels}
                    data-testid="provider-fetch-models-btn"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" />
                    {fetchModelsMutation.isPending ? t("fetchingModels") : t("fetchModels")}
                  </button>
                  <button
                    type="button"
                    className="studio-action-btn"
                    disabled={fetchModelsMutation.isPending}
                    onClick={handleOpenModelPicker}
                    data-testid="provider-open-picker-btn"
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    {t("selectModels")}
                  </button>
                </div>
              </div>

              <div className="studio-model-grid">
                {MODEL_SECTIONS.map(({ kind, title, desc }) => (
                  <section key={kind} className="studio-block" data-testid={`provider-models-${kind}`}>
                    <div className="studio-block-head">
                      <div>
                        <div className="studio-block-title">{title}</div>
                        <div className="studio-block-desc">{desc}</div>
                      </div>
                      <button
                        type="button"
                        className="studio-ghost-btn"
                        disabled={fetchModelsMutation.isPending}
                        onClick={() => handleAddModel(kind)}
                        data-testid={`provider-add-${kind}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        模型
                      </button>
                    </div>
                    <div className="studio-model-list">
                      {(selected[kind] ?? []).length === 0 ? (
                        <div className="studio-model-empty">暂无模型</div>
                      ) : (
                        (selected[kind] ?? []).map((model, index) => (
                          <div key={`${kind}-${index}`} className="studio-model-row">
                            <input
                              value={model}
                              onChange={(e) => updateModel(kind, index, e.target.value)}
                              data-testid={`provider-model-${kind}-${index}`}
                            />
                            <button
                              type="button"
                              className="studio-icon-btn danger"
                              onClick={() => removeModel(kind, index)}
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                ))}
              </div>

              {selected.id === "modelscope" && (
                <MsLoraManager
                  loras={loraDraft}
                  imageModels={selected.image_models ?? []}
                  onChange={setLoraDraft}
                />
              )}
            </>
          )}
        </main>
      </div>

      <RecommendApiModal
        open={showRecommend}
        onClose={() => setShowRecommend(false)}
        onApply={applyRecommend}
        saving={saveMutation.isPending}
      />

      <ModelPickerModal
        open={showModelPicker}
        fetched={fetchedModels}
        initialTab={pickerInitialTab}
        existing={{
          image_models: selected?.image_models,
          chat_models: selected?.chat_models,
          video_models: selected?.video_models,
        }}
        onClose={() => setShowModelPicker(false)}
        onApply={applyPickedModels}
      />
    </div>
  );
}
