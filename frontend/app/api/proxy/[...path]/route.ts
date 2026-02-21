import { type NextRequest } from "next/server";

const DEFAULT_BACKEND_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000/api/v1"
    : "https://ideaaiagent.onrender.com/api/v1";
const SECONDARY_BACKEND_BASE_URL = "https://market-war-radar-api.onrender.com/api/v1";

function getBackendBaseUrls() {
  const candidates = [
    process.env.API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    DEFAULT_BACKEND_BASE_URL,
    SECONDARY_BACKEND_BASE_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/+$/, ""));

  return Array.from(new Set(candidates));
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");
  const accept = request.headers.get("accept");

  if (contentType) headers.set("content-type", contentType);
  if (authorization) headers.set("authorization", authorization);
  if (accept) headers.set("accept", accept);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const attempts: string[] = [];
  for (const backendBaseUrl of getBackendBaseUrls()) {
    const target = `${backendBaseUrl}/${path.join("/")}${request.nextUrl.search}`;
    const targetUrl = new URL(target);
    if (targetUrl.host === request.nextUrl.host) {
      attempts.push(`${target} -> skipped self host`);
      continue;
    }

    try {
      const upstream = await fetch(target, init);
      if (upstream.ok) {
        const responseHeaders = new Headers(upstream.headers);
        return new Response(await upstream.arrayBuffer(), {
          status: upstream.status,
          headers: responseHeaders,
        });
      }
      const body = await upstream.text();
      attempts.push(`${target} -> ${upstream.status}${body ? `: ${body}` : ""}`);
    } catch (error) {
      attempts.push(`${target} -> ${toErrorMessage(error)}`);
    }
  }

  return Response.json(
    {
      error: "All upstream backends failed",
      attempts,
    },
    { status: 502 },
  );
}

type RouteContext = {
  params: { path: string[] };
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}
