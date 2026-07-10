import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../shared/api/client";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { StudioDialog } from "../../../shared/ui/StudioDialog";
import { cn } from "../../../shared/utils";
import { ComfyInstancesEditor } from "./ComfyInstancesEditor";
import { WorkflowGraphView } from "./WorkflowGraphView";
import { fieldsFromMiniCanvas, WorkflowMiniCanvas } from "./WorkflowMiniCanvas";
import { WorkflowNodePopup } from "./WorkflowNodePopup";
import { WorkflowPreviewModal } from "./WorkflowPreviewModal";
import type { ComfyWorkflow } from "./workflowGraph";
import {
  buildPreviewValues,
  type PreviewValues,
  type WorkflowField,
} from "./workflowFieldUtils";
import {
  defaultMiniTestNodes,
  miniNodesToPositions,
  syncMiniNodesForFields,
  type MiniCardPositions,
  type MiniTestNode,
} from "./workflowMiniCanvasUtils";

interface WorkflowConfig {
  title: string;
  fields: WorkflowField[];
  mini_cards?: MiniCardPositions;
}

interface WorkflowItem {
  name: string;
  title?: string;
  config?: WorkflowConfig;
}

interface RhWorkflow {
  workflowId: string;
  title?: string;
  name?: string;
}

type WorkspaceMode = "graph" | "canvas";

