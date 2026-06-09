export function isPortalPlaceholderEmail(email: string): boolean {
  return email.endsWith("@newapi.local");
}

export function getUserDisplayName(user: {
  username?: string | null;
  email: string;
}): string {
  const username = user.username?.trim();

  if (username) {
    return username;
  }

  if (isPortalPlaceholderEmail(user.email)) {
    const localPart = user.email.split("@")[0] ?? "";

    if (localPart.startsWith("newapi-user-")) {
      return "用户";
    }

    return localPart;
  }

  const at = user.email.indexOf("@");
  return at === -1 ? user.email : user.email.slice(0, at);
}

export function getUserContactEmail(user: {
  username?: string | null;
  email: string;
}): string | null {
  if (isPortalPlaceholderEmail(user.email)) {
    return null;
  }

  return user.email;
}
