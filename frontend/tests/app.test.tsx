import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";

describe("App", () => {
  it("renders the desktop shell baseline", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "无限画布" })).toBeInTheDocument();
  });
});
