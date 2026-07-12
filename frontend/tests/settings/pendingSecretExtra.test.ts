import { describe, expect, it } from "vitest";
import {
  collectPendingSecretExtra,
  mergeSecretExtra,
} from "../../src/features/settings/api/pendingSecretExtra";

describe("collectPendingSecretExtra / mergeSecretExtra", () => {
  it("collects non-empty api key and volc drafts", () => {
    expect(
      collectPendingSecretExtra({
        apiKey: "  sk-1  ",
        walletApiKey: "",
        volcAccessKey: "AK",
        volcSecretKey: " SK ",
      }),
    ).toEqual({
      api_key: "sk-1",
      volcengine_access_key_id: "AK",
      volcengine_secret_access_key: "SK",
    });
  });

  it("returns empty object when all drafts blank", () => {
    expect(collectPendingSecretExtra({ apiKey: "   ", volcAccessKey: "" })).toEqual({});
  });

  it("lets clear flags override pending drafts", () => {
    const pending = collectPendingSecretExtra({
      apiKey: "sk-keep",
      volcAccessKey: "AK",
      volcSecretKey: "SK",
    });
    expect(
      mergeSecretExtra(pending, {
        clear_key: true,
        clear_volcengine_access_key_id: true,
        clear_volcengine_secret_access_key: true,
      }),
    ).toEqual({
      clear_key: true,
      clear_volcengine_access_key_id: true,
      clear_volcengine_secret_access_key: true,
    });
  });

  it("returns undefined when nothing to send", () => {
    expect(mergeSecretExtra({}, undefined)).toBeUndefined();
  });
});
