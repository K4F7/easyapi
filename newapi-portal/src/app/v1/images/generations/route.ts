import {
  handleImageGeneration,
  handleImageGenerationOptions,
} from "@/lib/playground/image-generation-route";

export const runtime = "nodejs";

export const POST = handleImageGeneration;
export const OPTIONS = handleImageGenerationOptions;
