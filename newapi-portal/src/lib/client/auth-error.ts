const GENERIC_AUTH_MESSAGE = "认证失败，请检查输入后重试。";

const SAFE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱、用户名或密码不正确。",
  INVALID_VERIFICATION_CODE: "验证码不正确或已过期。",
  VERIFICATION_CODE_REQUIRED: "请输入邮箱验证码。",
  EMAIL_ALREADY_EXISTS: "该邮箱已注册。",
  USERNAME_ALREADY_EXISTS: "该用户名已被占用。",
  PASSWORD_TOO_SHORT: "密码长度至少 8 位。",
};

export function sanitizeAuthError(
  code: unknown,
  message: unknown,
  fallback = GENERIC_AUTH_MESSAGE,
): string {
  if (typeof code === "string" && SAFE_MESSAGES[code]) {
    return SAFE_MESSAGES[code];
  }

  if (typeof message === "string") {
    const normalized = message.trim();
    if (normalized && !/token|secret|stack|sql|database|newapi/i.test(normalized)) {
      return normalized;
    }
  }

  return fallback;
}
