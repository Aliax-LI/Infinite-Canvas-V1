# Toolbox React Migration Status

> Updated: 2026-07-12

## Summary

React toolbox pages under `frontend/src/features/tools/` were repaired to match `history/static/` behavior and UI patterns (`StudioWorkbenchLayout`, `HistoryMasonry`, `Lightbox`).

## Per-tool status

### Tools hub (`/tools`)

| Area | History | React (before) | React (after) |
|------|---------|----------------|---------------|
| Layout | `tools.html` + `tools.css` cards | Plain grid, no subtitle | Subtitle, icon cards, local/library tags |
| i18n | `tools` + `studio` keys | Partial | `tools.json` + `studio.json` |

**Verify:** Open `/tools` — subtitle, 6 cards, hover elevation.

---

### 图片增强 (`/enhance`)

| Area | History | React (before) | React (after) |
|------|---------|----------------|---------------|
| Upload | `/api/upload` → `comfy_name` | `/api/ai/upload` → `url` (wrong) | `/api/upload` → `comfy_name` |
| Generate | Dual-pass Depth ControlNet + size-scaled strength + optional `upscale.json` | Wrong `{ mode, image_url, strength }` / later simplified single-pass | Restored dual-pass effect (UNET/CLIP loaders, no Inspire) + export/availability |
| UI | Workbench + result stage + archives | Narrow `ToolFormShell` | `StudioWorkbenchLayout` + `ToolResultStage` |

**Verify:** Upload image → adjust strength → optional 2x/4x upscale → Begin remaster → result + history entry.

**Node mapping (`z-image-enhance.json` / `Z-Image-Enhance.json`):**

- Input image → `15.image`
- Refinement strength → `204.value` (FloatConstant)
- Size-scaled denoise → `GetImageSize(193)` + `MathExpression|pysssss(201)` `(w+h)*c/10000` → `easy convertAnything(202)` → linked into:
  - Pass1 `146.denoise` (Depth ControlNet KSampler)
  - Pass2 `181.denoise` (refine KSampler)
  - `184.strength` (ImageAddNoise) / `189.blend_factor` (ImageBlend multiply)
- Depth → `AIO_Preprocessor(164)` `DepthAnythingV2Preprocessor` → `QwenImageDiffsynthControlnet(166)` + `ModelPatchLoader(165)` Union patch
- Loaders → standard `UNETLoader(33)` / `CLIPLoader(34)` / `VAELoader(27)` (**no Inspire Shared loaders**)
- Export + availability probe cover AIO / ControlNet / formula nodes / SeedVR2 upscale

**Formula example:** 1024×1024 @ strength `0.5` → denoise `0.1024` (not raw `0.5`).

**Remaining custom-node deps (effect-critical):** `AIO_Preprocessor`, `QwenImageDiffsynthControlnet`, `ModelPatchLoader`, `MathExpression|pysssss`, `easy convertAnything`, `FloatConstant`, `ImageAddNoise` (+ core `ImageBlend` / `ImageSharpen` / `GetImageSize`).

---

### Klein 生图 (`/klein`)

Baseline: `history/static/klein.html` (feature + quality). React adds workflow export + Comfy availability probe.

| Area | Legacy (`klein.html`) | React (aligned) |
|------|----------------------|-----------------|
| Refs | Always 3 slots; cloud note「仅主图」; cloud payload sent all non-empty | Local: 3 slots; Cloud: **main slot only** (UI matches note) |
| Size | No UI — local GetImageSize; cloud `computeMsSize(main)` | Same — no resolution presets |
| Model | Hardcoded `FLUX.2-klein-9B` | Selectable Klein/FLUX.2 from API 设置 (default same) |
| LoRA | Cloud only, `Daniel8152/Klein-enhance` | Same |
| Local extras | None | Workflow export + availability detection |

**Cloud API (`POST /api/ms/generate`):** `model`, `image_urls` (main only), `width`/`height` from main (512–2048 ×64), optional `loras`.

**Local nodes:** prompt `168`, seed `158`, main `278`, aux `270`/`292`, switches `313`/`314`; size via workflow `157` GetImageSize.

**Verify:** Local — prompt + main (+ aux) → Comfy; export/availability visible. Cloud — model + main + optional LoRA → MS result.

---

### Z-Image (`/zimage`)

| Area | History | React (before) | React (after) |
|------|---------|----------------|---------------|
| Local API | `/api/generate` `type: zimage` | Broken Inspire `Z-Image.json` default | Official ComfyUI `z-image-t2i.json` + `z-image-control.json` |
| Control mode | ControlNet + Canny ref image | Not supported | Upload ref → node `58` LoadImage |
| Cloud API | ModelScope generate | Hardcoded model | User-selectable Z-Image models from API 设置 |
| UI | Engine switch + dimensions | Broken builtin only | 文生图 / 控制生图 selector + ref upload |

**Node mapping (official templates):**

- **文生图** `z-image-t2i.json`: prompt → `57:27.text`, size → `57:13.width/height`, seed → `57:3.seed`
- **控制生图** `z-image-control.json`: prompt → `70:45.text`, ref image → `58.image`, seed → `70:44.seed`, output size from ref via `70:69` GetImageSize

