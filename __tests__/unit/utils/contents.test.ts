import { genContentsString } from '../../../src/utils/contents';

describe('genContentsString', () => {
	it('should return empty string when body is empty or whitespace', () => {
		expect(
			genContentsString({ body: '   ', login: 'github-actions[bot]' }, ''),
		).toBe('');
		expect(
			genContentsString({ body: '', login: 'github-actions[bot]' }, ''),
		).toBe('');
	});

	it('should return empty string when login is not github-actions[bot]', () => {
		const body = 'Line1\nLine2';
		expect(genContentsString({ body, login: 'some-user' }, '')).toBe('');
	});

	it('should prefix each line of the body when login is github-actions[bot]', () => {
		const body = 'Line1\nLine2';
		const result = genContentsString(
			{ body, login: 'github-actions[bot]' },
			'',
		);
		const expected = '> Line1\n> Line2\n\n';
		expect(result).toBe(expected);
	});
});
