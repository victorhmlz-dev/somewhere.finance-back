/** The image formats accepted for upload, by the extension they are saved with. */
export const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
} as const;

export type ImageExtension = keyof typeof IMAGE_TYPES;

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * The format of an image, read from its first bytes rather than from the name
 * or the type the browser sent, which the sender chooses. Anything else,
 * SVG included (it can carry scripts), gives null.
 */
export function detectImage(bytes: Buffer): ImageExtension | null {
  if (startsWith(bytes, [0x89, ...ascii('PNG\r\n'), 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (
    startsWith(bytes, ascii('GIF87a')) ||
    startsWith(bytes, ascii('GIF89a'))
  ) {
    return 'gif';
  }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return 'webp';
  }
  return null;
}
