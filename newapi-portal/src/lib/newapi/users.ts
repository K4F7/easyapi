import "server-only";

import { newApiUserRequest } from "./client";
import type { NewApiAuth, NewApiUserSelf } from "./types";

export function getSelf(auth: NewApiAuth): Promise<NewApiUserSelf> {
  return newApiUserRequest<NewApiUserSelf>(auth, "/api/user/self");
}
