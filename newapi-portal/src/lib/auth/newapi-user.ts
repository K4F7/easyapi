import "server-only";

import { Prisma } from "@prisma/client";

import { encryptSecret } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAuthSecret } from "@/lib/env";

export type NewApiPortalIdentity = {
  userId: string;
  username: string;
  email?: string;
  accessToken: string;
};

export class NewApiPortalBindingError extends Error {
  readonly code = "NEWAPI_IDENTITY_CONFLICT";
  readonly status = 409;

  constructor(message = "NewAPI identity conflicts with an existing portal account") {
    super(message);
    this.name = "NewApiPortalBindingError";
  }
}

export async function upsertPortalUserFromNewApiIdentity(
  identity: NewApiPortalIdentity,
) {
  const encryptedToken = await encryptSecret(
    identity.accessToken,
    getAuthSecret(),
  );
  const now = new Date();
  const existingLinkedUser = await db.user.findUnique({
    where: { newApiUserId: identity.userId },
  });

  if (existingLinkedUser) {
    return db.user.update({
      where: { id: existingLinkedUser.id },
      data: {
        username: identity.username,
        ...tokenUpdateData(encryptedToken, now),
      },
    });
  }

  return createNewApiBackedPortalUser({
    identity,
    encryptedToken,
    now,
  }).catch(async (error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const linkedUser = await db.user.findUnique({
        where: { newApiUserId: identity.userId },
      });

      if (linkedUser) {
        return db.user.update({
          where: { id: linkedUser.id },
          data: {
            username: identity.username,
            ...tokenUpdateData(encryptedToken, now),
          },
        });
      }
    }

    throw error;
  });
}

async function createNewApiBackedPortalUser(input: {
  identity: NewApiPortalIdentity;
  encryptedToken: string;
  now: Date;
}) {
  const email = await resolvePortalEmail(input.identity);

  return db.user.create({
    data: {
      email,
      username: input.identity.username,
      newApiUserId: input.identity.userId,
      ...tokenUpdateData(input.encryptedToken, input.now),
    },
  });
}

async function resolvePortalEmail(
  identity: NewApiPortalIdentity,
): Promise<string> {
  const candidateEmail = identity.email?.trim().toLowerCase();

  if (candidateEmail?.includes("@")) {
    const existing = await db.user.findUnique({
      where: { email: candidateEmail },
      select: { id: true, newApiUserId: true },
    });

    if (!existing) {
      return candidateEmail;
    }

    if (existing.newApiUserId === identity.userId) {
      return candidateEmail;
    }
  }

  return `newapi-user-${identity.userId}@newapi.local`;
}

export async function updatePortalUserAccessToken(
  portalUserId: string,
  accessToken: string,
) {
  const encryptedToken = await encryptSecret(accessToken, getAuthSecret());
  const now = new Date();

  return db.user.update({
    where: { id: portalUserId },
    data: accessTokenUpdateData(encryptedToken, now),
  });
}

function tokenUpdateData(encryptedToken: string, now: Date) {
  return {
    ...accessTokenUpdateData(encryptedToken, now),
    lastLoginAt: now,
  };
}

function accessTokenUpdateData(encryptedToken: string, now: Date) {
  return {
    newApiAccessTokenCiphertext: encryptedToken,
    newApiAccessTokenKeyId: "auth-secret-v1",
    newApiAccessTokenUpdatedAt: now,
  };
}
