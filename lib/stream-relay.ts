const privateHostnames = new Set(["localhost", "localhost.localdomain"]);

export function assertRelayUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:") throw new Error("Only HTTP streams require relay");
  if (url.username || url.password || privateHostnames.has(url.hostname.toLowerCase())) throw new Error("Unsafe relay target");
  if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url.hostname) || url.hostname === "::1") throw new Error("Private relay target blocked");
  return url;
}
