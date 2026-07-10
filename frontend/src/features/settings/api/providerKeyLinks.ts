export const MODELSCOPE_TOKEN_URLS = {
  cn: "https://www.modelscope.cn/my/access/token",
  global: "https://www.modelscope.ai/my/access/token",
} as const;

export const RUNNINGHUB_KEY_URLS = {
  coin: {
    cn: "https://www.runninghub.cn/enterprise-api/consumerApi?inviteCode=rh-v1331",
    global: "https://www.runninghub.ai/enterprise-api/consumerApi?inviteCode=rh-v1331",
  },
  wallet: {
    cn: "https://www.runninghub.cn/enterprise-api/sharedApi?inviteCode=rh-v1331",
    global: "https://www.runninghub.ai/enterprise-api/sharedApi?inviteCode=rh-v1331",
  },
} as const;

export const VOLCENGINE_KEY_URLS = {
  ark: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
  iam: "https://console.volcengine.com/iam/keymanage/",
} as const;

export const LINGJING_REGISTER_URL = "https://apistudio.vip/register?aff=g1CT";
export const VIP_GPT_REGISTER_URL =
  "https://www.vip-gpt.net/vip-gpt/register?aff=YGMS7BDKNY5Y";

export interface KeyLinkPair {
  cn: string;
  global: string;
}

export interface ProviderKeyLinkGroup {
  title?: string;
  links: KeyLinkPair;
}

export type KeyRegion = "cn" | "global";

export const PROVIDER_REGION_ENDPOINTS = {
  modelscope: {
    cn: "https://api-inference.modelscope.cn/v1",
    global: "https://api-inference.modelscope.ai/v1",
  },
  runninghub: {
    cn: "https://www.runninghub.cn",
    global: "https://www.runninghub.ai",
  },
} as const;

export function normalizeProviderUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function detectKeyRegion(
  baseUrl: string,
  endpoints: { cn: string; global: string },
): KeyRegion {
  const current = normalizeProviderUrl(baseUrl);
  if (current === normalizeProviderUrl(endpoints.global)) return "global";
  if (current === normalizeProviderUrl(endpoints.cn)) return "cn";
  if (/\.ai\b/i.test(baseUrl)) return "global";
  return "cn";
}

export function keyRegionEndpoint(
  region: KeyRegion,
  endpoints: { cn: string; global: string },
) {
  return region === "global" ? endpoints.global : endpoints.cn;
}
