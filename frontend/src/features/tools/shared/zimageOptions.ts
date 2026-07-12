import type { AiConfig } from "../../chat/types";
import {
  buildPreviewValues,
  fieldKind,
  type WorkflowField,
} from "../../settings/workflows/workflowFieldUtils";

export const ZIMAGE_WORKFLOW_STORAGE_KEY = "zimage_local_workflow";
export const ZIMAGE_CLOUD_MODEL_STORAGE_KEY = "zimage_cloud_model";
export const ZIMAGE_CONTROL_TYPE_STORAGE_KEY = "zimage_control_type";
export const ZIMAGE_CONTROL_RESOLUTION_STORAGE_KEY = "zimage_control_resolution";

/** Output size for control workflow EmptySD3LatentImage (#70:41) */
export type ZimageControlResolutionMode = "follow" | "512" | "768" | "1024" | "custom";

export const ZIMAGE_CONTROL_RESOLUTION_MODES: ZimageControlResolutionMode[] = [
  "follow",
  "512",
  "768",
  "1024",
  "custom",
];

export const DEFAULT_ZIMAGE_CONTROL_RESOLUTION: ZimageControlResolutionMode = "follow";

/** Control types supported by Z-Image-Turbo-Fun-Controlnet-Union via AIO Aux Preprocessor */
export interface ZimageControlTypeOption {
  id: string;
  /** Value for AIO_Preprocessor node `preprocessor` input (comfyui_controlnet_aux) */
  preprocessor: string;
  /** Uses ComfyUI built-in Canny node — no comfyui_controlnet_aux / HF download */
  nativeCanny?: boolean;
  /** First run may download annotator weights via HuggingFace (ComfyUI process env) */
  requiresHfModels?: boolean;
  labelKey: string;
  hintKey: string;
  modelHintKey?: string;
}

export const ZIMAGE_CONTROL_TYPES: ZimageControlTypeOption[] = [
  {
    id: "canny",
    preprocessor: "CannyEdgePreprocessor",
    nativeCanny: true,
    labelKey: "studio.zimageControlTypeCanny",
    hintKey: "studio.zimageControlHintCanny",
  },
  {
    id: "depth",
    /** AIO default for Depth; needs Depth-Anything-V2-Large ckpt under controlnet_aux/ckpts */
    preprocessor: "DepthAnythingV2Preprocessor",
    requiresHfModels: true,
    labelKey: "studio.zimageControlTypeDepth",
    hintKey: "studio.zimageControlHintDepth",
    modelHintKey: "studio.zimageControlModelHintDepth",
  },
  {
    id: "pose",
    preprocessor: "OpenposePreprocessor",
    requiresHfModels: true,
    labelKey: "studio.zimageControlTypePose",
    hintKey: "studio.zimageControlHintPose",
    modelHintKey: "studio.zimageControlModelHintPose",
  },
  {
    id: "hed",
    preprocessor: "HEDPreprocessor",
    requiresHfModels: true,
    labelKey: "studio.zimageControlTypeHed",
    hintKey: "studio.zimageControlHintHed",
    modelHintKey: "studio.zimageControlModelHintHed",
  },
  {
    id: "mlsd",
    /** AIO combo key is "M-LSDPreprocessor" (hyphen), not "MLSDPreprocessor" */
    preprocessor: "M-LSDPreprocessor",
    requiresHfModels: true,
    labelKey: "studio.zimageControlTypeMlsd",
    hintKey: "studio.zimageControlHintMlsd",
    modelHintKey: "studio.zimageControlModelHintMlsd",
  },
];

export const DEFAULT_ZIMAGE_CONTROL_TYPE = ZIMAGE_CONTROL_TYPES[0]?.id ?? "canny";

/** Official ComfyUI Z-Image Turbo text-to-image workflow */
export const ZIMAGE_WORKFLOW_T2I = "z-image-t2i.json";
/** Official ComfyUI Z-Image Turbo controlnet (Canny) workflow */
export const ZIMAGE_WORKFLOW_CONTROL = "z-image-control.json";

export const DEFAULT_ZIMAGE_WORKFLOW = ZIMAGE_WORKFLOW_T2I;
export const DEFAULT_ZIMAGE_CLOUD_MODEL = "Tongyi-MAI/Z-Image-Turbo";

export const FALLBACK_ZIMAGE_CLOUD_MODELS = [
  "Tongyi-MAI/Z-Image-Turbo",
  "Tongyi-MAI/Z-Image",
];

const LEGACY_ZIMAGE_WORKFLOWS = new Set([
  "Z-Image.json",
  "custom/image_z_image_turbo.json",
]);

export interface BuiltinWorkflowOption {
  name: string;
  title: string;
}

export const BUILTIN_ZIMAGE_WORKFLOWS: BuiltinWorkflowOption[] = [
  { name: ZIMAGE_WORKFLOW_T2I, title: "Z-Image 文生图" },
  { name: ZIMAGE_WORKFLOW_CONTROL, title: "Z-Image 控制生图" },
];

