type AsyncTask<T> = () => Promise<T>;
type HostCounter = Map<string, number>;
type HostWaiterQueue = Map<string, Array<() => void>>;

type ProxyTransport = {
  dispatcher?: unknown;
  agent?: unknown;
};

type MutableOutboundStats = {
  totalRequests: number;
  total429: number;
  totalTimeouts: number;
  totalCooldownWaitMs: number;
  byHost: Map<
    string,
    {
      requests: number;
      status429: number;
      timeouts: number;
      cooldownWaitMs: number;
    }
  >;
};

export type OutboundLimiterSnapshot = {
  config: {
    globalConcurrency: number;
    perHostConcurrency: number;
    riskyHostConcurrency: number;
    hostMinIntervalMs: number;
    host429CooldownMs: number;
    host429CooldownJitterMs: number;
    proxyPilotEnabled: boolean;
    proxyPilotTrigger429Rate: number;
    proxyPilotHosts: string[];
  };
  totals: {
    requests: number;
    status429: number;
    timeouts: number;
    cooldownWaitMs: number;
  };
  perHost: Array<{
    host: string;
    requests: number;
    status429: number;
    timeouts: number;
    cooldownWaitMs: number;
    proxyCandidate: boolean;
  }>;
};

const RISKY_HOST_SUFFIXES = ["tenderarena.cz", "egordion.cz", "nen.nipez.cz"] as const;

function resolveNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/** Max soucasnych outbound HTTP pozadavku napric ingestem (0 = bez limitu). */
function resolveOutboundConcurrency(): number {
  const raw = process.env.INGEST_OUTBOUND_CONCURRENCY;
  if (raw === undefined || raw === "") return 4;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 4;
  return n;
}

