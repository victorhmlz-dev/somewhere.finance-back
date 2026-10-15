import { detectImage } from './image-file.js';

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(
    parts.map((part) =>
      typeof part === 'string'
        ? Buffer.from(part, 'latin1')
        : Buffer.from(part),
    ),
  );

describe('detectImage', () => {
  it.each([
    ['png', bytes([0x89], 'PNG\r\n', [0x1a, 0x0a], 'rest')],
    ['jpg', bytes([0xff, 0xd8, 0xff, 0xe0], 'rest')],
    ['gif', bytes('GIF89a', 'rest')],
    ['gif', bytes('GIF87a', 'rest')],
    ['webp', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')],
  ])('reads a %s', (extension, file) => {
    expect(detectImage(file)).toBe(extension);
  });

  it.each([
    ['an SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a RIFF that is not WebP', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
    ['a file cut short', bytes([0x89], 'PN')],
    ['an empty file', Buffer.alloc(0)],
  ])('rejects %s', (_case, file) => {
    expect(detectImage(file)).toBeNull();
  });
});
