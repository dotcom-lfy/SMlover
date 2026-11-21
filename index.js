const SERVICE_NAME = "sms-iyts deployment diagnostics";
const OUTBOUND_TEST_URL = "https://example.com/";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "method_not_allowed" }, 405);
      }

      return json({
        ok: true,
        service: SERVICE_NAME,
        deployment: "worker-with-static-assets",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/outbound-check") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "method_not_allowed" }, 405);
      }

      return outboundCheck();
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return json({ ok: false, error: "assets_binding_missing" }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};

async function outboundCheck() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(OUTBOUND_TEST_URL, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "sms-iyts-deployment-check/1.0",
      },
    });

    return json({
      ok: response.ok,
      target: "example.com",
      status: response.status,
      contentType: response.headers.get("content-type") || "",
    }, response.ok ? 200 : 502);
  } catch (error) {
    return json({
      ok: false,
      target: "example.com",
      error: error.name === "AbortError" ? "timeout" : "fetch_failed",
    }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
