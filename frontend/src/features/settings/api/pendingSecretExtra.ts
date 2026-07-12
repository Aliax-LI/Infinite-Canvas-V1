/** Draft secret inputs that should be flushed on Save (mirrors history syncEditor). */
export type PendingSecretDrafts = {
  apiKey?: string;
  walletApiKey?: string;
  volcAccessKey?: string;
  volcSecretKey?: string;
};

/** Collect non-empty secret drafts into the PUT extra payload. */
export function collectPendingSecretExtra(drafts: PendingSecretDrafts): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  const apiKey = drafts.apiKey?.trim();
  if (apiKey) extra.api_key = apiKey;
  const wallet = drafts.walletApiKey?.trim();
  if (wallet) extra.wallet_api_key = wallet;
  const volcAk = drafts.volcAccessKey?.trim();
  if (volcAk) extra.volcengine_access_key_id = volcAk;
  const volcSk = drafts.volcSecretKey?.trim();
  if (volcSk) extra.volcengine_secret_access_key = volcSk;
  return extra;
}

/** Clear flags override any pending draft for the same secret. */
export function mergeSecretExtra(
  pending: Record<string, unknown>,
  explicit?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...pending, ...explicit };
  if (merged.clear_key) delete merged.api_key;
  if (merged.clear_wallet_key) delete merged.wallet_api_key;
  if (merged.clear_volcengine_access_key_id) delete merged.volcengine_access_key_id;
  if (merged.clear_volcengine_secret_access_key) delete merged.volcengine_secret_access_key;
  return Object.keys(merged).length ? merged : undefined;
}