export function WorkflowsSettingsPage() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadJson, setUploadJson] = useState("{}");
  const [saveDialogMessage, setSaveDialogMessage] = useState<string | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("graph");
  const [configDraft, setConfigDraft] = useState<WorkflowConfig>({ title: "", fields: [] });
  const [popupNodeId, setPopupNodeId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [previewValues, setPreviewValues] = useState<PreviewValues>({});
  const [runMessage, setRunMessage] = useState("");
  const [runResultUrl, setRunResultUrl] = useState("");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [miniNodes, setMiniNodes] = useState<MiniTestNode[]>(defaultMiniTestNodes());

  const { data: comfyData } = useQuery({
    queryKey: ["comfy-instances"],
    queryFn: () => api.get<{ instances: string[] }>("/api/comfyui/instances"),
  });

  const { data: wfList } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.get<{ workflows: WorkflowItem[] }>("/api/workflows"),
  });

  const { data: wfDetail } = useQuery({
    queryKey: ["workflow", selectedName],
    queryFn: () =>
      api.get<{ config?: WorkflowConfig; workflow?: ComfyWorkflow }>(
        `/api/workflows/${encodeURIComponent(selectedName!)}`,
      ),
    enabled: !!selectedName,
  });

  const { data: rhData } = useQuery({
    queryKey: ["rh-workflows"],
    queryFn: () => api.get<{ workflows: RhWorkflow[] }>("/api/runninghub/workflows"),
  });

  const notifySave = (message: string) => setSaveDialogMessage(message);
  const showNotice = (message: string, title = "提示") => setNoticeDialog({ title, message });

  const saveComfy = useMutation({
    mutationFn: (instances: string[]) => api.put("/api/comfyui/instances", { instances }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comfy-instances"] });
      notifySave("ComfyUI 地址已保存");
    },
  });

  const uploadWorkflow = useMutation({
    mutationFn: (payload: { name: string; workflow: Record<string, unknown> }) =>
      api.post<{ name?: string }>("/api/workflows", payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      if (res.name) setSelectedName(res.name);
      setUploadName("");
      setUploadJson("{}");
      notifySave("工作流已上传");
    },
  });

  const saveConfig = useMutation({
    mutationFn: (payload: { name: string; config: WorkflowConfig }) =>
      api.put(`/api/workflows/${encodeURIComponent(payload.name)}/config`, payload.config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", selectedName] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      notifySave("配置已保存");
    },
  });

  const resolveRunImageUrl = (res: Record<string, unknown>) => {
    const outputs = (res.outputs ?? res.images) as string[] | undefined;
    const first = outputs?.[0];
    if (!first) return "";
    if (/^https?:\/\//i.test(first)) return first;
    return `/api/download-output?inline=1&url=${encodeURIComponent(first)}`;
  };

  const runWorkflow = useMutation({
    mutationFn: () => {
      const fields =
        workspaceMode === "canvas"
          ? fieldsFromMiniCanvas(previewValues, configDraft.fields, miniNodes)
          : previewValues;
      return api.post<Record<string, unknown>>(
        `/api/workflows/${encodeURIComponent(selectedName!)}/run`,
        {
          fields,
          config: { ...configDraft, title: titleDraft || configDraft.title },
        },
      );
    },
    onSuccess: (res) => {
      const err = typeof res.error === "string" ? res.error : "";
      if (err) {
        setRunMessage(err);
        setRunResultUrl("");
        showNotice(err, "测试运行失败");
        return;
      }
      const img = resolveRunImageUrl(res);
      setRunResultUrl(img);
      setRunMessage(img ? "运行完成，结果如下" : "测试运行已提交");
    },
    onError: (err: Error) => {
      setRunMessage(err.message);
      setRunResultUrl("");
      showNotice(err.message, "测试运行失败");
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: (name: string) => api.delete(`/api/workflows/${encodeURIComponent(name)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setSelectedName(null);
      notifySave("工作流已删除");
    },
  });

  const instances = comfyData?.instances ?? [];
  const workflows = wfList?.workflows ?? [];
  const rhWorkflows = rhData?.workflows ?? [];
  const workflowJson = (wfDetail?.workflow ?? {}) as ComfyWorkflow;
  const popupNode = popupNodeId ? workflowJson[popupNodeId] : null;

  useEffect(() => {
    if (!workflows.length) {
      setSelectedName(null);
      return;
    }
    if (!selectedName || !workflows.some((w) => w.name === selectedName)) {
      setSelectedName(workflows[0].name);
    }
  }, [workflows, selectedName]);

  useEffect(() => {
    const cfg = wfDetail?.config ?? { title: selectedName?.replace(/\.json$/, "") ?? "", fields: [] };
    const nextPreview = buildPreviewValues(cfg.fields, {});
    setConfigDraft(cfg);
    setTitleDraft(cfg.title || selectedName?.replace(/\.json$/, "") || "");
    setPopupNodeId(null);
    setPreviewValues(nextPreview);
    setMiniNodes(syncMiniNodesForFields(cfg.fields, nextPreview, cfg.mini_cards ?? {}, []));
    setRunMessage("");
    setRunResultUrl("");
    setPreviewModalOpen(false);
  }, [wfDetail, selectedName]);

  useEscapeKey(!!popupNodeId, () => setPopupNodeId(null));

  const handleUploadFile = async (file: File) => {
    try {
      const text = await file.text();
      const workflow = JSON.parse(text) as Record<string, unknown>;
      const baseName = file.name.replace(/\.json$/i, "");
      const name = uploadName.trim() || baseName;
      if (!name) {
        showNotice("请输入工作流名称");
        return;
      }
      uploadWorkflow.mutate({ name, workflow });
    } catch {
      showNotice("JSON 无效");
    }
  };

  const handleUpload = () => {
    if (!uploadName.trim()) return;
    try {
      const workflow = JSON.parse(uploadJson) as Record<string, unknown>;
      uploadWorkflow.mutate({ name: uploadName.trim(), workflow });
    } catch {
      showNotice("JSON 无效");
    }
  };

  const handleSaveConfig = () => {
    if (!selectedName) return;
    saveConfig.mutate({
      name: selectedName,
      config: { ...configDraft, title: titleDraft || configDraft.title },
    });
  };

  const updateFields = (fields: WorkflowField[]) => {
    setPreviewValues((prevValues) => {
      const nextValues = buildPreviewValues(fields, prevValues);
      setMiniNodes((prevNodes) => syncMiniNodesForFields(fields, nextValues, {}, prevNodes));
      return nextValues;
    });
    setConfigDraft((prev) => ({ ...prev, fields }));
  };

  const setPreviewValue = (fieldId: string, value: unknown) => {
    setPreviewValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleMiniNodesChange = (nodes: MiniTestNode[]) => {
    setMiniNodes(nodes);
    setConfigDraft((prev) => ({ ...prev, mini_cards: miniNodesToPositions(nodes) }));
  };

  return (
    <div className="studio-workspace-page studio-workspace-page--nested" data-testid="workflows-settings-page">
      {saveDialogMessage && (
        <StudioDialog
          open
          onClose={() => setSaveDialogMessage(null)}
          title="已保存"
          variant="success"
          data-testid="workflows-settings-save-dialog"
          primaryAction={{
            label: "确定",
            onClick: () => setSaveDialogMessage(null),
            testId: "workflows-settings-save-dialog-confirm",
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
          data-testid="workflows-settings-notice-dialog"
          primaryAction={{
            label: "确定",
            onClick: () => setNoticeDialog(null),
            testId: "workflows-settings-notice-dialog-confirm",
          }}
        >
          <p className="studio-dialog-message">{noticeDialog.message}</p>
        </StudioDialog>
      )}

      <div className="studio-workspace-layout">
        <aside className="studio-workspace-sidebar">
          <div className="studio-side-card">
            <div className="studio-side-section-title">ComfyUI 后端地址</div>
            <ComfyInstancesEditor
              instances={instances}
              saving={saveComfy.isPending}
              onSave={(list) => saveComfy.mutate(list)}
            />
          </div>

          <div className="studio-side-card" data-testid="workflow-crud-section">
            <div className="studio-side-section-title">工作流列表</div>
            <div className="studio-workflow-list">
              {workflows.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  className={cn("studio-workflow-card", selectedName === w.name && "active")}
                  onClick={() => setSelectedName(w.name)}
                  data-testid={`workflow-row-${w.name}`}
                >
                  <span className="studio-workflow-icon">WF</span>
                  <span className="min-w-0 flex-1 text-left">
                    <div className="studio-workflow-name">{w.title || w.config?.title || w.name}</div>
                    <div className="studio-workflow-meta">{w.name}</div>
                  </span>
                </button>
              ))}
              {workflows.length === 0 && (
                <div className="studio-field-hint px-1">暂无本地工作流</div>
              )}
            </div>
            <div className="studio-sidebar-form">
              <input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="工作流名称（可选，默认取文件名）"
                className="studio-field-input"
                data-testid="workflow-upload-name"
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                data-testid="workflow-upload-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleUploadFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploadWorkflow.isPending}
                className="studio-upload-btn"
                data-testid="workflow-upload-btn"
              >
                <Upload className="w-3.5 h-3.5" />
                上传工作流 JSON
              </button>
              <details className="studio-upload-advanced">
                <summary>手动粘贴 JSON</summary>
                <div className="studio-field-frame">
                  <textarea
                    value={uploadJson}
                    onChange={(e) => setUploadJson(e.target.value)}
                    data-testid="workflow-upload-json"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!uploadName.trim() || uploadWorkflow.isPending}
                  className="studio-upload-btn"
                  data-testid="workflow-upload-json-btn"
                >
                  提交 JSON
                </button>
              </details>
            </div>
          </div>
        </aside>

        <main className="studio-workspace-content">
          {!selectedName ? (
            <div className="studio-empty-state">从左侧选择工作流，或上传新的 API 工作流。</div>
          ) : (
            <div className="studio-graph-workspace" data-testid="workflow-graph-workspace">
              <div className="studio-content-head">
                <div className="studio-workflow-title-wrap">
                  <input
                    className="studio-workflow-title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="工作流名称"
                    data-testid="workflow-title-input"
                  />
                  <div className="studio-content-head-sub">{selectedName}</div>
                </div>
                <div className="studio-content-actions">
                  <button
                    type="button"
                    className={cn("studio-action-btn", previewModalOpen && "active")}
                    onClick={() => setPreviewModalOpen(true)}
                    data-testid="workflow-preview-modal-toggle"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    节点预览
                    {configDraft.fields.length > 0 ? (
                      <span className="studio-action-badge">{configDraft.fields.length}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={saveConfig.isPending}
                    className="studio-action-btn primary"
                    data-testid={`workflow-save-${selectedName}`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存配置
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteWorkflow.mutate(selectedName)}
                    className="studio-action-btn danger"
                    data-testid={`workflow-delete-${selectedName}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>

              <div className="studio-workspace-mode-tabs">
                <button
                  type="button"
                  className={workspaceMode === "graph" ? "active" : ""}
                  onClick={() => setWorkspaceMode("graph")}
                  data-testid="workflow-tab-graph"
                >
                  工作流
                </button>
                <button
                  type="button"
                  className={workspaceMode === "canvas" ? "active" : ""}
                  onClick={() => setWorkspaceMode("canvas")}
                  data-testid="workflow-tab-canvas"
                >
                  测试画布
                </button>
              </div>

              {workspaceMode === "graph" ? (
                <>
                  <WorkflowGraphView
                    workflow={workflowJson}
                    fields={configDraft.fields}
                    activeNodeId={popupNodeId}
                    onNodeClick={(nodeId) => setPopupNodeId(nodeId)}
                  />
                  {popupNodeId && popupNode && (
                    <WorkflowNodePopup
                      nodeId={popupNodeId}
                      node={popupNode}
                      fields={configDraft.fields}
                      onClose={() => setPopupNodeId(null)}
                      onChange={updateFields}
                    />
                  )}
                </>
              ) : (
                <WorkflowMiniCanvas
                  title={titleDraft || selectedName.replace(/\.json$/, "")}
                  fields={configDraft.fields}
                  values={previewValues}
                  onChange={setPreviewValue}
                  nodes={miniNodes}
                  onNodesChange={handleMiniNodesChange}
                  onRun={() => runWorkflow.mutate()}
                  running={runWorkflow.isPending}
                  runMessage={runMessage}
                  runResultUrl={runResultUrl}
                />
              )}

              <WorkflowPreviewModal
                open={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                title={titleDraft || selectedName.replace(/\.json$/, "")}
                fields={configDraft.fields}
                values={previewValues}
                onChange={setPreviewValue}
                onRun={() => runWorkflow.mutate()}
                running={runWorkflow.isPending}
                runMessage={runMessage}
                runResultUrl={runResultUrl}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
