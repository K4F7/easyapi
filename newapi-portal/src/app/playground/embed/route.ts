import {
  isDevMockEnabled,
  mockImagePlaygroundEmbedResponse,
} from "@/lib/dev-mock";
import { proxyImagePlaygroundRequest } from "@/lib/playground/image-playground-proxy";

export const runtime = "nodejs";

async function handle(request: Request) {
  if (isDevMockEnabled()) {
    return mockImagePlaygroundEmbedResponse(request);
  }

  return proxyImagePlaygroundRequest(request, undefined);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function HEAD(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function PUT(request: Request) {
  return handle(request);
}

export async function PATCH(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

export async function OPTIONS(request: Request) {
  return handle(request);
}
