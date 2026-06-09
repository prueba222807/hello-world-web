// AES-GCM symmetric encryption for sensitive Siigo credentials.
// Uses SIIGO_ENCRYPTION_KEY env var (any string; we hash it to 256 bits).
// Output format: base64(iv | ciphertext+tag)
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

function getKey(): Buffer {
  const raw = process.env.SIIGO_ENCRYPTION_KEY;
  if (!raw) throw new Error("SIIGO_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
