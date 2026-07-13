import { describe, expect, it } from "vitest";
import {
  defaultTemplateNameFromText,
  filterPromptTemplates,
  normalizeLibraryItems,
  templateApplyText,
  templateName,
  templatePositive,
} from "../../src/features/canvas/core/promptTemplates";

describe("promptTemplates helpers", () => {
  it("reads name/positive with title/content fallback", () => {
    expect(templateName({ name: "俯拍", title: "旧" })).toBe("俯拍");
    expect(templateName({ title: "旧标题" })).toBe("旧标题");
    expect(templatePositive({ positive: "a cat", content: "old" })).toBe("a cat");
    expect(templatePositive({ content: "legacy" })).toBe("legacy");
  });

  it("builds full apply text with negative and params", () => {
    expect(
      templateApplyText(
        {
          positive: "hero portrait",
          negative: "blurry",
          params: { steps: "28", cfg: "7" },
        },
        "full",
      ),
    ).toBe("hero portrait\n\nNegative prompt:\nblurry\n\nParams:\nsteps: 28\ncfg: 7");
    expect(templateApplyText({ positive: "only positive" }, "positive")).toBe("only positive");
  });

  it("normalizes system library items and filters by category/query", () => {
    const items = normalizeLibraryItems(
      [
        {
          id: "system",
          name: "系统提示词库",
          items: [
            {
              id: "builtin_1",
              name: "俯拍视角",
              positive: "aerial view of city",
              category: "view",
              scene: "城市鸟瞰",
              builtin: true,
            },
            {
              id: "builtin_empty",
              name: "空",
              positive: "",
              category: "view",
            },
          ],
        },
        {
          id: "mine",
          name: "我的库",
          items: [
            {
              id: "u1",
              name: "角色特写",
              positive: "close-up face",
              category: "character",
              scene: "人物",
            },
          ],
        },
      ],
      "system",
    );

    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("俯拍视角");
    expect(items[0].builtin).toBe(true);
    expect(items[1].name).toBe("角色特写");
    expect(items[1].builtin).toBe(false);

    expect(filterPromptTemplates(items, "view", "").map((i) => i.id)).toEqual(["builtin_1"]);
    expect(filterPromptTemplates(items, "all", "角色").map((i) => i.id)).toEqual(["u1"]);
  });

  it("derives default names from prompt text", () => {
    expect(defaultTemplateNameFromText("  一只橘猫 在阳光下  ")).toBe("一只橘猫 在阳光下");
    expect(defaultTemplateNameFromText("")).toBe("新模板");
  });
});
