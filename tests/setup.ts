import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

afterEach(() => cleanup());
