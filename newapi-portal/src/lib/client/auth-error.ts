"use client";

// 认证相关接口（注册 / 登录 / 发送验证码）的错误文案净化。
//
// 背景：后端部分分支会把内部术语（NewAPI / Turnstile）或英文技术串直接放进
// `error.message`。这些文案不应直接展示给终端用户。本工具：
//   1. 优先按 `error.code` 映射到面向用户的中文文案；
//   2. 无法识别时，若原始 message 含内部术语 / 看起来是英文技术串，则走通用中文兜底；
//   3. 其余情况（已是中文、可读文案）保留原 message。

const GENERIC_FALLBACK = "服务暂时不可用，请稍后再试。";

// 已知 error code → 中文文案映射。覆盖 register / login / verification 路由
// 中出现的全部 code。
const CODE_MESSAGES: Record<string, string> = {
  // 通用
  INTERNAL_ERROR: GENERIC_FALLBACK,
  REQUEST_FAILED: "请求失败，请稍后重试。",
  // 注册
  EMAIL_ALREADY_REGISTERED: "该邮箱已注册，请直接登录或更换邮箱。",
  INVALID_INVITE_CODE: "邀请码无效，请检查后重试。",
  REGISTER_CONFLICT: "该邮箱或邀请码已被占用，请更换后重试。",
  NEWAPI_REGISTER_DISABLED: "注册功能暂时关闭，请稍后再试。",
  NEWAPI_VERIFICATION_REQUIRED:
    "注册需要先完成邮箱验证，请点击「发送验证码」并填写收到的验证码。",
  // 登录
  INVALID_CREDENTIALS: "邮箱/用户名或密码不正确。",
  NEWAPI_INVALID_CREDENTIALS: "邮箱/用户名或密码不正确。",
  NEWAPI_2FA_REQUIRED: "该账户已开启两步验证，暂无法在此登录，请联系管理员。",
  NEWAPI_UPSTREAM_DISABLED: "登录服务暂时不可用，请稍后再试。",
};

// 内部术语：一旦在原始 message 中出现，绝不直接展示给用户。
const INTERNAL_TERMS = /newapi|turnstile|upstream|2fa|aff[_\s-]?code/i;

// 粗判一段文案是否为英文技术串（基本不含中文，且以 ASCII 字母为主）。
function looksLikeEnglishTechnical(message: string): boolean {
  if (/[一-鿿]/.test(message)) return false;
  return /[a-z]/i.test(message);
}

/**
 * 将后端返回的错误净化为可安全展示的中文文案。
 *
 * @param code     后端 `error.code`（若有）
 * @param message  后端 `error.message`（若有）
 * @param fallback 该场景下的兜底文案（如「注册失败，请稍后再试。」）
 */
export function sanitizeAuthError(
  code: string | undefined,
  message: string | undefined,
  fallback: string = GENERIC_FALLBACK,
): string {
  // 1. 优先按已知 code 映射。
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const trimmed = message?.trim();

  // 2. 含内部术语或疑似英文技术串 → 走场景兜底，避免术语泄漏。
  if (!trimmed || INTERNAL_TERMS.test(trimmed) || looksLikeEnglishTechnical(trimmed)) {
    return fallback;
  }

  // 3. 已是可读中文文案，保留原样。
  return trimmed;
}
