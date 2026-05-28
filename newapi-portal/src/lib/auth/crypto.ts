import "server-only";

const VERSION = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const DERIVE_SALT = "newapi-portal:access-token:v1";

let cachedKey: CryptoKey | null = null;

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(DERIVE_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return cachedKey;
}

const toB64 = (bytes: Uint8Array<ArrayBuffer>): string =>
  Buffer.from(bytes).toString("base64url");
const fromB64 = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(Buffer.from(s, "base64url"));

export async function encryptSecret(
  plaintext: string,
  secret: string,
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
    key,
    encoded,
  );

  const cipherBytes = new Uint8Array(cipherBuf);
  const tag = cipherBytes.slice(cipherBytes.length - TAG_LENGTH);
  const ciphertext = cipherBytes.slice(0, cipherBytes.length - TAG_LENGTH);

  return `${VERSION}:${toB64(iv)}:${toB64(tag)}:${toB64(ciphertext)}`;
}

export async function decryptSecret(
  envelope: string,
  secret: string,
): Promise<string> {
  const parts = envelope.split(":");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted secret format");
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const iv = fromB64(ivB64);
  const tag = fromB64(tagB64);
  const ciphertext = fromB64(ciphertextB64);

  // AES-GCM expects ciphertext || tag
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const key = await deriveKey(secret);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
    key,
    combined,
  );

  return new TextDecoder().decode(plainBuf);
}
