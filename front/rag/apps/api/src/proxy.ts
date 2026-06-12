import { ProxyAgent, setGlobalDispatcher } from "undici";

export function configureNetworkProxy() {
  const proxyUrl =
    process.env.DEVSCOPE_PROXY_URL ??
    process.env.GIT_HTTPS_PROXY ??
    process.env.GIT_HTTP_PROXY ??
    process.env.HTTPS_PROXY ??
    process.env.HTTP_PROXY ??
    process.env.https_proxy ??
    process.env.http_proxy;
  if (!proxyUrl) {
    console.info("[proxy] No proxy configured for RAG API.");
    return;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  process.env.DEVSCOPE_PROXY_URL = proxyUrl;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
  process.env.http_proxy = proxyUrl;
  process.env.https_proxy = proxyUrl;
  process.env.GIT_HTTP_PROXY = proxyUrl;
  process.env.GIT_HTTPS_PROXY = proxyUrl;
  console.info(`[proxy] RAG API using proxy ${redactProxyUrl(proxyUrl)}`);
}

function redactProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    if (url.username) {
      url.username = "***";
    }
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return proxyUrl;
  }
}
