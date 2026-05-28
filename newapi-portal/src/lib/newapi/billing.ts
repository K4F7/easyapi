import "server-only";

import { newApiUserRequest } from "./client";
import type { NewApiAuth, NewApiRedeemTopupResult } from "./types";

export async function redeemTopup(
  auth: NewApiAuth,
  key: string,
): Promise<NewApiRedeemTopupResult> {
  const data = await newApiUserRequest<unknown>(auth, "/api/user/topup", {
    method: "POST",
    json: { key },
  });

  return { success: true, data };
}

export const topupWithRedemptionCode = redeemTopup;