function parseHost(input: string | URL): string {
  try {
    if (input instanceof URL) return input.hostname.toLowerCase();
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isRiskyHost(host: string): boolean {
  if (!host) return false;
  return RISKY_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return seconds * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function isAbortLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  return /aborted|timeout/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const outboundMax = resolveOutboundConcurrency();
const outboundPerHostMax = resolveNonNegativeInt(
  process.env.INGEST_OUTBOUND_PER_HOST_CONCURRENCY,
  2,
);
const outboundRiskyHostMax = resolveNonNegativeInt(
  process.env.INGEST_OUTBOUND_RISKY_HOST_CONCURRENCY,
  1,
);
const hostMinIntervalMs = resolveNonNegativeInt(process.env.INGEST_HOST_MIN_INTERVAL_MS, 250);
const host429CooldownMs = resolveNonNegativeInt(process.env.INGEST_429_COOLDOWN_MS, 30000);
const host429CooldownJitterMs = resolveNonNegativeInt(
  process.env.INGEST_429_COOLDOWN_JITTER_MS,
  15000,
);

const proxyPilotEnabled =
  process.env.INGEST_PROXY_PILOT_ENABLED === "1" ||
  process.env.INGEST_PROXY_PILOT_ENABLED === "true";
const proxyPilotTrigger429Rate = Number.parseFloat(
  process.env.INGEST_PROXY_PILOT_TRIGGER_429_RATE ?? "0.2",
);
const proxyPilotHosts = (process.env.INGEST_PROXY_PILOT_HOSTS ?? "tenderarena.cz,egordion.cz")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

let outboundActive = 0;
const outboundWaiters: Array<() => void> = [];
const hostActive: HostCounter = new Map();
const hostWaiters: HostWaiterQueue = new Map();
const hostCooldownUntilMs = new Map<string, number>();
const hostLastRequestAtMs = new Map<string, number>();

const outboundStats: MutableOutboundStats = {
  totalRequests: 0,
  total429: 0,
  totalTimeouts: 0,
  totalCooldownWaitMs: 0,
  byHost: new Map(),
};

function getHostStats(host: string) {
  const key = host || "unknown";
  const existing = outboundStats.byHost.get(key);
  if (existing) return existing;
  const next = {
    requests: 0,
    status429: 0,
    timeouts: 0,
    cooldownWaitMs: 0,
  };
  outboundStats.byHost.set(key, next);
  return next;
}

function resolveHostConcurrency(host: string): number {
  if (!host) return Math.max(1, outboundPerHostMax);
  if (isRiskyHost(host)) return Math.max(1, outboundRiskyHostMax);
  return Math.max(1, outboundPerHostMax);
}

const riskyHostMinIntervalMs = resolveNonNegativeInt(
  process.env.INGEST_RISKY_HOST_MIN_INTERVAL_MS,
  2000,
);

function resolveHostMinInterval(host: string): number {
  if (!host) return hostMinIntervalMs;
  if (isRiskyHost(host)) return Math.max(hostMinIntervalMs, riskyHostMinIntervalMs);
  return hostMinIntervalMs;
}

function resolveHostWaitMs(host: string): number {
  if (!host) return 0;
  const now = Date.now();
  const cooldownWait = Math.max(0, (hostCooldownUntilMs.get(host) ?? 0) - now);
  const minInterval = resolveHostMinInterval(host);
  const elapsed = now - (hostLastRequestAtMs.get(host) ?? 0);
  const intervalWait = Math.max(0, minInterval - elapsed);
  return Math.max(cooldownWait, intervalWait);
}

async function acquireOutbound(): Promise<void> {
  if (outboundMax <= 0) return;
  await new Promise<void>((resolve) => {
    const grant = () => {
      outboundActive++;
      resolve();
    };
    if (outboundActive < outboundMax) grant();
    else outboundWaiters.push(grant);
  });
}

function releaseOutbound(): void {
  if (outboundMax <= 0) return;
  outboundActive = Math.max(0, outboundActive - 1);
  const next = outboundWaiters.shift();
  if (next) next();
}

async function acquireHost(host: string): Promise<void> {
  if (!host) return;
  const limit = resolveHostConcurrency(host);
  while (true) {
    const waitMs = resolveHostWaitMs(host);
    if (waitMs > 0) {
      outboundStats.totalCooldownWaitMs += waitMs;
      getHostStats(host).cooldownWaitMs += waitMs;
      await sleep(waitMs);
      continue;
    }

    const active = hostActive.get(host) ?? 0;
    if (active < limit) {
      hostActive.set(host, active + 1);
      return;
    }

    await new Promise<void>((resolve) => {
      const q = hostWaiters.get(host) ?? [];
      q.push(resolve);
      hostWaiters.set(host, q);
    });
  }
}

function releaseHost(host: string): void {
  if (!host) return;
  const active = hostActive.get(host) ?? 0;
  if (active <= 1) hostActive.delete(host);
  else hostActive.set(host, active - 1);
  hostLastRequestAtMs.set(host, Date.now());
  const q = hostWaiters.get(host);
  if (!q || q.length === 0) return;
  const next = q.shift();
  if (q.length === 0) hostWaiters.delete(host);
  else hostWaiters.set(host, q);
  if (next) next();
}

function mark429(host: string, retryAfter: string | null): void {
  const h = host || "unknown";
  const stats = getHostStats(h);
  stats.status429 += 1;
  outboundStats.total429 += 1;

  const parsedRetryAfter = parseRetryAfterMs(retryAfter);
  const jitter = host429CooldownJitterMs
    ? Math.floor(Math.random() * (host429CooldownJitterMs + 1))
    : 0;
  const fallbackMs = host429CooldownMs + jitter;
  const waitMs = parsedRetryAfter != null ? parsedRetryAfter : fallbackMs;
  const until = Date.now() + Math.max(0, waitMs);
  const prevUntil = hostCooldownUntilMs.get(h) ?? 0;
  hostCooldownUntilMs.set(h, Math.max(prevUntil, until));
}

function markTimeout(host: string): void {
  const h = host || "unknown";
  outboundStats.totalTimeouts += 1;
  getHostStats(h).timeouts += 1;
}

function markRequest(host: string): void {
  const h = host || "unknown";
  outboundStats.totalRequests += 1;
  getHostStats(h).requests += 1;
}

function hostMatchesProxyPilot(host: string): boolean {
  if (!host) return false;
  return proxyPilotHosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Proxy hook: pokud je zapnut pilot a je k dispozici runtime dispatcher/agent,
 * prepne transport jen pro vybrane hosty.
 */
function resolveProxyTransport(host: string): ProxyTransport | null {
  if (!proxyPilotEnabled) return null;
  if (!hostMatchesProxyPilot(host)) return null;

  const globalWithProxy = globalThis as typeof globalThis & {
    __MOTT_INGEST_PROXY_DISPATCHER__?: unknown;
    __MOTT_INGEST_PROXY_AGENT__?: unknown;
  };
  const dispatcher = globalWithProxy.__MOTT_INGEST_PROXY_DISPATCHER__;
  const agent = globalWithProxy.__MOTT_INGEST_PROXY_AGENT__;
  if (dispatcher == null && agent == null) return null;
  return { dispatcher, agent };
}

export function shouldUseProxyPilot(host: string): { useProxy: boolean; reason: string } {
  if (!proxyPilotEnabled) {
    return { useProxy: false, reason: "Proxy pilot je vypnuty." };
  }
  if (!hostMatchesProxyPilot(host)) {
    return { useProxy: false, reason: "Host neni v proxy pilot seznamu." };
  }
  const row = outboundStats.byHost.get(host);
  const requests = row?.requests ?? 0;
  const status429 = row?.status429 ?? 0;
  if (requests <= 0) {
    return { useProxy: false, reason: "Zatim bez requestu pro host." };
  }
  const rate = status429 / requests;
  if (rate < proxyPilotTrigger429Rate) {
    return {
      useProxy: false,
      reason: `429 rate ${rate.toFixed(3)} je pod prahem ${proxyPilotTrigger429Rate.toFixed(3)}.`,
    };
  }
  return {
    useProxy: true,
    reason: `429 rate ${rate.toFixed(3)} prekrocil prah ${proxyPilotTrigger429Rate.toFixed(3)}.`,
  };
}

export function getOutboundLimiterSnapshot(): OutboundLimiterSnapshot {
  const perHost = Array.from(outboundStats.byHost.entries())
    .map(([host, row]) => ({
      host,
      requests: row.requests,
      status429: row.status429,
      timeouts: row.timeouts,
      cooldownWaitMs: row.cooldownWaitMs,
      proxyCandidate: shouldUseProxyPilot(host).useProxy,
    }))
    .sort((a, b) => {
      if (b.status429 !== a.status429) return b.status429 - a.status429;
      return b.requests - a.requests;
    });

  return {
    config: {
      globalConcurrency: outboundMax,
      perHostConcurrency: outboundPerHostMax,
      riskyHostConcurrency: outboundRiskyHostMax,
      hostMinIntervalMs,
      host429CooldownMs,
      host429CooldownJitterMs,
      proxyPilotEnabled,
      proxyPilotTrigger429Rate,
      proxyPilotHosts,
    },
    totals: {
      requests: outboundStats.totalRequests,
      status429: outboundStats.total429,
      timeouts: outboundStats.totalTimeouts,
      cooldownWaitMs: outboundStats.totalCooldownWaitMs,
    },
    perHost,
  };
}

export function resetOutboundLimiterStatsForTests(): void {
  outboundStats.totalRequests = 0;
  outboundStats.total429 = 0;
  outboundStats.totalTimeouts = 0;
  outboundStats.totalCooldownWaitMs = 0;
  outboundStats.byHost.clear();
  hostCooldownUntilMs.clear();
  hostLastRequestAtMs.clear();
}

export type FetchWithTimeoutOptions = {
  /** Nezabirat globalni slot (napr. vnoreny fetch uvnitr jiz omezene operace). */
  skipGlobalLimit?: boolean;
};

export function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function resolvePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function timeAsync<T>(
  label: string,
  timingsMs: Record<string, number>,
  task: AsyncTask<T>,
): Promise<T> {
  const startedAt = nowMs();
  try {
    return await task();
  } finally {
    timingsMs[label] = Math.round(nowMs() - startedAt);
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  options?: FetchWithTimeoutOptions,
): Promise<Response> {
  const host = parseHost(input);
  const useLimit = outboundMax > 0 && !options?.skipGlobalLimit;

  if (useLimit) {
    await acquireHost(host);
    await acquireOutbound();
  }

  markRequest(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const transport = resolveProxyTransport(host);
  const requestInit = {
    ...init,
    signal: controller.signal,
  } as RequestInit & ProxyTransport;
  if (transport?.dispatcher != null) requestInit.dispatcher = transport.dispatcher;
  if (transport?.agent != null) requestInit.agent = transport.agent;

  try {
    const response = await fetch(input, requestInit);
    if (response.status === 429) {
      mark429(host, response.headers.get("retry-after"));
    }
    return response;
  } catch (error: unknown) {
    if (isAbortLike(error)) markTimeout(host);
    throw error;
  } finally {
    clearTimeout(timer);
    if (useLimit) {
      releaseOutbound();
      releaseHost(host);
    }
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return results;
}
