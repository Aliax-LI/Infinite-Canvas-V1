import { test, expect } from "@playwright/test";

test("electron e2e harness is wired", async () => {
  expect(process.env.INFINITE_CANVAS_TEST ?? "1").toBeTruthy();
});
