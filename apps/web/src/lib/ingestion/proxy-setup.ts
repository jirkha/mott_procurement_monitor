/**
 * Inicializuje proxy agenta pro ingest fetch requesty, pokud je
 * INGEST_PROXY_PILOT_ENABLED=1 a INGEST_PROXY_URL je nastavena.
 *
 * Proxy dispatcher/agent se ukládá na globalThis, odkud ho čte
 * `resolveProxyTransport` v perf.ts.
 */

type GlobalWithProxy = typeof globalThis & {
  __MOTT_INGEST_PROXY_DISPATCHER__?: unknown;
  __MOTT_INGEST_PROXY_AGENT__?: unknown;
};

export async function initIngestProxy(): Promise<{ enabled: boolean; url: string | null }> {
  const proxyEnabled =
    process.env.INGEST_PROXY_PILOT_ENABLED === "1" ||
    process.env.INGEST_PROXY_PILOT_ENABLED === "true";
  const proxyUrl = process.env.INGEST_PROXY_URL ?? null;

  if (!proxyEnabled || !proxyUrl) {
    return { enabled: false, url: null };
  }

  try {
    const { ProxyAgent } = await import(/* webpackIgnore: true */ "undici") as {
      ProxyAgent: new (opts: { uri: string }) => unknown;
    };
    const agent = new ProxyAgent({ uri: proxyUrl });

    const g = globalThis as GlobalWithProxy;
    g.__MOTT_INGEST_PROXY_DISPATCHER__ = agent;
    g.__MOTT_INGEST_PROXY_AGENT__ = agent;

    console.log(`[proxy-setup] Proxy agent inicializován: ${proxyUrl.replace(/\/\/[^@]+@/, "//***@")}`);
    return { enabled: true, url: proxyUrl };
  } catch (error) {
    console.warn(
      `[proxy-setup] Nepodařilo se inicializovat proxy agent: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { enabled: false, url: proxyUrl };
  }
}
