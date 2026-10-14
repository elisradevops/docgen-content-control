const GUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FALLBACK_FILE_NAME = 'unknown.png';

export interface ResolvedAttachmentSrc {
  /** The URL to request. */
  requestUrl: string;
  /** Name whose extension the download service uses for the stored file. */
  fileName: string;
}

/**
 * Inline images in Azure DevOps / TFS work-item HTML come in several URL forms:
 *
 *   1. .../_apis/wit/attachments/<guid>?fileName=<n>          id in the PATH (documented REST route)
 *   2. .../_apis/wit/attachments?FileNameGUID=<guid>&FileName=<n>   id in the QUERY
 *   3. .../_apis/wit/attachments?FileID=<integer>&FileName=<n>      numeric id in the QUERY
 *   4. .../WorkItemTracking/v1.0/AttachFileHandler.ashx?FileNameGuid=<guid>&FileName=<n>   legacy TFS handler
 *
 * Form 1 is fetched by its path alone (the query is dropped). Forms 2-4 carry the id only in the query, so
 * dropping it leaves the bare attachments route, which only accepts POST (HTTP 405); the legacy GUID / numeric
 * id is not necessarily a REST attachment id either. They are requested exactly as stored.
 *
 * Returns the request for forms 2-4, and null for everything else (form 1, unknown URLs, blob:, data:), which keep
 * the caller's existing handling.
 */
export function resolveAttachmentSrc(src: unknown): ResolvedAttachmentSrc | null {
  if (typeof src !== 'string') return null;
  // A fragment is never sent to the server, and anything appended later must not end up inside it.
  const url = src.trim().replace(/&amp;/gi, '&').split('#')[0];
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;

  const path = url.substring(0, queryStart).replace(/\/+$/, '');
  const isAttachmentsCollection = /\/_apis\/wit\/attachments$/i.test(path);
  const isLegacyHandler = /\/WorkItemTracking\/v1\.0\/AttachFileHandler\.ashx$/i.test(path);
  if (!isAttachmentsCollection && !isLegacyHandler) return null;

  const params = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(url.substring(queryStart + 1))) {
    params.set(key.toLowerCase(), value);
  }
  const guid = params.get('filenameguid');
  const fileId = params.get('fileid');
  const hasId = (guid !== undefined && GUID.test(guid)) || (fileId !== undefined && /^\d+$/.test(fileId));
  if (!hasId) return null;

  const fileName = (params.get('filename') ?? '').trim();
  return { requestUrl: url, fileName: /\.[A-Za-z0-9]+$/.test(fileName) ? fileName : FALLBACK_FILE_NAME };
}
