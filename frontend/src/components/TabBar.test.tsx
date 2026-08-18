import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabBar } from "./TabBar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/market",
}));

describe("TabBar", () => {
  it("renders all primary tabs", () => {
    render(<TabBar />);
    expect(screen.getByRole("link", { name: "Market" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Simulate" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Borrow" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeDefined();
  });

  it("marks the current route as active", () => {
    render(<TabBar />);
    expect(screen.getByRole("link", { name: "Market" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});