export interface WorkflowListItem {
  name: string;
  title?: string;
}

export function isOfficialZimageWorkflow(name: string): boolean {
  return name === ZIMAGE_WORKFLOW_T2I || name === ZIMAGE_WORKFLOW_CONTROL;
}

export function isZimageControlWorkflow(name: string): boolean {
  return name === ZIMAGE_WORKFLOW_CONTROL;
}

export function resolveZimageControlType(remembered = ""): string {
  const ids = new Set(ZIMAGE_CONTROL_TYPES.map((item) => item.id));
  if (remembered && ids.has(remembered)) return remembered;
  try {
    const stored = localStorage.getItem(ZIMAGE_CONTROL_TYPE_STORAGE_KEY);
    if (stored && ids.has(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_ZIMAGE_CONTROL_TYPE;
}

export function getZimageControlTypeOption(id: string): ZimageControlTypeOption {
  return (
    ZIMAGE_CONTROL_TYPES.find((item) => item.id === id) ??
    ZIMAGE_CONTROL_TYPES[0] ?? {
      id: DEFAULT_ZIMAGE_CONTROL_TYPE,
      preprocessor: "CannyEdgePreprocessor",
      labelKey: "studio.zimageControlTypeCanny",
      hintKey: "studio.zimageControlHintCanny",
    }
  );
}

export function isZimageControlResolutionMode(
  value: string,
): value is ZimageControlResolutionMode {
  return (ZIMAGE_CONTROL_RESOLUTION_MODES as string[]).includes(value);
}

export function resolveZimageControlResolution(
  remembered = "",
): ZimageControlResolutionMode {
  if (remembered && isZimageControlResolutionMode(remembered)) return remembered;
  try {
    const stored = localStorage.getItem(ZIMAGE_CONTROL_RESOLUTION_STORAGE_KEY);
    if (stored && isZimageControlResolutionMode(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_ZIMAGE_CONTROL_RESOLUTION;
}

/**
 * Resolve latent width/height for control mode.
 * `null` = keep GetImageSize → EmptySD3LatentImage links (follow reference).
 */
export function resolveZimageControlLatentSize(
  mode: ZimageControlResolutionMode,
  width: number,
  height: number,
): { width: number; height: number } | null {
  if (mode === "follow") return null;
  if (mode === "custom") {
    return {
      width: Math.max(64, Math.round(width) || 1024),
      height: Math.max(64, Math.round(height) || 1024),
    };
  }
  const size = Number(mode);
  if (!Number.isFinite(size) || size <= 0) return null;
  return { width: size, height: size };
}

export function isZImageCloudModel(modelId: string): boolean {
  const lc = String(modelId || "").toLowerCase();
  return lc.includes("z-image") || lc.includes("z_image");
}

export function normalizeStoredZimageWorkflow(stored: string): string {
  if (LEGACY_ZIMAGE_WORKFLOWS.has(stored)) return DEFAULT_ZIMAGE_WORKFLOW;
  return stored;
}

export function resolveZimageCloudModels(config?: AiConfig): string[] {
  const msProvider = config?.api_providers?.find((item) => item.id === "modelscope");
  const merged = [
    ...(msProvider?.image_models ?? []),
    ...(config?.image_models ?? []),
  ];
  const filtered = [...new Set(merged.filter(isZImageCloudModel))];
  if (filtered.length) return filtered;
  return [...FALLBACK_ZIMAGE_CLOUD_MODELS];
}

export function resolveZimageCloudModel(config: AiConfig | undefined, remembered = ""): string {
  const models = resolveZimageCloudModels(config);
  if (remembered && models.includes(remembered)) return remembered;
  try {
    const stored = localStorage.getItem(ZIMAGE_CLOUD_MODEL_STORAGE_KEY);
    if (stored && models.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  if (models.includes(DEFAULT_ZIMAGE_CLOUD_MODEL)) return DEFAULT_ZIMAGE_CLOUD_MODEL;
  return models[0] ?? DEFAULT_ZIMAGE_CLOUD_MODEL;
}

export function resolveZimageWorkflow(
  customWorkflows: WorkflowListItem[],
  remembered = "",
): string {
  const names = new Set([
    ...BUILTIN_ZIMAGE_WORKFLOWS.map((item) => item.name),
    ...customWorkflows.map((item) => item.name),
  ]);
  const normalized = normalizeStoredZimageWorkflow(remembered);
  if (normalized && names.has(normalized)) return normalized;
  try {
    const stored = localStorage.getItem(ZIMAGE_WORKFLOW_STORAGE_KEY);
    if (stored) {
      const migrated = normalizeStoredZimageWorkflow(stored);
      if (names.has(migrated)) return migrated;
    }
  } catch {
    /* ignore */
  }
  if (names.has(DEFAULT_ZIMAGE_WORKFLOW)) return DEFAULT_ZIMAGE_WORKFLOW;
  return customWorkflows[0]?.name ?? DEFAULT_ZIMAGE_WORKFLOW;
}

export function mergeZimageWorkflowOptions(customWorkflows: WorkflowListItem[]) {
  const officialNames = new Set(BUILTIN_ZIMAGE_WORKFLOWS.map((item) => item.name));
  const extras = customWorkflows.filter((item) => !officialNames.has(item.name));
  return [
    ...BUILTIN_ZIMAGE_WORKFLOWS.map((item) => ({
      name: item.name,
      title: item.title,
    })),
    ...extras.map((item) => ({
      name: item.name,
      title: item.title || item.name.replace(/^custom\//, "").replace(/\.json$/, ""),
    })),
  ];
}

function randomSeed() {
  return Math.floor(Math.random() * 4294967295);
}

export function buildParamsFromWorkflowConfig(
  fields: WorkflowField[],
  prompt: string,
  width: number,
  height: number,
): Record<string, Record<string, unknown>> {
  const preview = buildPreviewValues(fields);
  const params: Record<string, Record<string, unknown>> = {};

  for (const field of fields) {
    let value: unknown = preview[field.id];
    const inputLc = String(field.input || "").toLowerCase();

    if (fieldKind(field) === "prompt") {
      value = prompt;
    } else if (inputLc === "width") {
      value = width;
    } else if (inputLc === "height") {
      value = height;
    } else if (inputLc === "seed" || inputLc === "noise_seed") {
      value = randomSeed();
    }

    if (value === undefined || value === "") continue;
    params[field.node] ??= {};
    params[field.node][field.input] = value;
  }

  return params;
}

function buildT2iParams(
  prompt: string,
  width: number,
  height: number,
): Record<string, Record<string, unknown>> {
  return {
    "57:27": { text: prompt },
    "57:13": { width, height },
    "57:3": { seed: randomSeed() },
  };
}

function buildControlParams(
  prompt: string,
  controlImage: string,
  controlType = DEFAULT_ZIMAGE_CONTROL_TYPE,
  resolutionMode: ZimageControlResolutionMode = DEFAULT_ZIMAGE_CONTROL_RESOLUTION,
  width = 1024,
  height = 1024,
): Record<string, Record<string, unknown>> {
  const control = getZimageControlTypeOption(controlType);
  const params: Record<string, Record<string, unknown>> = {
    "70:45": { text: prompt },
    "70:44": { seed: randomSeed() },
    "58": { image: controlImage },
  };

  if (control.nativeCanny) {
    params["57"] = { low_threshold: 0.1, high_threshold: 0.32 };
  } else {
    params["57"] = { preprocessor: control.preprocessor, resolution: 512 };
  }

  // Fixed size: overwrite EmptySD3LatentImage links from GetImageSize (#70:69)
  const latent = resolveZimageControlLatentSize(resolutionMode, width, height);
  if (latent) {
    params["70:41"] = { width: latent.width, height: latent.height };
  }

  return params;
}

export function buildZimageLocalPayload(
  workflowName: string,
  prompt: string,
  width: number,
  height: number,
  configFields: WorkflowField[] = [],
  controlImage = "",
  controlType = DEFAULT_ZIMAGE_CONTROL_TYPE,
  controlResolution: ZimageControlResolutionMode = DEFAULT_ZIMAGE_CONTROL_RESOLUTION,
): { workflow_json: string; params?: Record<string, Record<string, unknown>> } {
  if (workflowName === ZIMAGE_WORKFLOW_T2I) {
    return {
      workflow_json: workflowName,
      params: buildT2iParams(prompt, width, height),
    };
  }

  if (workflowName === ZIMAGE_WORKFLOW_CONTROL) {
    if (!controlImage.trim()) {
      throw new Error("ZIMAGE_CONTROL_IMAGE_REQUIRED");
    }
    return {
      workflow_json: workflowName,
      params: buildControlParams(
        prompt,
        controlImage,
        controlType,
        controlResolution,
        width,
        height,
      ),
    };
  }

  if (configFields.length) {
    return {
      workflow_json: workflowName,
      params: buildParamsFromWorkflowConfig(configFields, prompt, width, height),
    };
  }

  return { workflow_json: workflowName };
}

/** Detect HuggingFace / mirror download failures bubbled up from ComfyUI */
export function isHuggingfaceDownloadError(message: string): boolean {
  const lc = message.toLowerCase();
  return (
    lc.includes("hf-mirror") ||
    lc.includes("huggingface.co") ||
    (lc.includes("couldn't connect") && lc.includes("load the files")) ||
    (lc.includes("could not connect") && lc.includes("cached files")) ||
    (lc.includes("offline mode") && lc.includes("transformers"))
  );
}
