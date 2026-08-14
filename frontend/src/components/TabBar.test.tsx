import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabBar } from "./TabBar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/deposit",
}));

describe("TabBar", () => {
  it("renders all five primary tabs", () => {
    render(<TabBar />);
    expect(screen.getByRole("link", { name: "Market" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Deposit" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Positions" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Health" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Borrow" })).toBeDefined();
  });

  it("marks the current route as active", () => {
    render(<TabBar />);
    expect(screen.getByRole("link", { name: "Deposit" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});