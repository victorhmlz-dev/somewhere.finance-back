// An `@` that does not continue a word or an email address, followed by a
// handle (see `UpdateProfileDto`).
const MENTION_PATTERN =
  /(?<![\p{L}\p{N}_@.])@([A-Za-z0-9_]{3,15})(?![A-Za-z0-9_])/gu;

/**
 * The handles mentioned in a text, in lowercase and each one once. They may
 * not belong to anyone.
 */
export function extractMentions(text: string): string[] {
  const handles = new Set<string>();
  for (const [, handle] of text.matchAll(MENTION_PATTERN)) {
    handles.add(handle.toLowerCase());
  }
  return [...handles];
}
