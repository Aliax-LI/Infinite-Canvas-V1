import { describe, expect, it } from "vitest";
import { formatJimengCredit } from "../../src/shared/api/cliFormat";

describe("formatJimengCredit", () => {
  it("extracts credit-like fields from nested JSON", () => {
    const text = formatJimengCredit({
      data: { total_credit: 128, nested: { balance: 64 } },
      message: "ok",
    });
    expect(text).toContain("total_credit: 128");
    expect(text).toContain("balance: 64");
  });

  it("falls back to pretty JSON when no credit fields exist", () => {
    const text = formatJimengCredit({ status: "pending" });
    expect(text).toContain('"status": "pending"');
  });
});
