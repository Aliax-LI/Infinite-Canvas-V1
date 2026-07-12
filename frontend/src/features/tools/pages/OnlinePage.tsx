import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTranslation } from "react-i18next";

import { Plus } from "lucide-react";

import {
  pollLegacyUntilDone,
  submitCanvasImageTask,
} from "../../canvas/core/generation";

import { api } from "../../../shared/api/client";

import { formatApiError } from "../../../shared/api/formatError";

import { HistoryMasonry, type HistoryItem } from "../../../shared/components/HistoryMasonry";

import { Lightbox } from "../../../shared/components/Lightbox";

import { StudioWorkbenchLayout } from "../../../shared/components/StudioWorkbenchLayout";

import { StudioSelect } from "../../../shared/ui/StudioSelect";

import {

  imageCapableProviders,

  pickDefaultImageProvider,

  resolveImageModel,

} from "../../chat/providers";

import type { AiConfig } from "../../chat/types";

import {
  ToolResultActions,
} from "../shared/ToolResultActions";

import {
  MAX_ONLINE_REFS,
  createRefId,

  mergeRefs,

  readDroppedImageUrl,

  toReferencePayload,

  type OnlineRefFile,

} from "./onlineRefs";

import {

  ONLINE_RATIOS,

  ONLINE_RESOLUTIONS,

  onlinePreviewSlotMode,

  onlinePreviewSlotStyle,

  qualityApplies,

  resolveOnlineSize,

  type OnlineRatio,

  type OnlineResolution,

} from "./onlineSize";



type PreviewState = { urls: string[]; index: number };

const REF_SLOT_LABELS = ["studio.slotMain", "studio.slotAuxA", "studio.slotAuxB"] as const;



function resultGridClass(count: number): string {

  const base = "studio-online-result-grid grid gap-3 justify-items-center content-center";

  if (count <= 1) return `${base} studio-online-result-grid--single`;

  const bounded = `${base} studio-online-result-grid--bounded`;

  if (count === 2) return `${bounded} studio-online-result-grid--duo grid-cols-1 sm:grid-cols-2`;

  return `${bounded} studio-online-result-grid--quad grid-cols-2`;

}



function revokeBlobUrl(url: string | undefined) {

  if (url?.startsWith("blob:")) {

    URL.revokeObjectURL(url);

  }

}



