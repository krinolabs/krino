import { createHash } from "node:crypto";

export const CONTENT_HASH_PREFIX = "sha256:";

/** SHA-256 of the UTF-8 text, as `sha256:<64 hex characters>`. Lets traces group equal content without storing it. */
export function hashContent(content: string): string {
  return `${CONTENT_HASH_PREFIX}${createHash("sha256").update(content, "utf8").digest("hex")}`;
}
