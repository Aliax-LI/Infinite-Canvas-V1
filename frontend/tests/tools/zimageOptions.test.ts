import { describe, expect, it } from "vitest";
import {
  ZIMAGE_WORKFLOW_CONTROL,
  ZIMAGE_WORKFLOW_T2I,
  buildZimageLocalPayload,
  getZimageControlTypeOption,
  isZImageCloudModel,
  isZimageControlWorkflow,
  mergeZimageWorkflowOptions,
  normalizeStoredZimageWorkflow,
  resolveZimageCloudModels,
  resolveZimageControlLatentSize,
  resolveZimageControlResolution,
  resolveZimageControlType,
  isHuggingfaceDownloadError,
} from "../../src/features/tools/shared/zimageOptions";

describe("zimageOptions", () => {
  it("filters z-image cloud models from provider config", () => {
    const models = resolveZimageCloudModels({
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: ["Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image-2512"],
        },
      ],
    });
    expect(models).toEqual(["Tongyi-MAI/Z-Image-Turbo"]);
    expect(isZImageCloudModel("Tongyi-MAI/Z-Image-Turbo")).toBe(true);
  });

  it("builds params for official t2i workflow", () => {
    const payload = buildZimageLocalPayload(ZIMAGE_WORKFLOW_T2I, "a cat", 1024, 768);
    expect(payload.workflow_json).toBe("z-image-t2i.json");
    expect(payload.params?.["57:27"]).toEqual({ text: "a cat" });
    expect(payload.params?.["57:13"]).toEqual({ width: 1024, height: 768 });
    expect(typeof payload.params?.["57:3"]?.seed).toBe("number");
  });

  it("builds params for official control workflow", () => {
    const payload = buildZimageLocalPayload(
      ZIMAGE_WORKFLOW_CONTROL,
      "portrait",
      1024,
      1024,
      [],
      "ref.png",
    );
    expect(payload.params?.["70:45"]).toEqual({ text: "portrait" });
    expect(payload.params?.["58"]).toEqual({ image: "ref.png" });
    expect(payload.params?.["57"]).toEqual({
      low_threshold: 0.1,
      high_threshold: 0.32,
    });
    expect(typeof payload.params?.["70:44"]?.seed).toBe("number");
    // follow-reference (default): do not override EmptySD3LatentImage
    expect(payload.params?.["70:41"]).toBeUndefined();
    expect(isZimageControlWorkflow(ZIMAGE_WORKFLOW_CONTROL)).toBe(true);
  });

  it("injects fixed latent size for control resolution presets", () => {
    const payload = buildZimageLocalPayload(
      ZIMAGE_WORKFLOW_CONTROL,
      "portrait",
      1024,
      768,
      [],
      "ref.png",
      "canny",
      "768",
    );
    expect(payload.params?.["70:41"]).toEqual({ width: 768, height: 768 });
  });

  it("injects custom width/height for control resolution", () => {
    const payload = buildZimageLocalPayload(
      ZIMAGE_WORKFLOW_CONTROL,
      "portrait",
      1152,
      896,
      [],
      "ref.png",
      "canny",
      "custom",
    );
    expect(payload.params?.["70:41"]).toEqual({ width: 1152, height: 896 });
  });

  it("resolves control latent size modes", () => {
    expect(resolveZimageControlLatentSize("follow", 1024, 1024)).toBeNull();
    expect(resolveZimageControlLatentSize("512", 1024, 768)).toEqual({
      width: 512,
      height: 512,
    });
    expect(resolveZimageControlLatentSize("custom", 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(resolveZimageControlResolution("1024")).toBe("1024");
    expect(resolveZimageControlResolution("nope")).toBe("follow");
  });

  it("maps control type to AIO preprocessor", () => {
    const payload = buildZimageLocalPayload(
      ZIMAGE_WORKFLOW_CONTROL,
      "scene",
      1024,
      1024,
      [],
      "ref.png",
      "depth",
    );
    expect(payload.params?.["57"]).toEqual({
      preprocessor: "DepthAnythingV2Preprocessor",
      resolution: 512,
    });
    expect(getZimageControlTypeOption("pose").preprocessor).toBe("OpenposePreprocessor");
    expect(resolveZimageControlType("hed")).toBe("hed");
    expect(getZimageControlTypeOption("canny").nativeCanny).toBe(true);
    // AIO combo uses hyphenated "M-LSDPreprocessor" (comfyui_controlnet_aux NODE_CLASS_MAPPINGS)
    expect(getZimageControlTypeOption("mlsd").preprocessor).toBe("M-LSDPreprocessor");
    expect(getZimageControlTypeOption("hed").preprocessor).toBe("HEDPreprocessor");
  });

  it("builds mlsd control params with exact AIO combo string", () => {
    const payload = buildZimageLocalPayload(
      ZIMAGE_WORKFLOW_CONTROL,
      "architecture",
      1024,
      1024,
      [],
      "ref.png",
      "mlsd",
    );
    expect(payload.params?.["57"]).toEqual({
      preprocessor: "M-LSDPreprocessor",
      resolution: 512,
    });
  });

  it("detects huggingface download errors", () => {
    expect(
      isHuggingfaceDownloadError(
        "We couldn't connect to 'https://hf-mirror.com' to load the files",
      ),
    ).toBe(true);
  });

  it("requires control image for control workflow", () => {
    expect(() =>
      buildZimageLocalPayload(ZIMAGE_WORKFLOW_CONTROL, "x", 1024, 1024),
    ).toThrow("ZIMAGE_CONTROL_IMAGE_REQUIRED");
  });

  it("migrates legacy stored workflow to official t2i", () => {
    expect(normalizeStoredZimageWorkflow("Z-Image.json")).toBe(ZIMAGE_WORKFLOW_T2I);
    expect(normalizeStoredZimageWorkflow("custom/image_z_image_turbo.json")).toBe(
      ZIMAGE_WORKFLOW_T2I,
    );
  });

  it("lists official workflows first", () => {
    const merged = mergeZimageWorkflowOptions([
      { name: "custom/other.json", title: "Other" },
    ]);
    expect(merged[0]?.name).toBe(ZIMAGE_WORKFLOW_T2I);
    expect(merged[1]?.name).toBe(ZIMAGE_WORKFLOW_CONTROL);
  });
});
