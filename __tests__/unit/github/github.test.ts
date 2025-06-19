import { getBranchType, slugify, getEventType, extractText } from '../../../src/github/github';

describe('getBranchType', () => {
  it('returns feat for add, create, implement, introduce verbs', () => {
    expect(getBranchType('Add new feature')).toBe('feat');
    expect(getBranchType('create something')).toBe('feat');
    expect(getBranchType('implement test')).toBe('feat');
    expect(getBranchType('Introduce module')).toBe('feat');
  });
  it('returns fix for fix, correct, resolve, patch, repair verbs', () => {
    expect(getBranchType('fix bug')).toBe('fix');
    expect(getBranchType('Correct issue')).toBe('fix');
    expect(getBranchType('resolve problem')).toBe('fix');
    expect(getBranchType('patch code')).toBe('fix');
    expect(getBranchType('repair module')).toBe('fix');
  });
  it('returns docs for docs or documentation references', () => {
    expect(getBranchType('docs update')).toBe('docs');
    expect(getBranchType('documentation improved')).toBe('docs');
    expect(getBranchType('doc fix')).toBe('docs');
  });
  it('returns styles for style, format, lint verbs', () => {
    expect(getBranchType('style formatting')).toBe('styles');
    expect(getBranchType('format code')).toBe('styles');
    expect(getBranchType('lint files')).toBe('styles');
  });
  it('returns chore for unrecognized verbs', () => {
    expect(getBranchType('random message')).toBe('chore');
    expect(getBranchType('update readme')).toBe('chore');
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('Foo_bar@Baz')).toBe('foo-bar-baz');
  });
  it('trims leading and trailing hyphens', () => {
    expect(slugify('---Example---')).toBe('example');
    expect(slugify('  spaced  out  ')).toBe('spaced-out');
  });
  it('returns empty string when no alphanumeric chars', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('---')).toBe('');
  });
});

describe('getEventType', () => {
  it('identifies issuesOpened event', () => {
    const payload: any = { action: 'opened', issue: { number: 1, title: '', body: '', pull_request: null } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'issuesOpened', github: payload });
  });
  it('identifies issuesAssigned event', () => {
    const payload: any = { action: 'assigned', issue: { number: 2, title: '', body: '', pull_request: null }, assignee: { login: 'user' } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'issuesAssigned', github: payload });
  });
  it('identifies issueCommentCreated event', () => {
    const payload: any = { action: 'created', issue: { number: 3, title: '', body: '', pull_request: null }, comment: { id: 10, body: 'hi' } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'issueCommentCreated', github: payload });
  });
  it('identifies pullRequestCommentCreated event', () => {
    const payload: any = { action: 'created', issue: { number: 4, title: '', body: '', pull_request: {} }, comment: { id: 20, body: 'pr comment' } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'pullRequestCommentCreated', github: payload });
  });
  it('identifies pullRequestReviewCommentCreated event', () => {
    const payload: any = { action: 'created', pull_request: { number: 5 }, comment: { id: 30, body: 'review', path: 'file.js' } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'pullRequestReviewCommentCreated', github: payload });
  });
  it('identifies pullRequestOpened event', () => {
    const payload: any = { action: 'opened', pull_request: { number: 6 } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'pullRequestOpened', github: payload });
  });
  it('identifies pullRequestSynchronize event', () => {
    const payload: any = { action: 'synchronize', pull_request: { number: 7 } };
    const ev = getEventType(payload);
    expect(ev).toEqual({ type: 'pullRequestSynchronize', github: payload });
  });
  it('returns null for unknown event', () => {
    const payload: any = { action: 'deleted' };
    expect(getEventType(payload)).toBeNull();
  });
});

describe('extractText', () => {
  it('returns issue body by default', () => {
    const event: any = { action: 'opened', issue: { title: 'Title', body: ' Body ', pull_request: null } };
    expect(extractText(event)).toBe('Body');
  });
  it('prepends title when body starts with /codex', () => {
    const event: any = { action: 'opened', issue: { title: 'Issue', body: '/codex do this', pull_request: null } };
    expect(extractText(event)).toBe('/codex do this\n\nIssue');
  });
  it('prepends body when title starts with /codex', () => {
    const event: any = { action: 'opened', issue: { title: '/codex generate', body: 'desc', pull_request: null } };
    expect(extractText(event)).toBe('/codex generate\n\ndesc');
  });
  it('handles pull request events similarly', () => {
    const event1: any = { action: 'synchronize', pull_request: { title: 'PR Title', body: ' PR Body ', pull_request: { url: '' } } };
    expect(extractText(event1)).toBe('PR Body');
    const event2: any = { action: 'opened', pull_request: { title: '/codex PR', body: 'body', pull_request: { url: '' } } };
    expect(extractText(event2)).toBe('/codex PR\n\nbody');
    const event3: any = { action: 'opened', pull_request: { title: 'Title', body: '/codex body', pull_request: { url: '' } } };
    expect(extractText(event3)).toBe('/codex body\n\nTitle');
  });
  it('returns comment body for comment events', () => {
    const evt: any = { action: 'created', comment: { body: 'Nice work' } };
    expect(extractText(evt)).toBe('Nice work');
  });
  it('returns null for unsupported events', () => {
    const evt: any = { action: 'closed', issue: { title: '', body: '' } };
    expect(extractText(evt)).toBeNull();
  });
});