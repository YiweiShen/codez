import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as core from '@actions/core';
import { captureFileState, detectChanges } from '../../../src/file/file';

describe('captureFileState', () => {
  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'test-workspace-'));
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('respects .gitignore rules (e.g. node_modules)', () => {
    fs.writeFileSync(path.join(workspace, '.gitignore'), 'node_modules/\n');
    const nmDir = path.join(workspace, 'node_modules');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'foo.js'), 'console.log("foo");');
    fs.writeFileSync(path.join(workspace, 'file.txt'), 'hello');
    const state = captureFileState(workspace);
    expect(state.has('file.txt')).toBe(true);
    expect(state.has(path.posix.join('node_modules', 'foo.js'))).toBe(false);
  });

  it('includes hidden/dotfiles when not ignored', () => {
    fs.writeFileSync(path.join(workspace, '.hidden'), 'secret');
    const state = captureFileState(workspace);
    expect(state.has('.hidden')).toBe(true);
  });

  it('returns correct SHA-256 hashes for small test files', () => {
    const content = 'abc';
    fs.writeFileSync(path.join(workspace, 'a.txt'), content);
    const state = captureFileState(workspace);
    const expectedHash = crypto.createHash('sha256').update(Buffer.from(content)).digest('hex');
    expect(state.get('a.txt')).toBe(expectedHash);
  });

  it('skips unreadable files with a warning', () => {
    const filePath = path.join(workspace, 'bad.txt');
    fs.writeFileSync(filePath, 'content');
    fs.chmodSync(filePath, 0o000);
    const warningSpy = jest.spyOn(core, 'warning').mockImplementation(() => {});
    const state = captureFileState(workspace);
    expect(state.has('bad.txt')).toBe(false);
    expect(warningSpy).toHaveBeenCalled();
    warningSpy.mockRestore();
  });
});

describe('detectChanges', () => {
  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'test-workspace-'));
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('new file -> reported in added list', () => {
    const originalState = new Map<string, string>();
    fs.writeFileSync(path.join(workspace, 'new.txt'), 'hoi');
    const changes = detectChanges(workspace, originalState);
    expect(changes).toContain('new.txt');
    expect(changes.length).toBe(1);
  });

  it('modified file -> reported in modified list', () => {
    const filePath = path.join(workspace, 'mod.txt');
    fs.writeFileSync(filePath, 'old');
    const originalState = captureFileState(workspace);
    fs.writeFileSync(filePath, 'new');
    const changes = detectChanges(workspace, originalState);
    expect(changes).toContain('mod.txt');
  });

  it('deleted file -> reported in deleted list', () => {
    const filePath = path.join(workspace, 'del.txt');
    fs.writeFileSync(filePath, 'bye');
    const originalState = captureFileState(workspace);
    fs.unlinkSync(filePath);
    const changes = detectChanges(workspace, originalState);
    expect(changes).toContain('del.txt');
  });

  it('no changes -> empty result', () => {
    const filePath = path.join(workspace, 'same.txt');
    fs.writeFileSync(filePath, 'haha');
    const originalState = captureFileState(workspace);
    const changes = detectChanges(workspace, originalState);
    expect(changes).toEqual([]);
  });
});