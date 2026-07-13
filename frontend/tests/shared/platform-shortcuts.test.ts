import { describe, expect, it } from "vitest";
import {
  altKeyLabel,
  deleteKeyLabel,
  formatModShortcut,
  hasPrimaryMod,
  isApplePlatform,
  modKeyLabel,
} from "../../src/shared/utils/platformShortcuts";

describe("platformShortcuts", () => {
  it("detects Apple platforms", () => {
    expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
    expect(isApplePlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" })).toBe(
      true,
    );
    expect(isApplePlatform({ userAgentDataPlatform: "macOS" })).toBe(true);
    expect(isApplePlatform({ platform: "Win32", userAgent: "Windows NT 10.0" })).toBe(false);
    expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false);
  });

  it("labels primary mod as ⌘/Cmd on Apple and Ctrl elsewhere", () => {
    expect(modKeyLabel({ platform: "MacIntel" })).toBe("⌘");
    expect(modKeyLabel({ platform: "MacIntel" }, "text")).toBe("Cmd");
    expect(modKeyLabel({ platform: "Win32" })).toBe("Ctrl");
    expect(modKeyLabel({ platform: "Win32" }, "text")).toBe("Ctrl");
  });

  it("labels Alt / Option", () => {
    expect(altKeyLabel({ platform: "MacIntel" })).toBe("⌥");
    expect(altKeyLabel({ platform: "MacIntel" }, "text")).toBe("Option");
    expect(altKeyLabel({ platform: "Win32" })).toBe("Alt");
  });

  it("shows Delete/Backspace on Apple and Del elsewhere", () => {
    expect(deleteKeyLabel({ platform: "MacIntel" })).toBe("Delete / Backspace");
    expect(deleteKeyLabel({ platform: "Win32" })).toBe("Del");
  });

  it("formats mod chords", () => {
    expect(formatModShortcut(["G"], { platform: "MacIntel" })).toBe("⌘ + G");
    expect(formatModShortcut(["G"], { platform: "Win32" })).toBe("Ctrl + G");
    expect(formatModShortcut(["Shift", "Z"], { platform: "MacIntel" })).toBe("⌘ + Shift + Z");
    expect(formatModShortcut(["S"], { platform: "MacIntel" })).toBe("⌘ + S");
    expect(formatModShortcut(["S"], { platform: "Win32" })).toBe("Ctrl + S");
  });

  it("treats meta or ctrl as primary mod", () => {
    expect(hasPrimaryMod({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(hasPrimaryMod({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(hasPrimaryMod({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});
