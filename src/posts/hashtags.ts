export const MAX_HASHTAG_LENGTH = 50;

export interface Hashtag {
  /** Lowercase and without the `#`: what a hashtag is matched by. */
  tag: string;
  /** As written, without the `#`. */
  label: string;
}

// A `#` that does not continue a word, followed by letters, numbers or
// underscores up to the maximum length.
const HASHTAG_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_&])#([\\p{L}\\p{N}_]{1,${MAX_HASHTAG_LENGTH}})(?![\\p{L}\\p{N}_])`,
  'gu',
);

/**
 * The hashtags of a text, each one once, in order of appearance. `#NOVA` and
 * `#nova` are the same hashtag; a tag made only of numbers, like `#1`, is not
 * one.
 */
export function extractHashtags(text: string): Hashtag[] {
  const hashtags = new Map<string, Hashtag>();

  for (const [, label] of text.matchAll(HASHTAG_PATTERN)) {
    if (!/\p{L}/u.test(label)) continue;
    const tag = label.toLowerCase();
    if (!hashtags.has(tag)) hashtags.set(tag, { tag, label });
  }

  return [...hashtags.values()];
}
