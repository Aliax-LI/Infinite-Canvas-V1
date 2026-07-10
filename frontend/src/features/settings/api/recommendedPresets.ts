import { LINGJING_REGISTER_URL, VIP_GPT_REGISTER_URL } from "./providerKeyLinks";

export type RecommendCategory = "stable" | "cheap";

export interface RecommendedPreset {
  id: string;
  name: string;
  category: RecommendCategory;
  base_url: string;
  protocol: string;
  register_url: string;
  register_url_cn?: string;
  summary: string;
  tags: string[];
  keyHint?: string;
  image_models: string[];
  chat_models: string[];
  video_models: string[];
}

export const RECOMMEND_GROUPS: { key: RecommendCategory; title: string }[] = [
  { key: "stable", title: "稳定推荐" },
  { key: "cheap", title: "性价比" },
];

export const RECOMMENDED_PRESETS: RecommendedPreset[] = [
  {
    id: "exellome",
    name: "EXELLOME",
    category: "stable",
    base_url: "https://new.exellome.online",
    protocol: "apimart",
    register_url: "https://new.exellome.online/register?aff=r2dZ",
    summary: "稳定输出 GPT-Image2 和 Nano Banana 的 2K/4K，异步协议适合长任务。",
    tags: ["GPT-Image2", "Nano-Banana", "2K/4K"],
    keyHint: "使用 VIP 分组",
    image_models: ["gpt-image2-2k", "gpt-image2-4k", "Nano-Banana-2-2k", "Nano-Banana-2-4k"],
    chat_models: [],
    video_models: [],
  },
  {
    id: "fhl",
    name: "FHL",
    category: "stable",
    base_url: "https://www.fhl.mom",
    protocol: "openai",
    register_url: "https://www.fhl.mom/register?aff=86L574B4T2N9",
    summary: "稳定便宜接入 Codex/Claude/GPT Image 2 出图，OpenAI RS 生图直连。",
    tags: ["Codex", "Claude", "GPT Image 2"],
    image_models: ["gpt-image-2", "gpt-image-2-2k", "gpt-image-2-4k", "nano-banana"],
    chat_models: ["gpt-5.5"],
    video_models: [],
  },
  {
    id: "vip-gpt",
    name: "VIP-GPT",
    category: "stable",
    base_url: "https://www.vip-gpt.net",
    protocol: "openai",
    register_url: VIP_GPT_REGISTER_URL,
    summary: "支持 AI 编程的模型和生图模型，还可以包月使用。",
    tags: ["Codex", "Claude", "GPT Image 2", "Nano-banana"],
    image_models: [],
    chat_models: [],
    video_models: [],
  },
  {
    id: "apimart",
    name: "APIMART",
    category: "stable",
    base_url: "https://api.apimart.ai",
    protocol: "apimart",
    register_url: "https://apimart.ai/zh/register?aff=1uyAbb",
    register_url_cn: "https://apib.ai/register?aff=1uyAbb",
    summary: "模型类型覆盖广，适合多节点混合工作流与长任务。",
    tags: ["生图", "视频", "LLM"],
    image_models: [],
    chat_models: [],
    video_models: [],
  },
  {
    id: "lingjing",
    name: "灵境API",
    category: "cheap",
    base_url: "https://apistudio.vip",
    protocol: "openai",
    register_url: LINGJING_REGISTER_URL,
    summary: "签到送积分，图像/视频/LLM 全覆盖。",
    tags: ["生图", "视频", "LLM", "六折"],
    image_models: ["gpt-image-2", "gemini-3.1-flash-image-preview"],
    chat_models: ["gpt-5.5"],
    video_models: ["veo3.1-fast"],
  },
  {
    id: "agnes-ai",
    name: "Agnes AI",
    category: "cheap",
    base_url: "https://apihub.agnes-ai.com",
    protocol: "openai",
    register_url: "https://platform.agnes-ai.com/settings/apiKeys",
    summary: "免费额度可用，支持 Agnes 图像与视频接口。",
    tags: ["免费额度", "生图", "视频"],
    image_models: ["agnes-image-2.1-flash", "agnes-image-2.0-flash"],
    chat_models: [],
    video_models: ["agnes-video-v2.0"],
  },
];

export function protocolBadge(protocol: string) {
  if (protocol === "apimart") return "APIMart";
  if (protocol === "openai") return "OpenAI";
  if (protocol === "gemini") return "Gemini";
  return protocol.toUpperCase();
}
