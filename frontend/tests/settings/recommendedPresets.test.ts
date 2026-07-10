import { describe, expect, it } from "vitest";
import { RECOMMENDED_PRESETS } from "../../src/features/settings/api/recommendedPresets";
import {
  LINGJING_REGISTER_URL,
  MODELSCOPE_TOKEN_URLS,
  RUNNINGHUB_KEY_URLS,
  VIP_GPT_REGISTER_URL,
} from "../../src/features/settings/api/providerKeyLinks";

describe("recommendedPresets register URLs", () => {
  it("defines register_url for every preset", () => {
    for (const preset of RECOMMENDED_PRESETS) {
      expect(preset.register_url, preset.id).toMatch(/^https:\/\//);
    }
  });

  it("includes legacy parity platforms and URLs", () => {
    const byId = Object.fromEntries(RECOMMENDED_PRESETS.map((p) => [p.id, p]));

    expect(byId.exellome?.register_url).toBe("https://new.exellome.online/register?aff=r2dZ");
    expect(byId.fhl?.register_url).toBe("https://www.fhl.mom/register?aff=86L574B4T2N9");
    expect(byId["vip-gpt"]?.register_url).toBe(VIP_GPT_REGISTER_URL);
    expect(byId.apimart?.register_url_cn).toBe("https://apib.ai/register?aff=1uyAbb");
    expect(byId.lingjing?.register_url).toBe(LINGJING_REGISTER_URL);
    expect(byId.lingjing?.base_url).toBe("https://apistudio.vip");
    expect(byId["agnes-ai"]?.register_url).toBe(
      "https://platform.agnes-ai.com/settings/apiKeys",
    );
  });
});

describe("providerKeyLinks constants", () => {
  it("matches legacy ModelScope and RunningHub token pages", () => {
    expect(MODELSCOPE_TOKEN_URLS.cn).toBe("https://www.modelscope.cn/my/access/token");
    expect(MODELSCOPE_TOKEN_URLS.global).toBe("https://www.modelscope.ai/my/access/token");
    expect(RUNNINGHUB_KEY_URLS.coin.cn).toContain("runninghub.cn/enterprise-api/consumerApi");
    expect(RUNNINGHUB_KEY_URLS.wallet.global).toContain("runninghub.ai/enterprise-api/sharedApi");
  });
});
