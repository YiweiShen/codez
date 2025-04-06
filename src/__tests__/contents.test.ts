import { genContentsString } from '../contents.js';

describe('genContentsString', () => {
  test('空のbodyの場合は空文字列を返す', () => {
    const content = { body: '', login: 'user' };
    const userPrompt = 'テストプロンプト';
    
    expect(genContentsString(content, userPrompt)).toBe('');
  });

  test('bodyが/claudeで始まらず、github-actions[bot]でない場合は空文字列を返す', () => {
    const content = { body: 'こんにちは', login: 'user' };
    const userPrompt = 'テストプロンプト';
    
    expect(genContentsString(content, userPrompt)).toBe('');
  });

  test('bodyが/claudeで始まり、github-actions[bot]でない場合は文字列を返す', () => {
    const content = { body: '/claude\nこんにちわ', login: 'user' };
    const userPrompt = 'テストプロンプト';
    
    expect(genContentsString(content, userPrompt)).toBe('こんにちわ\n\n');
  });

  test('bodyが/claudeで始まるが、userPromptと同じ場合は空文字列を返す', () => {
    const content = { body: '/claude\nテストプロンプト', login: 'user' };
    const userPrompt = 'テストプロンプト';
    
    expect(genContentsString(content, userPrompt)).toBe('');
  });

  test('loginがgithub-actions[bot]の場合は、bodyの各行の先頭に"> "を追加して返す', () => {
    const content = { body: 'こんにちは\n世界', login: 'github-actions[bot]' };
    const userPrompt = 'テストプロンプト';
    
    expect(genContentsString(content, userPrompt)).toBe('> こんにちは\n> 世界\n\n');
  });
});