**Verify:** 文生图 — prompt + W×H → local render. 控制生图 — upload ref + prompt → local render (needs ControlNet model in ComfyUI).

**Control types & HuggingFace (important):**

| Controller | Node / preprocessor | HF on first run? | Default |
|------------|---------------------|------------------|---------|
| Canny 边缘 | Built-in `Canny` (node 57) | **No** | **Yes (default)** |
| Depth | `AIO_Preprocessor` → `DepthAnythingV2Preprocessor` | **Yes** | |
| Pose | `AIO_Preprocessor` → `OpenposePreprocessor` | **Yes** | |
| HED | `AIO_Preprocessor` → `HEDPreprocessor` | **Yes** | |
| MLSD | `AIO_Preprocessor` → `M-LSDPreprocessor` | **Yes** | |

`hf-mirror.com` is **not** set by this app. It comes from the **ComfyUI process** env (`HF_ENDPOINT`). Infinite Canvas cannot change it. If the mirror returns HTTP 308 / `LocalEntryNotFoundError`, Depth/Pose/etc. fail until weights are local or `HF_ENDPOINT` is fixed.

**Workaround now:** Keep **Canny 边缘** (verified offline). Do not expect this app to fix Comfy Desktop HF.

### Manual weight install (relative to ComfyUI root)

Base: `{ComfyUI}/custom_nodes/comfyui_controlnet_aux/ckpts/`

| Control | File (relative under `ckpts/`) | Download |
|---------|--------------------------------|----------|
| Depth (V2) | `depth-anything/Depth-Anything-V2-Large/depth_anything_v2_vitl.pth` | [depth-anything/Depth-Anything-V2-Large](https://huggingface.co/depth-anything/Depth-Anything-V2-Large) |
| Pose | OpenPose body/hand/face under Annotators (see controlnet_aux README) | [lllyasviel/Annotators](https://huggingface.co/lllyasviel/Annotators) |
| HED | `Annotators/ControlNetHED.pth` (layout may vary by aux version) | same |
| MLSD | `Annotators/mlsd_large_512_fp32.pth` | same |

**Example (user Comfy Desktop path from logs):**

```
D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI\custom_nodes\comfyui_controlnet_aux\ckpts\depth-anything\Depth-Anything-V2-Large\depth_anything_v2_vitl.pth
```

1. Create the folders if missing.  
2. Download `depth_anything_v2_vitl.pth` from HuggingFace (or a working mirror).  
3. Place the file at the path above.  
4. Restart ComfyUI if needed, then retry Depth in Infinite Canvas.

**HF_ENDPOINT (ComfyUI only, not this app):**

- Check in the shell that starts ComfyUI: `echo $env:HF_ENDPOINT` (PowerShell).  
- If `https://hf-mirror.com` fails: unset it and restart ComfyUI, or point to an endpoint that works.  
- Or keep Canny and ignore HF entirely.

Asset reference: [comfyui_controlnet_aux README](https://github.com/Fannovel16/comfyui_controlnet_aux#assets-files-of-preprocessors).

---

### 视角生成 (`/angle`)

| Area | History | React (before) | React (after) |
|------|---------|----------------|---------------|
| Controls | H/V rotation + distance → auto prompt | Wrong ranges; sent rotation to API | History-aligned sliders + prompt merge |
| Local API | `2511.json` workflow | Invalid `mode: angle` shorthand | Correct workflow |
| Cloud API | `/api/angle/generate` + poll | Not wired | Wired with timeout continue, EngineSwitch, cloud model select, localStorage |
| Hub tags | local + cloud | local only | local + 云端 API |
| 3D preview | Three.js scene | CSS stub only | CSS stub kept (TODO: Three.js) |

**Verify:** Upload → move camera sliders → prompt updates → local/cloud generate.

---

## Shared additions

- `frontend/src/features/tools/shared/toolClient.ts` — Comfy upload, generate, MS/angle helpers
- `frontend/src/features/tools/shared/anglePrompt.ts` — angle command text (from `angle.html`)
- `frontend/src/features/tools/shared/ToolResultStage.tsx` — result/loading/empty stage
- `frontend/src/features/tools/shared/EngineSwitch.tsx` — local / ModelScope toggle
- `frontend/src/styles/studio.css` — `.studio-tools-hub`, `.studio-tool-*` classes

## Still TODO

- **Angle 3D viewer:** Port Three.js camera widget from `history/static/angle.html` (current: CSS `CameraStub` only)
- **Enhance compare slider:** History lightbox before/after compare not ported
- **Klein compare slider:** Same as enhance
- **History bulk select/delete:** `history-bulk-manager.js` behaviors not in React masonry
- **Z-Image legacy `/generate`:** Replaced by `/api/ms/generate`; no separate backend route needed
- **WebSocket live archive push:** History zimage listens on `/ws/stats`; React uses query invalidation only
- **ToolFormShell:** Deprecated for tool pages; kept for reference, unused by migrated pages

## Tests

- `frontend/tests/tools/tools.test.tsx` — hub + enhance workbench smoke
- `frontend/tests/tools/anglePrompt.test.ts` — angle prompt helper
- `frontend/tests/tools/angleOptions.test.ts` — angle engine/model persistence helpers
- `backend/tests/integration/test_generate_api.py` — API contract (53 passed)
