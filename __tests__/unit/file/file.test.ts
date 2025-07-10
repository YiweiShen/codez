import * as crypto from 'crypto';

import * as fs from 'fs';

import * as os from 'os';
import * as path from 'path';

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

  it('respects .gitignore rules (e.g. node_modules)', async () => {
    fs.writeFileSync(path.join(workspace, '.gitignore'), 'node_modules/\n');
    const nmDir = path.join(workspace, 'node_modules');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'foo.js'), 'console.log("foo");');
    fs.writeFileSync(path.join(workspace, 'file.txt'), 'hello');
    const state = await captureFileState(workspace);
    expect(state.has('file.txt')).toBe(true);
    expect(state.has(path.posix.join('node_modules', 'foo.js'))).toBe(false);
  });

  it('includes hidden/dotfiles when not ignored', async () => {
    fs.writeFileSync(path.join(workspace, '.hidden'), 'secret');
    const state = await captureFileState(workspace);
    expect(state.has('.hidden')).toBe(true);
  });

  it('returns correct SHA-256 hashes for small test files', async () => {
    const content = 'abc';
    fs.writeFileSync(path.join(workspace, 'a.txt'), content);
    const state = await captureFileState(workspace);
    const expectedHash = crypto
      .createHash('sha256')
      .update(Buffer.from(content))
      .digest('hex');
    expect(state.get('a.txt')).toBe(expectedHash);
  });

  it('skips unreadable files with a warning', async () => {
    const filePath = path.join(workspace, 'bad.txt');
    fs.writeFileSync(filePath, 'content');
    fs.chmodSync(filePath, 0o000);
    const warningSpy = jest.spyOn(core, 'warning').mockImplementation(() => {});
    const state = await captureFileState(workspace);
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

  it('new file -> reported in added list', async () => {
    const originalState = new Map<string, string>();
    fs.writeFileSync(path.join(workspace, 'new.txt'), 'hoi');
    const changes = await detectChanges(workspace, originalState);
    expect(changes).toContain('new.txt');
    expect(changes.length).toBe(1);
  });

  it('modified file -> reported in modified list', async () => {
    const filePath = path.join(workspace, 'mod.txt');
    fs.writeFileSync(filePath, 'old');
    const originalState = await captureFileState(workspace);
    fs.writeFileSync(filePath, 'new');
    const changes = await detectChanges(workspace, originalState);
    expect(changes).toContain('mod.txt');
  });

  it('deleted file -> reported in deleted list', async () => {
    const filePath = path.join(workspace, 'del.txt');
    fs.writeFileSync(filePath, 'bye');
    const originalState = await captureFileState(workspace);
    fs.unlinkSync(filePath);
    const changes = await detectChanges(workspace, originalState);
    expect(changes).toContain('del.txt');
  });

  it('no changes -> empty result', async () => {
    const filePath = path.join(workspace, 'same.txt');
    fs.writeFileSync(filePath, 'haha');
    const originalState = await captureFileState(workspace);
    const changes = await detectChanges(workspace, originalState);
    expect(changes).toEqual([]);
  });
  it('detects multiple file changes (added, modified, deleted) in a single run', async () => {
    const file1 = path.join(workspace, 'file1.txt');
    const file2 = path.join(workspace, 'file2.txt');
    fs.writeFileSync(file1, 'v1');
    fs.writeFileSync(file2, 'v2');
    const originalState = await captureFileState(workspace);
    // Modify file1, delete file2, add file3
    fs.writeFileSync(file1, 'v1-modified');
    fs.unlinkSync(file2);
    const file3 = path.join(workspace, 'file3.txt');
    fs.writeFileSync(file3, 'v3');
    const changes = await detectChanges(workspace, originalState);
    expect(changes).toContain('file1.txt');
    expect(changes).toContain('file2.txt');
    expect(changes).toContain('file3.txt');
    expect(changes.length).toBe(3);
  });
});
