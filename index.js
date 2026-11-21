const SERVICE_NAME = "sms-iyts";
const OUTBOUND_TEST_URL = "https://example.com/";
const MAX_REQUEST_BYTES = 4096;
const MAX_MESSAGE_LENGTH = 140;
const PROVIDER_TIMEOUT_MS = 10000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        if (request.method !== "GET") {
          return json({ ok: false, error: "method_not_allowed" }, 405);
        }

        return json({
          ok: true,
          service: SERVICE_NAME,
          deployment: "customer-ui-with-worker-api",
          sendingConfigured: isSendingConfigured(env),
          timestamp: new Date().toISOString(),
        });
      }

      if (url.pathname === "/api/outbound-check") {
        if (request.method !== "GET") {
          return json({ ok: false, error: "method_not_allowed" }, 405);
        }

        return outboundCheck();
      }

      if (url.pathname === "/api/send") {
        return handleSend(request, env, url);
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ ok: false, error: "not_found" }, 404);
      }

      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return json({ ok: false, error: "assets_binding_missing" }, 500);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({
        event: "unhandled_error",
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ ok: false, error: "internal_error" }, 500);
    }
  },
};

async function handleSend(request, env, url) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return json({ ok: false, error: "origin_not_allowed" }, 403);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "content_type_not_supported" }, 415);
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: "request_too_large" }, 413);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!input || typeof input !== "object" || input.consent !== true) {
    return json({ ok: false, error: "consent_required" }, 400);
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    return json({ ok: false, error: "invalid_phone" }, 400);
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return json({ ok: false, error: "invalid_message" }, 400);
  }

  if (!isSendingConfigured(env)) {
    return json({
      ok: false,
      error: "provider_not_configured",
      message: "SMS provider credentials have not been configured.",
    }, 503);
  }

  const rateLimitKey = await sha256Hex(phone);
  const rateLimit = await env.SMS_RATE_LIMITER.limit({ key: rateLimitKey });
  if (!rateLimit.success) {
    console.log(JSON.stringify({ event: "sms_rate_limited", requestId: request.headers.get("cf-ray") || "" }));
    return json({ ok: false, error: "rate_limited", retryAfter: 60 }, 429, {
      "Retry-After": "60",
    });
  }

  let providerUrl;
  try {
    providerUrl = new URL(env.SMS_PROVIDER_URL);
  } catch {
    return json({ ok: false, error: "provider_configuration_invalid" }, 503);
  }

  if (providerUrl.protocol !== "https:") {
    return json({ ok: false, error: "provider_configuration_invalid" }, 503);
  }

  const requestId = crypto.randomUUID();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(providerUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${env.SMS_API_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify({
        to: phone,
        message,
        senderId: env.SMS_SENDER_ID || "SMS-IYTS",
      }),
    });

    if (!response.ok) {
      console.error(JSON.stringify({
        event: "sms_provider_error",
        requestId,
        providerStatus: response.status,
      }));
      return json({ ok: false, error: "provider_rejected", requestId }, 502);
    }

    console.log(JSON.stringify({ event: "sms_accepted", requestId }));
    return json({ ok: true, status: "accepted", requestId }, 202);
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    console.error(JSON.stringify({
      event: timeout ? "sms_provider_timeout" : "sms_provider_fetch_failed",
      requestId,
    }));
    return json({ ok: false, error: timeout ? "provider_timeout" : "provider_unavailable", requestId }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isSendingConfigured(env) {
  return Boolean(env.SMS_PROVIDER_URL && env.SMS_API_TOKEN);
}

function normalizePhone(value) {
  if (typeof value !== "string") return "";
  const compact = value.replace(/[\s()-]/g, "");
  const normalized = /^1[3-9]\d{9}$/.test(compact) ? `+86${compact}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : "";
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function outboundCheck() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(OUTBOUND_TEST_URL, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Accept": "text/html",
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
      error: error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_failed",
    }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}
