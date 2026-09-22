import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

type Env = {
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};

type ContactPayload = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  postcode?: unknown;
  message?: unknown;
  company?: unknown;
  turnstileToken?: unknown;
};

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

const clean = (value: unknown, maxLength: number) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });

const getEnv = (): Env => {
  const workerEnv = env as Env;
  const localEnv = import.meta.env as unknown as Env;
  return {
    RESEND_API_KEY: workerEnv.RESEND_API_KEY ?? localEnv.RESEND_API_KEY,
    CONTACT_TO_EMAIL: workerEnv.CONTACT_TO_EMAIL ?? localEnv.CONTACT_TO_EMAIL,
    CONTACT_FROM_EMAIL: workerEnv.CONTACT_FROM_EMAIL ?? localEnv.CONTACT_FROM_EMAIL,
    TURNSTILE_SECRET_KEY: workerEnv.TURNSTILE_SECRET_KEY ?? localEnv.TURNSTILE_SECRET_KEY,
    PUBLIC_TURNSTILE_SITE_KEY:
      workerEnv.PUBLIC_TURNSTILE_SITE_KEY ?? localEnv.PUBLIC_TURNSTILE_SITE_KEY,
  };
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json({ error: "Invalid submission format." }, { status: 415 });
  }

  const ip = clientAddress || request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const rate = attempts.get(ip);
  if (!rate || rate.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (rate.count >= MAX_REQUESTS) {
    return Response.json(
      { error: "Too many enquiries have been sent. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  } else {
    rate.count += 1;
  }
  if (attempts.size > 1000) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key);
    }
  }

  let payload: ContactPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "We could not read your enquiry." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ error: "Invalid enquiry data." }, { status: 400 });
  }

  if (clean(payload.company, 100)) {
    return Response.json({ ok: true });
  }

  const name = clean(payload.name, 100);
  const phone = clean(payload.phone, 40);
  const email = clean(payload.email, 160).toLowerCase();
  const postcode = clean(payload.postcode, 16).toUpperCase();
  const message = clean(payload.message, 3000);
  const turnstileToken = clean(payload.turnstileToken, 2048);

  if (!name || !phone || !email || !postcode) {
    return Response.json({ error: "Please complete all required fields." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!/^[0-9+()\s.-]{7,40}$/.test(phone)) {
    return Response.json({ error: "Please enter a valid phone number." }, { status: 400 });
  }
  if (!/^[A-Z0-9][A-Z0-9\s-]{2,15}$/i.test(postcode)) {
    return Response.json({ error: "Please enter a valid property postcode." }, { status: 400 });
  }

  const bindings = getEnv();
  const emailConfigured = Boolean(
    bindings.RESEND_API_KEY && bindings.CONTACT_FROM_EMAIL && bindings.CONTACT_TO_EMAIL,
  );
  const hasTurnstileSecret = Boolean(bindings.TURNSTILE_SECRET_KEY);
  const hasTurnstileSiteKey = Boolean(bindings.PUBLIC_TURNSTILE_SITE_KEY);
  if (hasTurnstileSecret !== hasTurnstileSiteKey) {
    return Response.json(
      { error: "The security check is not configured correctly. Please call 07498 328113." },
      { status: 503 },
    );
  }
  if (emailConfigured && !hasTurnstileSecret) {
    return Response.json(
      { error: "The security check is not configured yet. Please call 07498 328113." },
      { status: 503 },
    );
  }

  if (bindings.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return Response.json({ error: "Please complete the security check." }, { status: 400 });
    }
    try {
      const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: bindings.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: ip,
        }),
      });
      const result = (await verification.json()) as { success?: boolean };
      if (!result.success) {
        return Response.json({ error: "The security check failed. Please try again." }, { status: 400 });
      }
    } catch {
      return Response.json(
        { error: "The security check is temporarily unavailable. Please try again." },
        { status: 502 },
      );
    }
  }

  if (!emailConfigured) {
    return Response.json(
      { error: "Online enquiries are not configured yet. Please call 07498 328113." },
      { status: 503 },
    );
  }

  let emailResponse: Response;
  try {
    emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bindings.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: bindings.CONTACT_FROM_EMAIL,
        to: [bindings.CONTACT_TO_EMAIL],
        reply_to: email,
        subject: `Website enquiry from ${name}`,
        html: `
          <h1>New Essex Rend website enquiry</h1>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Postcode:</strong> ${escapeHtml(postcode)}</p>
          <p><strong>Project details:</strong></p>
          <p>${escapeHtml(message || "No project details provided.").replace(/\n/g, "<br>")}</p>
        `,
        text: [
          "New Essex Rend website enquiry",
          `Name: ${name}`,
          `Phone: ${phone}`,
          `Email: ${email}`,
          `Postcode: ${postcode}`,
          `Project details: ${message || "No project details provided."}`,
        ].join("\n"),
      }),
    });
  } catch {
    return Response.json(
      { error: "We could not reach the enquiry service. Please call 07498 328113." },
      { status: 502 },
    );
  }

  if (!emailResponse.ok) {
    console.error("Resend delivery failed", emailResponse.status);
    return Response.json(
      { error: "We could not send your enquiry. Please call 07498 328113." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
};

export const ALL: APIRoute = () =>
  Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });