import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

export type WebsiteProfile = {
  siteName: string | null;
  description: string | null;
};

const DIRECTORY_ROOT = "https://de1.api.radio-browser.info/json/stations/byuuid";
const MAX_HTML_BYTES = 196_608;
const WEBSITE_TIMEOUT_MS = 5_000;

type PinnedHttpsTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function cleanText(value: string | null, maxLength: number) {
  if (!value) return null;
  const text = decodeEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text && text.length <= maxLength ? text : null;
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

export function extractWebsiteProfile(html: string): WebsiteProfile {
  const metadata = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, "property") ?? attribute(tag, "name"))?.toLowerCase();
    const content = attribute(tag, "content");
    if (key && content && !metadata.has(key)) metadata.set(key, content);
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  return {
    siteName: cleanText(metadata.get("og:site_name") ?? title, 160),
    description: cleanText(metadata.get("og:description") ?? metadata.get("description") ?? null, 600),
  };
}

function ipv4Parts(address: string) {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function mappedIpv4Address(address: string): string | null {
  const dotted = address.toLowerCase().match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) return dotted;

  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[\da-f]{1,4}$/.test(group))) return null;
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  if (!numbers.slice(0, 5).every((group) => group === 0) || numbers[5] !== 0xffff) return null;
  return `${numbers[6]! >> 8}.${numbers[6]! & 0xff}.${numbers[7]! >> 8}.${numbers[7]! & 0xff}`;
}

function ipv6Groups(address: string): number[] | null {
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[\da-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = ipv4Parts(address)!;
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if ((a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false;
    return true;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const mapped = mappedIpv4Address(normalized);
    if (mapped) return isPublicAddress(mapped);
    const groups = ipv6Groups(normalized);
    if (!groups) return false;
    const [first, second, third] = groups;
    // Only globally routable unicast space is eligible. This excludes loopback,
    // ULA, link/site-local, multicast, NAT64, and other special-use prefixes.
    if ((first! & 0xe000) !== 0x2000) return false;
    if (first === 0x2002) return false; // 6to4 embeds an IPv4 target.
    if (first === 0x2001 && (second === 0 || (second === 2 && third === 0) || (second! >= 0x10 && second! <= 0x2f) || second === 0xdb8)) return false;
    if (first === 0x3fff && second! <= 0x0fff) return false; // Documentation prefix.
    return true;
  }
  return false;
}

function supportedHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Unsupported station website URL");
  return url;
}

async function validatedPublicHttpsUrl(value: string): Promise<PinnedHttpsTarget> {
  const url = supportedHttpsUrl(value);
  const literalAddress = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(literalAddress);
  if (url.hostname === "localhost" || literalFamily) {
    if (!isPublicAddress(literalAddress)) throw new Error("Private station website address");
    return { url, address: literalAddress, family: literalFamily as 4 | 6 };
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Private station website address");
  const pinned = addresses[0]!;
  return { url, address: pinned.address, family: pinned.family as 4 | 6 };
}

function responseHeader(response: IncomingMessage, name: string): string | null {
  const value = response.headers[name];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function readLimitedHtml(response: IncomingMessage): Promise<string> {
  const type = responseHeader(response, "content-type")?.toLowerCase() ?? "";
  if (!type.includes("text/html")) throw new Error("Station website is not HTML");
  const declaredLength = Number(responseHeader(response, "content-length") ?? 0);
  if (declaredLength > MAX_HTML_BYTES) throw new Error("Station website page is too large");

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const value of response) {
    const chunk = typeof value === "string" ? Buffer.from(value) : value as Uint8Array;
    total += chunk.byteLength;
    if (total > MAX_HTML_BYTES) {
      response.destroy();
      throw new Error("Station website page is too large");
    }
    chunks.push(chunk);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function requestPinnedHttps(target: PinnedHttpsTarget): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const httpsRequest = request(target.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "StationHarbor/0.1 (+https://github.com/christopherklint97/stationharbor)",
      },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
      servername: isIP(target.url.hostname.replace(/^\[|\]$/g, "")) ? undefined : target.url.hostname,
      signal: AbortSignal.timeout(WEBSITE_TIMEOUT_MS),
    }, resolve);
    httpsRequest.on("error", reject);
    httpsRequest.end();
  });
}

async function fetchWebsiteHtml(initialUrl: string): Promise<string> {
  let target = await validatedPublicHttpsUrl(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await requestPinnedHttps(target);
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const location = responseHeader(response, "location");
      response.destroy();
      if (!location || redirects === 3) throw new Error("Station website redirected too many times");
      target = await validatedPublicHttpsUrl(new URL(location, target.url).toString());
      continue;
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new Error(`Station website unavailable (${status})`);
    }
    return readLimitedHtml(response);
  }
  throw new Error("Station website unavailable");
}

export async function fetchStationWebsiteProfile(stationId: string): Promise<WebsiteProfile & { homepage: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stationId)) throw new Error("Invalid station ID");
  const directoryResponse = await fetch(`${DIRECTORY_ROOT}/${encodeURIComponent(stationId)}`, {
    headers: { "User-Agent": "StationHarbor/0.1 (+https://github.com/christopherklint97/stationharbor)" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5_000),
  });
  if (!directoryResponse.ok) throw new Error("Station directory unavailable");
  const records: unknown = await directoryResponse.json();
  const homepage = Array.isArray(records) && typeof records[0]?.homepage === "string" ? records[0].homepage : "";
  const normalizedHomepage = supportedHttpsUrl(homepage).toString();
  const profile = extractWebsiteProfile(await fetchWebsiteHtml(normalizedHomepage));
  return { ...profile, homepage: normalizedHomepage };
}
