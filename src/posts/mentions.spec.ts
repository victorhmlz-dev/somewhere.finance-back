import { extractMentions } from './mentions.js';

describe('extractMentions', () => {
  it('finds every mention, in lowercase and once each', () => {
    expect(
      extractMentions('Thanks to @AriaChen and @marcus_cole. cc @ariachen'),
    ).toEqual(['ariachen', 'marcus_cole']);
  });

  it('stops at punctuation', () => {
    expect(extractMentions('(@yuki), @sofia! @ibrahim.')).toEqual([
      'yuki',
      'sofia',
      'ibrahim',
    ]);
  });

  it('ignores email addresses and an @ inside a word', () => {
    expect(extractMentions('mail me at aria@example.com or a.b@chen')).toEqual(
      [],
    );
  });

  it('ignores what cannot be a handle', () => {
    expect(extractMentions(`@ab @${'a'.repeat(16)} @ @@`)).toEqual([]);
  });

  it('returns nothing for a text without mentions', () => {
    expect(extractMentions('Floor is moving.')).toEqual([]);
  });
});
