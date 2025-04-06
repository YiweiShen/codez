import * as fs from 'fs';
import * as crypto from 'crypto';
import { globSync } from 'glob';
import * as path from 'path';
import ignore from 'ignore';
import * as core from '@actions/core';

/**
 * Calculates the SHA-256 hash of a file.
 * @param filePath Absolute path to the file.
 * @returns The SHA-256 hash of the file content.
 */
function calculateFileHash(filePath: string): string {
  try {
    const fileBuffer = fs.readFileSync(filePath);
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
 * Captures the state (path and hash) of files in the workspace, respecting .gitignore.
 * @param workspace The root directory of the workspace.
 * @returns A Map where keys are relative file paths and values are their SHA-256 hashes.
 */
export function captureFileState(workspace: string): Map<string, string> {
  core.info('Capturing current file state (respecting .gitignore)...');
  const fileState = new Map<string, string>();
  const gitignorePath = path.join(workspace, '.gitignore');
  const ig = ignore();

  // Add default ignores - crucial for avoiding git metadata and sensitive files
  ig.add('.git/**');
  // Consider adding other common ignores if necessary, e.g., node_modules, build artifacts
  // ig.add('node_modules/**');

  if (fs.existsSync(gitignorePath)) {
    core.info(`Reading .gitignore rules from ${gitignorePath}`);
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      ig.add(gitignoreContent);
    } catch (error) {
      core.warning(`Failed to read .gitignore at ${gitignorePath}: ${error}. Proceeding with default ignores.`);
    }
  } else {
    core.info('.gitignore not found in workspace root. Using default ignores.');
  }

  // Use glob to find all files, then filter using ignore rules
  // Ensure glob pattern covers hidden files (dotfiles) as well
  const allFiles = globSync('**/*', {
      cwd: workspace,
      nodir: true, // Only files, not directories
      dot: true,   // Include dotfiles
      absolute: false, // Get relative paths
      ignore: ['.git/**'], // Explicitly ignore .git directory in glob for performance
  });

  // Filter the glob results using the ignore instance
  // Note: ignore() expects relative paths from the workspace root
  const filesToProcess = ig.filter(allFiles);

  core.info(`Found ${allFiles.length} total entries (files/dirs), processing ${filesToProcess.length} files after applying ignore rules.`);

  for (const relativeFilePath of filesToProcess) {
    const absoluteFilePath = path.join(workspace, relativeFilePath);
    try {
      // Ensure it's actually a file before hashing
      if (fs.statSync(absoluteFilePath).isFile()) {
          const hash = calculateFileHash(absoluteFilePath);
          fileState.set(relativeFilePath, hash); // Store relative path
      }
    } catch (error) {
      // Log specific file errors but continue processing others
      core.warning(`Could not process file ${relativeFilePath}: ${error}`);
    }
  }
  core.info(`Captured state of ${fileState.size} files.`);
  return fileState;
}

/**
 * Detects file changes by comparing two file states.
 * @param workspace The root directory of the workspace.
 * @param originalState The initial state of files (Map<relativePath, hash>).
 * @returns An array of relative file paths that have been added, modified, or deleted.
 */
export function detectChanges(workspace: string, originalState: Map<string, string>): string[] {
  core.info('Detecting file changes by comparing states...');
  const currentState = captureFileState(workspace); // Recapture the current state
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
    core.info(`Detected changes in ${changedFiles.size} files: ${Array.from(changedFiles).join(', ')}`);
  } else {
    core.info('No file changes detected between states.');
  }

  return Array.from(changedFiles);
}
