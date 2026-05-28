import "server-only";

import { Prisma } from "@prisma/client";

import {
  encryptSecret,
  generateInviteCode,
  hashPassword,
} from "@/lib/auth";
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
      data: tokenUpdateData(encryptedToken, now),
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
          data: tokenUpdateData(encryptedToken, now),
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
      passwordHash: await hashUnusablePassword(),
      inviteCode: await generateUniqueInviteCode(),
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

function tokenUpdateData(encryptedToken: string, now: Date) {
  return {
    newApiAccessTokenCiphertext: encryptedToken,
    newApiAccessTokenKeyId: "auth-secret-v1",
    newApiAccessTokenUpdatedAt: now,
    lastLoginAt: now,
  };
}

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const existing = await db.user.findUnique({
      where: { inviteCode },
      select: { id: true },
    });

    if (!existing) {
      return inviteCode;
    }
  }

  return generateInviteCode();
}

async function hashUnusablePassword(): Promise<string> {
  return hashPassword(crypto.randomUUID());
}
