import { parentPort, workerData } from 'worker_threads';
import { captureFileState as captureFileStateSync, detectChanges as detectChangesSync } from './file.js';

if (!parentPort) {
  throw new Error('Worker threads must have a parentPort.');
}

type WorkerData = {
  task: 'capture' | 'detect';
  workspace: string;
  originalState?: [string, string][];
};

const data = workerData as WorkerData;
if (data.task === 'capture') {
  const stateMap = captureFileStateSync(data.workspace);
  parentPort.postMessage(Array.from(stateMap.entries()));
} else if (data.task === 'detect') {
  const originalEntries = data.originalState || [];
  const originalMap = new Map(originalEntries);
  const changes = detectChangesSync(data.workspace, originalMap);
  parentPort.postMessage(changes);
} else {
  throw new Error(`Unknown task ${(data as any).task}`);
}