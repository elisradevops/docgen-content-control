/**
 * Names the owner of an HTML fragment in the "Attachment download failed" warning (see DownloadManager),
 * e.g. "work item 1234". Undefined when the id is not known, so the warning simply omits it.
 */
export function workItemLogContext(id: unknown): string | undefined {
  return id === undefined || id === null || String(id).trim() === '' ? undefined : `work item ${id}`;
}
