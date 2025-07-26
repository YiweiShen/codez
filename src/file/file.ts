/**
 * @file File state utilities module.
 *
 * Provides functions to calculate file hashes, capture workspace file state,
 * and detect changes between states respecting ignore rules.
 */

import * as crypto from 'crypto';
import { createReadStream, promises as fs } from 'fs';

import * as os from 'os';
import * as path from 'path';

import * as core from '@actions/core';
import fg from 'fast-glob';
import ignore from 'ignore';

import { toErrorMessage } from '../utils/error';

import { DEFAULT_IGNORE_PATTERNS } from './constants';

/**
 * Calculate the SHA-256 hash of the specified file using a streaming approach.
 * @param filePath Absolute path to the file.
 * @returns SHA-256 hash of the file content as a hex string.
 */
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', (error) => {
      core.error(`Failed to read file for hashing ${filePath}: ${toErrorMessage(error)}`);
      reject(error);
    });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}


/**
 * Check if a file or directory exists at the given path.
 * @param filePath Path to check (absolute or relative).
 * @returns Promise resolving to true if the path exists, false otherwise.
 */
function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

/**
 * Capture the state of files in the workspace, respecting .gitignore rules.
 * @param workspace Root directory of the workspace.
 * @returns Map of relative file paths to their SHA-256 hashes.
 */
export async function captureFileState(workspace: string): Promise<Map<string, string>> {
  core.info('Capturing current file state (respecting .gitignore)...');
  const gitignorePath = path.join(workspace, '.gitignore');
  const ig = ignore();

  ig.add(DEFAULT_IGNORE_PATTERNS);
  if (await pathExists(gitignorePath)) {
    core.info(`Reading .gitignore rules from ${gitignorePath}`);
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      ig.add(content);
    } catch (error) {
      core.warning(
        `Failed to read .gitignore at ${gitignorePath}: ${toErrorMessage(error)}. Proceeding with default ignores.`,
      );
    }
  } else {
    core.info('.gitignore not found in workspace root. Using default ignores.');
  }

  const allPaths = await fg(['**/*'], { cwd: workspace, onlyFiles: true, dot: true });
  const files = ig.filter(allPaths);
  core.info(`Found ${allPaths.length} total entries, processing ${files.length} files after ignores.`);

  const fileState = new Map<string, string>();
  const concurrency = Math.min(os.cpus().length, files.length);
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (relativeFilePath) => {
        const absoluteFilePath = path.join(workspace, relativeFilePath);
        try {
          const hash = await calculateFileHash(absoluteFilePath);
          fileState.set(relativeFilePath, hash);
        } catch (error) {
          core.warning(`Could not process file ${relativeFilePath}: ${toErrorMessage(error)}`);
        }
      }),
    );
  }

  core.info(`Captured state of ${fileState.size} files.`);
  return fileState;
}

/**
 * Detect file changes by comparing two file state maps.
 * @param workspace Root directory of the workspace.
 * @param originalState Initial map of relative file paths to their SHA-256 hashes.
 * @returns Array of relative file paths that have been added, modified, or deleted.
 */

export async function detectChanges(
  workspace: string,
  originalState: Map<string, string>,
): Promise<string[]> {
  core.info('Detecting file changes by comparing states...');
  const currentState = await captureFileState(workspace); // Recapture the current state
  const changedFiles = new Set<string>();

  // Check for changed or added files by iterating through the current state
  for (const [file, currentHash] of currentState.entries()) {
    const originalHash = originalState.get(file);
    if (!originalHash) {
      // File exists now but didn't before -> Added
      core.info(`File added: ${file}`);
      changedFiles.add(file);
    } else if (originalHash !== currentHash) {
      // File exists in both states but hash differs -> Modified
      core.info(`File changed: ${file}`);
      changedFiles.add(file);
    }
    // If hashes match, the file is unchanged, do nothing.
  }

  // Check for deleted files by iterating through the original state
  for (const file of originalState.keys()) {
    if (!currentState.has(file)) {
      // File existed before but doesn't now -> Deleted
      core.info(`File deleted: ${file}`);
      changedFiles.add(file);
    }
  }

  if (changedFiles.size > 0) {
    core.info(
      `Detected changes in ${changedFiles.size} files: ${Array.from(
        changedFiles,
      ).join(', ')}`,
    );
  } else {
    core.info('No file changes detected between states.');
  }

  return Array.from(changedFiles);
}
