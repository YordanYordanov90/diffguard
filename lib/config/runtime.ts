import { type Env, parseEnv } from "./env";

let cachedEnv: Env | undefined;

/** Full validated env — parsed once on first access, not at import time. */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source !== process.env) {
    return parseEnv(source);
  }
  cachedEnv ??= parseEnv(source);
  return cachedEnv;
}

/**
 * Lazy proxy so importing `@/lib/config` does not throw during module
 * evaluation. Accessing a property still validates the full schema.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    return getEnv()[property as keyof Env];
  },
});
