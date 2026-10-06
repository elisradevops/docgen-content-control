import { runContextStore } from '../services/runContext';

const MAX_RUN_ID_LENGTH = 64;

/**
 * The directory, relative to json-to-word's TempFiles, that holds one run's attachments and pictures:
 * "run-<runId>". Giving each run its own directory means two runs can never write (or delete) the same
 * file. The run id arrives in a request header, so it is reduced to characters that are safe in a path
 * segment; the fixed prefix also rules out "." and "..". Without a run id the files stay directly in
 * TempFiles, as before.
 *
 * json-to-word validates the resulting path again when it downloads the file, and treats the "run-"
 * prefix as a directory it owns (docgen-json-to-word AWSS3Service.RunDirectoryPrefix) - keep them in step.
 */
export function runAttachmentDirectory(runId: string | undefined = runContextStore.getStore()?.runId): string {
  const safe = String(runId ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, MAX_RUN_ID_LENGTH);
  return safe ? `run-${safe}` : '';
}

/** "<run directory>/<name>", or just "<name>" when there is no run id. */
export function runAttachmentPath(fileName: string, runId?: string): string {
  const directory = runAttachmentDirectory(runId);
  return directory ? `${directory}/${fileName}` : fileName;
}
