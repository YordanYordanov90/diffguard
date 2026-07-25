import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const encryptedSecretSchema = z.object({
  version: z.literal(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  data: z.string().min(1),
});

export type EncryptedSecret = z.infer<typeof encryptedSecretSchema>;

function encryptionKey(keyBase64: string) {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("GITHUB_OAUTH_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return key;
}

export function encryptSecret(secret: string, keyBase64: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyBase64), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptSecret(value: unknown, keyBase64: string) {
  const encrypted = encryptedSecretSchema.parse(value);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(keyBase64),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
