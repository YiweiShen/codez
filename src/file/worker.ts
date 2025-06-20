import { Worker } from 'worker_threads';
import path from 'path';

/**
 * Offloaded captureFileState using worker thread to avoid blocking main event loop.
 *
 * @param workspace The root directory of the workspace.
 * @returns A Promise resolving to a Map of relative file paths to their SHA-256 hashes.
 */
export function captureFileState(workspace: string): Promise<Map<string, string>> {
  const workerPath = path.join(__dirname, 'fileWorker.js');
  const worker = new Worker(workerPath, { workerData: { task: 'capture', workspace }, type: 'module' });
  return new Promise((resolve, reject) => {
    worker.on('message', (entries: [string, string][]) => {
      resolve(new Map(entries));
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Offloaded detectChanges using worker thread to avoid blocking main event loop.
 *
 * @param workspace The root directory of the workspace.
 * @param originalState Initial state of files mapped to hashes.
 * @returns A Promise resolving to an array of relative file paths that have been added, modified, or deleted.
 */
export function detectChanges(workspace: string, originalState: Map<string, string>): Promise<string[]> {
  const entries = Array.from(originalState.entries());
  const workerPath = path.join(__dirname, 'fileWorker.js');
  const worker = new Worker(workerPath, { workerData: { task: 'detect', workspace, originalState: entries }, type: 'module' });
  return new Promise((resolve, reject) => {
    worker.on('message', (changes: string[]) => {
      resolve(changes);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}