export function OnlinePage() {

  const { t } = useTranslation("studio");

  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState("");

  const [ratio, setRatio] = useState<OnlineRatio>("square");

  const [resolution, setResolution] = useState<OnlineResolution>("1k");

  const [quality, setQuality] = useState("auto");

  const [count, setCount] = useState(1);

  const [providerId, setProviderId] = useState("");

  const [model, setModel] = useState("");

  const [refs, setRefs] = useState<OnlineRefFile[]>([]);
  const refsRef = useRef(refs);
  refsRef.current = refs;

  const [refDragOver, setRefDragOver] = useState(false);

  const [refUploading, setRefUploading] = useState(false);

  const [refError, setRefError] = useState<string | null>(null);

  const [results, setResults] = useState<string[]>([]);

  const [skeletonCount, setSkeletonCount] = useState(0);

  const [preview, setPreview] = useState<PreviewState | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const { data: config } = useQuery({

    queryKey: ["online-config"],

    queryFn: () => api.get<AiConfig>("/api/config"),

  });



  const imageProviders = useMemo(() => imageCapableProviders(config), [config]);

  const refsAtLimit = refs.length >= MAX_ONLINE_REFS;

  const hasUploadingRefs = refs.some((ref) => ref.uploading);

  const refSlots = useMemo(
    () => Array.from({ length: MAX_ONLINE_REFS }, (_, index) => refs[index] ?? null),
    [refs],
  );



  useEffect(() => {

    if (!config) return;

    const nextProvider = pickDefaultImageProvider(config, providerId);

    const nextModel = resolveImageModel(config, nextProvider, model);

    setProviderId(nextProvider);

    setModel(nextModel);

  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync when config loads



  useEffect(() => {
    return () => {
      refsRef.current.forEach((ref) => revokeBlobUrl(ref.url));
    };
  }, []);



  const models = useMemo(() => {

    const provider = imageProviders.find((p) => p.id === providerId);

    return provider?.image_models?.length

      ? provider.image_models

      : config?.image_models ?? [];

  }, [imageProviders, providerId, config]);



  const size = resolveOnlineSize(ratio, resolution);

  const selectedProvider = imageProviders.find((p) => p.id === providerId);

  const showQuality = qualityApplies(selectedProvider?.protocol, providerId);



  const providerOptions = useMemo(

    () =>

      imageProviders.length === 0

        ? [{ value: "", label: t("online.noProviders") }]

        : imageProviders.map((p) => ({ value: p.id, label: p.name || p.id })),

    [imageProviders, t],

  );



  const modelOptions = useMemo(

    () => models.map((m) => ({ value: m, label: m })),

    [models],

  );



  const resolutionOptions = useMemo(

    () => ONLINE_RESOLUTIONS.map((r) => ({ value: r, label: r.toUpperCase() })),

    [],

  );



  const ratioOptions = useMemo(

    () => ONLINE_RATIOS.map((p) => ({ value: p.id, label: t(p.labelKey) })),

    [t],

  );



  const qualityOptions = useMemo(

    () => [

      { value: "auto", label: t("online.qualityAuto") },

      { value: "low", label: t("online.qualityLow") },

      { value: "medium", label: t("online.qualityMedium") },

      { value: "high", label: t("online.qualityHigh") },

    ],

    [t],

  );



  const countOptions = useMemo(

    () =>

      [1, 2, 3, 4].map((n) => ({

        value: String(n),

        label: `×${n}`,

      })),

    [],

  );



  const openPreview = (url: string, context?: { urls: string[]; index: number }) => {

    if (context?.urls?.length) {

      setPreview({ urls: context.urls, index: context.index });

      return;

    }

    setPreview({ urls: [url], index: 0 });

  };



  const openRefPreview = (index: number) => {

    const ready = refs.filter((ref) => ref.url && !ref.uploading);

    const urls = ready.map((ref) => ref.url);

    if (!urls.length) return;

    const target = refs[index]?.url;

    const resolvedIndex = target ? Math.max(0, urls.indexOf(target)) : 0;

    setPreview({ urls, index: resolvedIndex });

  };



  const removeRef = useCallback((id: string) => {

    setRefs((prev) => {

      const target = prev.find((ref) => ref.id === id);

      revokeBlobUrl(target?.url);

      return prev.filter((ref) => ref.id !== id);

    });

  }, []);



  const addRefFromUrl = useCallback(

    (url: string, meta?: { name?: string; mime?: string }) => {

      const clean = url.trim();

      if (!clean) return;

      setRefError(null);

      setRefs((prev) =>

        mergeRefs(prev, [

          {

            id: createRefId(),

            url: clean,

            serverUrl: clean,

            name: meta?.name,

            mime: meta?.mime,

          },

        ]),

      );

    },

    [],

  );



  const uploadReferenceFiles = useCallback(

    async (files: File[]) => {

      if (!files.length) return;

      const available = Math.max(0, MAX_ONLINE_REFS - refs.length);

      if (!available) {

        setRefError(t("online.refLimit", { count: MAX_ONLINE_REFS }));

        return;

      }



      const selected = files.slice(0, available);

      const optimistic: OnlineRefFile[] = selected.map((file) => ({

        id: createRefId(),

        url: URL.createObjectURL(file),

        name: file.name,

        mime: file.type,

        uploading: true,

      }));



      setRefError(null);

      setRefs((prev) => mergeRefs(prev, optimistic));

      setRefUploading(true);



      try {

        const form = new FormData();

        selected.forEach((file) => form.append("files", file));

        const data = await api.upload<{

          files?: Array<{ url: string; name?: string; mime?: string }>;

        }>("/api/ai/upload", form);



        const uploaded = data.files ?? [];

        setRefs((prev) => {

          const next = [...prev];

          optimistic.forEach((placeholder, index) => {

            const slot = next.findIndex((ref) => ref.id === placeholder.id);

            if (slot < 0) return;

            const server = uploaded[index];

            revokeBlobUrl(placeholder.url);

            if (server?.url) {

              next[slot] = {

                id: placeholder.id,

                url: server.url,

                serverUrl: server.url,

                name: server.name ?? placeholder.name,

                mime: server.mime ?? placeholder.mime,

              };

            } else {

              next.splice(slot, 1);

            }

          });

          return next.slice(0, MAX_ONLINE_REFS);

        });

        if (uploaded.length < selected.length) {

          setRefError(t("online.refUploadFailed"));

        }

      } catch (err) {

        setRefs((prev) => {

          optimistic.forEach((placeholder) => revokeBlobUrl(placeholder.url));

          const ids = new Set(optimistic.map((item) => item.id));

          return prev.filter((ref) => !ids.has(ref.id));

        });

        setRefError(formatApiError(err, t("online.refUploadFailed")));

      } finally {

        setRefUploading(false);

      }

    },

    [refs.length, t],

  );



  const handleRefDrop = useCallback(

    (event: DragEvent) => {

      event.preventDefault();

      setRefDragOver(false);

      if (refsAtLimit) {

        setRefError(t("online.refLimit", { count: MAX_ONLINE_REFS }));

        return;

      }

      const droppedUrl = readDroppedImageUrl(event.dataTransfer);

      if (droppedUrl) {

        addRefFromUrl(droppedUrl);

        return;

      }

      const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));

      if (files.length) void uploadReferenceFiles(files);

    },

    [addRefFromUrl, refsAtLimit, t, uploadReferenceFiles],

  );



  const openRefFilePicker = useCallback(() => {

    if (refsAtLimit || refUploading) return;

    const input = document.createElement("input");

    input.type = "file";

    input.accept = "image/*";

    input.multiple = true;

    input.onchange = () => {

      if (input.files?.length) void uploadReferenceFiles([...input.files]);

    };

    input.click();

  }, [refsAtLimit, refUploading, uploadReferenceFiles]);



  const addArchiveImageAsRef = useCallback(

    (url: string, item: HistoryItem) => {

      addRefFromUrl(url, { name: item.prompt });

    },

    [addRefFromUrl],

  );



  useEffect(() => {

    const handlePaste = (event: ClipboardEvent) => {

      const files = [...(event.clipboardData?.items ?? [])]

        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))

        .map((item) => item.getAsFile())

        .filter((file): file is File => Boolean(file));

      if (!files.length) return;

      event.preventDefault();

      void uploadReferenceFiles(files);

    };

    window.addEventListener("paste", handlePaste);

    return () => window.removeEventListener("paste", handlePaste);

  }, [uploadReferenceFiles]);



  const handleSubmit = async () => {

    if (!prompt.trim() || hasUploadingRefs) return;

    const n = count;

    setLoading(true);

    setError(null);

    setResults([]);

    setSkeletonCount(n);

    try {

      const body: Record<string, unknown> = {

        prompt: prompt.trim(),

        provider_id: providerId || undefined,

        model: model || undefined,

        size,

        n,

        reference_images: toReferencePayload(refs),

      };

      if (showQuality) body.quality = quality;

      const submitted = await submitCanvasImageTask(body);
      if (submitted.error) {
        setError(submitted.error);
        return;
      }
      if (!submitted.taskId) {
        setError(t("online.generateFailed"));
        return;
      }

      const polled = await pollLegacyUntilDone(submitted.taskId);
      if (polled.error) {
        setError(polled.error);
        return;
      }

      const urls =
        polled.urls?.length
          ? polled.urls.filter(Boolean)
          : polled.url
            ? [polled.url]
            : [];

      if (!urls.length) {
        setError(t("online.generateFailed"));
        return;
      }

      setResults(urls);

      await queryClient.invalidateQueries({ queryKey: ["history", "online"] });

    } catch (err) {

      setError(formatApiError(err, t("online.generateFailed")));

    } finally {

      setLoading(false);

      setSkeletonCount(0);

    }

  };



  const showSkeletons = loading && skeletonCount > 0;

  const showEmpty = !loading && results.length === 0;



  const sidebar = (

    <>

      <section>

        <div className="flex items-center justify-between gap-2 mb-2">

          <p className="text-sm">{t("online.referenceImages")}</p>

          <p className="text-xs text-[var(--muted)]" data-testid="online-ref-count">

            {refs.length}/{MAX_ONLINE_REFS}

          </p>

        </div>

        <div

          className={`studio-tool-slot-grid ${refDragOver ? "ring-1 ring-black" : ""}`}

          data-testid="online-refs"

          onDragOver={(e) => {

            e.preventDefault();

            setRefDragOver(true);

          }}

          onDragLeave={() => setRefDragOver(false)}

          onDrop={handleRefDrop}

        >

          {refSlots.map((ref, index) => {

            const isUploadSlot = !ref && index === refs.length && !refsAtLimit;

            return (

              <div

                key={ref?.id ?? `empty-${index}`}

                className={`studio-tool-ref-slot${refUploading ? " opacity-50 pointer-events-none" : ""}`}

                data-testid={

                  isUploadSlot

                    ? "online-upload"

                    : ref

                      ? `online-ref-${ref.id}`

                      : `online-ref-slot-${index + 1}`

                }

                onClick={() => {

                  if (!ref && !refsAtLimit) openRefFilePicker();

                }}

                onKeyDown={(e) => {

                  if (!ref && !refsAtLimit && (e.key === "Enter" || e.key === " ")) {

                    e.preventDefault();

                    openRefFilePicker();

                  }

                }}

                role={ref ? undefined : "button"}

                tabIndex={ref || refsAtLimit || refUploading ? -1 : 0}

              >

                {ref ? (

                  <>

                    <button

                      type="button"

                      className="absolute inset-0 z-0 disabled:cursor-wait"

                      disabled={ref.uploading}

                      aria-label={t("online.preview")}

                      data-testid="online-ref-open"

                      onClick={(e) => {

                        e.stopPropagation();

                        openRefPreview(refs.indexOf(ref));

                      }}

                    >

                      <img

                        src={ref.url}

                        alt={ref.name ?? ""}

                        data-testid="online-ref-thumb"

                      />

                    </button>

                    {ref.uploading && (

                      <div

                        className="absolute inset-0 z-[1] bg-black/35 flex items-center justify-center text-[10px] uppercase tracking-widest text-white"

                        data-testid="online-ref-uploading"

                      >

                        {t("online.refUploading")}

                      </div>

                    )}

                    <button

                      type="button"

                      className="studio-tool-ref-slot-clear"

                      aria-label={t("online.removeRef")}

                      onClick={(e) => {

                        e.stopPropagation();

                        removeRef(ref.id);

                      }}

                      data-testid="online-ref-remove"

                    >

                      ×

                    </button>

                  </>

                ) : (

                  <>

                    <Plus className="w-4 h-4 text-[var(--muted)]" />

                    <span className="studio-tool-ref-slot-label">{t(REF_SLOT_LABELS[index])}</span>

                  </>

                )}

              </div>

            );

          })}

        </div>

        {refError && (

          <p className="text-xs text-red-600 mt-2" data-testid="online-ref-error" role="alert">

            {refError}

          </p>

        )}

        <p className="text-xs text-[var(--muted)] mt-2">{t("online.refDropHint")}</p>

      </section>



      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <label className="flex flex-col gap-1 text-sm">

          <span>{t("online.provider")}</span>

          <StudioSelect

            value={providerId}

            onChange={(next) => {

              setProviderId(next);

              setModel(resolveImageModel(config, next, ""));

            }}

            options={providerOptions}

            data-testid="online-provider"

          />

        </label>

        <label className="flex flex-col gap-1 text-sm">

          <span>{t("online.model")}</span>

          <StudioSelect

            value={model}

            onChange={setModel}

            options={modelOptions}

            data-testid="online-model"

          />

        </label>

      </div>



      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <label className="flex flex-col gap-1 text-sm">

          <span>{t("online.resolution")}</span>

          <StudioSelect

            value={resolution}

            onChange={(v) => setResolution(v as OnlineResolution)}

            options={resolutionOptions}

            data-testid="online-resolution"

          />

        </label>

        <label className="flex flex-col gap-1 text-sm">

          <span>{t("online.size")}</span>

          <StudioSelect

            value={ratio}

            onChange={(v) => setRatio(v as OnlineRatio)}

            options={ratioOptions}

            data-testid="online-size"

          />

        </label>

      </div>



      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {showQuality && (

          <label className="flex flex-col gap-1 text-sm">

            <span>{t("online.quality")}</span>

            <StudioSelect

              value={quality}

              onChange={setQuality}

              options={qualityOptions}

              data-testid="online-quality"

            />

          </label>

        )}

        <label className="flex flex-col gap-1 text-sm">

          <span>{t("online.count")}</span>

          <StudioSelect

            value={String(count)}

            onChange={(v) => setCount(Number(v))}

            options={countOptions}

            data-testid="online-count"

          />

        </label>

      </div>



      <p className="text-xs text-[var(--muted)]" data-testid="online-size-hint">

        {t("online.sizeHint", { size })}

      </p>



      <textarea

        value={prompt}

        onChange={(e) => setPrompt(e.target.value)}

        placeholder={t("online.promptPlaceholder")}

        className="w-full h-32 border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"

        data-testid="online-page-prompt"

      />



      <button

        type="button"

        onClick={handleSubmit}

        disabled={loading || !prompt.trim() || hasUploadingRefs}

        className="w-full px-6 py-2.5 bg-black text-white text-sm disabled:opacity-50"

        data-testid="online-page-submit"

      >

        {loading ? t("studio.processing") : t("common.submit")}

      </button>



      {error && (

        <p className="text-sm text-red-600" data-testid="online-error" role="alert">

          {error}

        </p>

      )}

    </>

  );



  const previewSlotMode = onlinePreviewSlotMode(showSkeletons ? skeletonCount : results.length);

  const main = (

    <div
      className={[
        "studio-workbench-stage studio-workbench-stage--fit",
        showSkeletons ? "studio-workbench-stage--loading" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="online-page-result"
      aria-busy={showSkeletons || undefined}
    >

      {showSkeletons && (

        <div

          className={resultGridClass(skeletonCount)}

          data-testid="online-skeleton-grid"

          aria-busy="true"

          aria-label={t("online.generating")}

        >

          {Array.from({ length: skeletonCount }, (_, idx) => (

            <div

              key={idx}

              className="studio-online-preview-slot studio-online-preview-slot--loading"

              style={onlinePreviewSlotStyle(size, previewSlotMode, { loading: true })}

              data-testid={`online-skeleton-${idx}`}

            >

              <div className="studio-online-skeleton-base" aria-hidden="true" />

              <div className="studio-online-skeleton-shimmer" aria-hidden="true" />

              <div className="studio-online-skeleton-label">

                <span className="studio-online-skeleton-spinner" aria-hidden="true" />

                <span>{t("online.generating")}</span>

              </div>

            </div>

          ))}

        </div>

      )}

      {showEmpty && (

        <div className="w-full h-full flex items-center justify-center">

          <p className="text-xs uppercase tracking-widest text-[var(--muted)] opacity-50">

            {t("online.canvasReady")}

          </p>

        </div>

      )}

      {!loading && results.length > 0 && (
        <ToolResultActions
          urls={results}
          itemTitle={t("online.title")}
          testId="online-result-actions"
          showDownload={false}
        />
      )}

      {!loading && results.length > 0 && (

        <div className={resultGridClass(results.length)} data-testid="online-result-grid">

          {results.map((url, idx) => (

            <button

              key={`${url}-${idx}`}

              type="button"

              className="studio-online-preview-slot"

              style={onlinePreviewSlotStyle(size, onlinePreviewSlotMode(results.length))}

              onClick={() => setPreview({ urls: results, index: idx })}

              data-testid={`online-result-img-${idx}`}

            >

              <img src={url} alt="" className="w-full h-full object-contain cursor-pointer" />

            </button>

          ))}

        </div>

      )}

    </div>

  );



  const footer = (

    <>

      <h2 className="text-sm font-medium mb-3">{t("studio.archives")}</h2>

      <HistoryMasonry

        type="online"

        onPreview={openPreview}

        onAddReference={addArchiveImageAsRef}

        testId="online-history"

      />

    </>

  );



  const previewUrl = preview?.urls[preview.index];



  return (

    <div data-testid="online-page" className="h-full">

      <StudioWorkbenchLayout

        testId="online-workbench"

        title={t("online.title")}

        backTo="/canvases"

        sidebarWidth="medium"

        matchSidebarHeight

        sidebar={sidebar}

        main={main}

        footer={footer}

      />



      {preview && (

        <Lightbox

          urls={preview.urls}

          index={preview.index}

          onIndexChange={(i) => setPreview((prev) => (prev ? { ...prev, index: i } : prev))}

          onClose={() => setPreview(null)}

          extraAction={

            previewUrl

              ? {

                  label: t("online.addRef"),

                  onClick: () => {

                    addRefFromUrl(previewUrl);

                    setPreview(null);

                  },

                  testId: "lightbox-add-ref",

                }

              : undefined

          }

        />

      )}

    </div>

  );

}


