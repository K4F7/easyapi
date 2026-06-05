import {
  handleImageGeneration,
  handleImageGenerationOptions,
} from "@/lib/playground/image-generation-route";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return handleImageGenerationOptions(request);
}

export function POST(request: Request) {
  return handleImageGeneration(request);
}
