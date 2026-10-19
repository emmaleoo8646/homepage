/**
 * Vitest setup file. Pulls in `@testing-library/jest-dom`'s matchers
 * (`toBeInTheDocument`, `toBeVisible`, `toHaveTextContent`, ...) so
 * component tests can assert on rendered DOM ergonomically.
 *
 * Also cleans up `RenderResult`s between tests so jsdom doesn't leak DOM
 * nodes across cases (RTL's older behavior; vitest env keeps things
 * isolated by default but explicit cleanup is still the safer default
 * once you start mounting Dialogs / portals / focus traps).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
