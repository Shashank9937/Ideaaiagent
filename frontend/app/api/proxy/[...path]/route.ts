import { type NextRequest } from "next/server";

const DEFAULT_BACKEND_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000/api/v1"
    : "https://ideaaiagent.onrender.com/api/v1";

function getBackendBaseUrl() {
  const configured = process.env.API_BASE_URL ?? DEFAULT_BACKEND_BASE_URL;
  return configured.replace(/\/+$/, "");
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const backendBaseUrl = getBackendBaseUrl();
  const target = `${backendBaseUrl}/${path.join("/")}${request.nextUrl.search}`;
  const targetUrl = new URL(target);

  // Prevent self-referential proxy loops caused by wrong API_BASE_URL.
  if (targetUrl.host === request.nextUrl.host) {
    return Response.json(
      {
        error: "Invalid API_BASE_URL configuration",
        message: "API_BASE_URL points to frontend host. Set it to backend /api/v1 URL.",
      },
      { status: 500 },
    );
  }

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

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    return Response.json(
      {
        error: "Upstream fetch failed",
        target,
        message: toErrorMessage(error),
      },
      { status: 502 },
    );
  }
  const responseHeaders = new Headers(upstream.headers);

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
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
