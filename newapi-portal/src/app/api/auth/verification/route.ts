import { z } from "zod";

import {
  jsonError,
  jsonOk,
  readJson,
  zodErrorResponse,
} from "@/lib/auth";
import {
  NewApiNativeAuthError,
  sendNewApiVerificationEmail,
} from "@/lib/newapi/native-auth";

export const runtime = "nodejs";

const verificationSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const input = await readJson(request, verificationSchema);

    await sendNewApiVerificationEmail({ email: input.email });

    return jsonOk({
      status: "SENT",
      message: "Verification email sent.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    if (error instanceof NewApiNativeAuthError) {
      return jsonError(
        {
          code: error.code,
          message: error.message || "Failed to send verification email.",
        },
        error.status >= 400 && error.status < 500 ? error.status : 502,
      );
    }

    console.error("verification email send failed", error);
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: "Failed to send verification email.",
      },
      500,
    );
  }
}
