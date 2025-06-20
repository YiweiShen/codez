/**
 * File state utilities module.
 *
 * Provides functions to calculate file hashes, capture workspace file state,
 * and detect changes between states respecting ignore rules.
 */
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { globSync } from 'glob';
import * as path from 'path';
import ignore from 'ignore';
import * as core from '@actions/core';

/**
 * Calculate the SHA-256 hash of the specified file.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {string} The SHA-256 hash of the file content.
 */
async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    // Log error but rethrow to be handled by caller, as hash calculation is critical
    core.error(`Failed to calculate hash for ${filePath}: ${error}`);
    throw error;
  }
}

/**
 * Capture the state of files in the workspace, respecting .gitignore rules.
 *
 * @param {string} workspace - The root directory of the workspace.
 * @returns {Map<string, string>} Map of relative file paths to their SHA-256 hashes.
 */
function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

export async function captureFileState(workspace: string): Promise<Map<string, string>> {
  core.info('Capturing current file state (respecting .gitignore)...');
  const fileState = new Map<string, string>();
  const gitignorePath = path.join(workspace, '.gitignore');
  const ig = ignore();

  // Add default ignores - crucial for avoiding git metadata and sensitive files
  ig.add('.git/**');
  // Consider adding other common ignores if necessary, e.g., node_modules, build artifacts
  // ig.add('node_modules/**');

  if (await pathExists(gitignorePath)) {
    core.info(`Reading .gitignore rules from ${gitignorePath}`);
    try {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      ig.add(gitignoreContent);
    } catch (error) {
      core.warning(
        `Failed to read .gitignore at ${gitignorePath}: ${error}. Proceeding with default ignores.`,
      );
    }
  } else {
    core.info('.gitignore not found in workspace root. Using default ignores.');
  }

  // Use glob to find all files, then filter using ignore rules
  // Ensure glob pattern covers hidden files (dotfiles) as well
  const allFiles = globSync('**/*', {
    cwd: workspace,
    nodir: true, // Only files, not directories
    dot: true, // Include dotfiles
    absolute: false, // Get relative paths
    ignore: ['.git/**'], // Explicitly ignore .git directory in glob for performance
  });

  // Filter the glob results using the ignore instance
  // Note: ignore() expects relative paths from the workspace root
  const filesToProcess = ig.filter(allFiles);

  core.info(
    `Found ${allFiles.length} total entries (files/dirs), processing ${filesToProcess.length} files after applying ignore rules.`,
  );

  for (const relativeFilePath of filesToProcess) {
    const absoluteFilePath = path.join(workspace, relativeFilePath);
    try {
      const stats = await fs.stat(absoluteFilePath);
      if (stats.isFile()) {
        const hash = await calculateFileHash(absoluteFilePath);
        fileState.set(relativeFilePath, hash);
      }
    } catch (error) {
      core.warning(`Could not process file ${relativeFilePath}: ${error}`);
    }
  }
  core.info(`Captured state of ${fileState.size} files.`);
  return fileState;
}

/**
 * Detect file changes by comparing two file state maps.
 *
 * @param {string} workspace - The root directory of the workspace.
 * @param {Map<string, string>} originalState - Initial state of files mapped to hashes.
 * @returns {string[]} Array of relative file paths that have been added, modified, or deleted.
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
