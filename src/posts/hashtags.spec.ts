import { extractHashtags } from './hashtags.js';

const tags = (text: string) => extractHashtags(text).map(({ tag }) => tag);

describe('extractHashtags', () => {
  it('finds every hashtag, keeping how it was written', () => {
    expect(
      extractHashtags('Thank you all. #NeonBazaar #MultichainSummer'),
    ).toEqual([
      { tag: 'neonbazaar', label: 'NeonBazaar' },
      { tag: 'multichainsummer', label: 'MultichainSummer' },
    ]);
  });

  it('counts a hashtag once, whatever its case', () => {
    expect(extractHashtags('#NOVA is up. #nova #Nova')).toEqual([
      { tag: 'nova', label: 'NOVA' },
    ]);
  });

  it('stops at punctuation and accepts underscores and accents', () => {
    expect(tags('(#VoidProtocol), #hood_legends! #colección.')).toEqual([
      'voidprotocol',
      'hood_legends',
      'colección',
    ]);
  });

  it('ignores a # inside a word, in an HTML entity or before only numbers', () => {
    expect(tags('floor#sweep &#39; #1 #2026 ##')).toEqual([]);
  });

  it('accepts numbers next to letters', () => {
    expect(tags('#web3 #2fast')).toEqual(['web3', '2fast']);
  });

  it('ignores a hashtag longer than the maximum', () => {
    expect(tags(`#${'a'.repeat(51)} #${'b'.repeat(50)}`)).toEqual([
      'b'.repeat(50),
    ]);
  });

  it('returns nothing for a text without hashtags', () => {
    expect(extractHashtags('Size down when the chart looks obvious.')).toEqual(
      [],
    );
  });
});
