/**
 * File state utilities module.
 *
 * Provides functions to calculate file hashes, capture workspace file state,
 * and detect changes between states respecting ignore rules.
 */
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import fg from 'fast-glob';
import * as path from 'path';
import ignore from 'ignore';
import * as core from '@actions/core';
import { toErrorMessage } from '../utils/error.js';

/**
 * Calculate the SHA-256 hash of the specified file.
 *
 * @param filePath - Absolute path to the file.
 * @returns The SHA-256 hash of the file content.
 */
async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    // Log error but rethrow to be handled by caller, as hash calculation is critical
    core.error(`Failed to calculate hash for ${filePath}: ${toErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Check if a file or directory exists at the given path.
 * @param filePath - Absolute or relative path to check.
 * @returns Promise resolving to true if the path exists, false otherwise.
 */
function pathExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}
/**
 * List files in the workspace respecting .gitignore and default ignore rules.
 *
 * @param workspace - The root directory of the workspace.
 * @returns Array of relative file paths to process.
 */
async function listWorkspaceFiles(workspace: string): Promise<string[]> {
  const gitignorePath = path.join(workspace, '.gitignore');
  const ig = ignore();

  // Default ignore for Git metadata
  ig.add('.git/**');

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

  const allFiles = await fg(['**/*'], {
    cwd: workspace,
    onlyFiles: true,
    dot: true,
    ignore: ['.git/**', 'node_modules/**'],
  });

  return ig.filter(allFiles);
}

/**
 * Capture the state of files in the workspace, respecting .gitignore rules.
 *
 * @param workspace - The root directory of the workspace.
 * @returns Map of relative file paths to their SHA-256 hashes.
 */
export async function captureFileState(
  workspace: string,
): Promise<Map<string, string>> {
  core.info('Capturing current file state (respecting .gitignore)...');
  const fileState = new Map<string, string>();
  const filesToProcess = await listWorkspaceFiles(workspace);

  for (const relativeFilePath of filesToProcess) {
    const absoluteFilePath = path.join(workspace, relativeFilePath);
    try {
      const stats = await fs.stat(absoluteFilePath);
      if (stats.isFile()) {
        const hash = await calculateFileHash(absoluteFilePath);
        fileState.set(relativeFilePath, hash);
      }
    } catch (error) {
      core.warning(`Could not process file ${relativeFilePath}: ${toErrorMessage(error)}`);
    }
  }
  core.info(`Captured state of ${fileState.size} files.`);
  return fileState;
}

/**
 * Detect file changes by comparing two file state maps.
 *
 * @param workspace - The root directory of the workspace.
 * @param originalState - Initial state of files mapped to hashes.
 * @returns Array of relative file paths that have been added, modified, or deleted.
 */
 export async function detectChanges(
  workspace: string,
  originalState: Map<string, string>,
): Promise<string[]> {
  core.info('Detecting file changes by comparing states...');
  const changedFiles = new Set<string>();
  const seenFiles = new Set<string>();

  const filesToProcess = await listWorkspaceFiles(workspace);
  for (const relativeFilePath of filesToProcess) {
    seenFiles.add(relativeFilePath);
    const absoluteFilePath = path.join(workspace, relativeFilePath);
    try {
      const stats = await fs.stat(absoluteFilePath);
      if (stats.isFile()) {
        const currentHash = await calculateFileHash(absoluteFilePath);
        const originalHash = originalState.get(relativeFilePath);
        if (!originalHash) {
          core.info(`File added: ${relativeFilePath}`);
          changedFiles.add(relativeFilePath);
        } else if (originalHash !== currentHash) {
          core.info(`File changed: ${relativeFilePath}`);
          changedFiles.add(relativeFilePath);
        }
      }
    } catch (error) {
      core.warning(`Could not process file ${relativeFilePath}: ${toErrorMessage(error)}`);
    }
  }

  // Detect deleted files
  for (const file of originalState.keys()) {
    if (!seenFiles.has(file)) {
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
