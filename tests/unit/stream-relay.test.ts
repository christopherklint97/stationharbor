import { describe, expect, it } from "vitest";
import { assertRelayUrl } from "@/lib/stream-relay";

describe("assertRelayUrl", () => {
  it("allows public HTTP stream URLs", () => {
    expect(assertRelayUrl("http://radio.example.com/live.mp3").toString()).toBe("http://radio.example.com/live.mp3");
  });

  it("rejects non-HTTP and private targets", () => {
    expect(() => assertRelayUrl("https://radio.example.com/live.mp3")).toThrow();
    expect(() => assertRelayUrl("http://127.0.0.1:3000/admin")).toThrow();
    expect(() => assertRelayUrl("http://localhost/admin")).toThrow();
  });
});
