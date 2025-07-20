import {
  genContentsString,
  genFullContentsString,
} from '../../../src/utils/contents';

describe('genContentsString', () => {
  it('should return empty string when body is empty or whitespace', () => {
    expect(
      genContentsString({ body: '   ', login: 'github-actions[bot]' }),
    ).toBe('');
    expect(genContentsString({ body: '', login: 'github-actions[bot]' })).toBe(
      '',
    );
  });

it('should return empty string when login is not github-actions[bot]', () => {
    const body = 'Line1\nLine2';
    expect(genContentsString({ body, login: 'some-user' })).toBe('');
  });

it('should prefix each line of the body when login is github-actions[bot]', () => {
    const body = 'Line1\nLine2';
    const result = genContentsString({ body, login: 'github-actions[bot]' });
    const expected = '> Line1\n> Line2\n\n';
    expect(result).toBe(expected);
  });
it('should prefix a single-line body with blockquote and two newlines when login is github-actions[bot]', () => {
    const body = 'SingleLine';
    const result = genContentsString({ body, login: 'github-actions[bot]' });
    const expected = '> SingleLine\n\n';
    expect(result).toBe(expected);
  });
});

describe('genFullContentsString', () => {
  it('should return empty string when body is empty or whitespace', () => {
    expect(genFullContentsString({ body: '   ', login: 'any-user' })).toBe('');
    expect(genFullContentsString({ body: '', login: 'any-user' })).toBe('');
  });

  it('should prefix each line of the body regardless of login', () => {
    const body = 'Line1\nLine2';
    const result = genFullContentsString({ body, login: 'some-user' });
    const expected = '> Line1\n> Line2\n\n';
    expect(result).toBe(expected);
  });
  it('should prefix a single-line body with blockquote and two newlines regardless of login', () => {
    const body = 'SingleLine';
    const result = genFullContentsString({ body, login: 'any-user' });
    const expected = '> SingleLine\n\n';
    expect(result).toBe(expected);
  });
});
