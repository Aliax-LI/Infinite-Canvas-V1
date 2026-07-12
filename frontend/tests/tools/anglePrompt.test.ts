import { describe, expect, it } from "vitest";
import { buildAngleCommand, mergeAngleIntoPrompt } from "../../src/features/tools/shared/anglePrompt";

describe("anglePrompt", () => {
  it("builds horizontal and vertical rotation text", () => {
    expect(buildAngleCommand(30, -20, 4)).toBe("将相机向右旋转30度，仰视20度");
  });

  it("adds lens hint when distance deviates from default", () => {
    expect(buildAngleCommand(0, 0, 2)).toBe("将相机使用特写镜头");
    expect(buildAngleCommand(0, 0, 6)).toBe("将相机使用广角镜头");
  });

  it("replaces existing angle command in prompt", () => {
    const merged = mergeAngleIntoPrompt("主体描述\n将相机向左旋转10度", "将相机向右旋转20度");
    expect(merged).toBe("主体描述\n将相机向右旋转20度");
  });
});
