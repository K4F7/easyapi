import {
  isDevMockEnabled,
  mockImagePlaygroundEmbedResponse,
} from "@/lib/dev-mock";
import { proxyImagePlaygroundRequest } from "@/lib/playground/image-playground-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: Request, context: RouteContext) {
  if (isDevMockEnabled()) {
    return mockImagePlaygroundEmbedResponse(request);
  }

  const { path } = await context.params;
  return proxyImagePlaygroundRequest(request, path);
}

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  return handle(request, context);
}
