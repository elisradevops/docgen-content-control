import { resolveAttachmentSrc } from '../../utils/adoAttachmentUrl';

const GUID = '6f1c1c1e-1111-2222-3333-444455556666';
const PROJECT = '3a600197-fa66-4389-aebd-620186063db0';

describe('resolveAttachmentSrc', () => {
  describe('forms that carry the id in the query (requested as stored)', () => {
    test('REST collection route with FileNameGUID', () => {
      const src = `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}&FileName=shot.png`;

      expect(resolveAttachmentSrc(src)).toEqual({ requestUrl: src, fileName: 'shot.png' });
    });

    test('REST collection route with a numeric FileID', () => {
      const src = `https://org.visualstudio.com/${PROJECT}/_apis/wit/attachments?FileID=481805&FileName=System.Description.0.png`;

      expect(resolveAttachmentSrc(src)).toEqual({ requestUrl: src, fileName: 'System.Description.0.png' });
    });

    test('legacy AttachFileHandler.ashx on an on-prem collection', () => {
      const src = `https://tfs.example/tfs/DefaultCollection/WorkItemTracking/v1.0/AttachFileHandler.ashx?FileNameGuid=${GUID}&FileName=temp1596101249233.png`;

      expect(resolveAttachmentSrc(src)).toEqual({ requestUrl: src, fileName: 'temp1596101249233.png' });
    });

    test('keys and the path are matched case-insensitively', () => {
      const src = `https://tfs.example/tfs/Col/workitemtracking/V1.0/attachfilehandler.ASHX?filenameguid=${GUID}&FILENAME=a.JPG`;

      expect(resolveAttachmentSrc(src)).toEqual({ requestUrl: src, fileName: 'a.JPG' });
    });

    test('FileName may come before the id', () => {
      const src = `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileName=a.png&FileNameGUID=${GUID}`;

      expect(resolveAttachmentSrc(src)?.fileName).toBe('a.png');
    });

    test('decodes a percent-encoded and a "+" file name', () => {
      const base = `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}`;

      expect(resolveAttachmentSrc(`${base}&FileName=my%20shot%20%281%29.png`)?.fileName).toBe('my shot (1).png');
      expect(resolveAttachmentSrc(`${base}&FileName=my+shot.png`)?.fileName).toBe('my shot.png');
    });

    test('turns an HTML-escaped query separator back into "&"', () => {
      const src = `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}&amp;FileName=a.png`;

      expect(resolveAttachmentSrc(src)).toEqual({
        requestUrl: `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}&FileName=a.png`,
        fileName: 'a.png',
      });
    });

    test('drops a #fragment, so a later "&download=true" cannot end up inside it', () => {
      const src = `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}&FileName=a.png#top`;

      expect(resolveAttachmentSrc(src)?.requestUrl).toBe(
        `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}&FileName=a.png`
      );
    });

    test('tolerates a trailing slash before the query', () => {
      const src = `https://ado.example/org/${PROJECT}/_apis/wit/attachments/?FileNameGUID=${GUID}&FileName=a.png`;

      expect(resolveAttachmentSrc(src)?.fileName).toBe('a.png');
    });

    test('falls back to unknown.png when FileName is missing or has no extension', () => {
      const base = `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=${GUID}`;

      expect(resolveAttachmentSrc(base)?.fileName).toBe('unknown.png');
      expect(resolveAttachmentSrc(`${base}&FileName=image`)?.fileName).toBe('unknown.png');
      expect(resolveAttachmentSrc(`${base}&FileName=`)?.fileName).toBe('unknown.png');
    });
  });

  describe('everything else keeps the existing handling (null)', () => {
    test.each([
      ['the documented REST route with the id in the path', `https://ado.example/org/${PROJECT}/_apis/wit/attachments/${GUID}?fileName=ok.png`],
      ['the same with download and api-version', `https://ado.example/org/_apis/wit/attachments/${GUID}?fileName=ok.png&download=true&api-version=7.1`],
      ['a collection route without any id', `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileName=a.png`],
      ['an invalid GUID', `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileNameGUID=not-a-guid&FileName=a.png`],
      ['a non-numeric FileID', `https://ado.example/org/${PROJECT}/_apis/wit/attachments?FileID=12ab&FileName=a.png`],
      ['FileNameGUID on an unrelated path', `https://example.com/images/photo.png?FileNameGUID=${GUID}`],
      ['a plain image URL with a query', 'https://example.com/image.jpg?filename=example.jpg'],
      ['a URL without a query', 'https://example.com/images/photo.png'],
      ['a blob: URL', `blob:https://ado.example/${GUID}`],
      ['a data: URL', 'data:image/png;base64,AAAA'],
      ['an empty string', ''],
    ])('%s', (_label, src) => {
      expect(resolveAttachmentSrc(src)).toBeNull();
    });

    test('non-string input', () => {
      expect(resolveAttachmentSrc(undefined)).toBeNull();
      expect(resolveAttachmentSrc(null)).toBeNull();
      expect(resolveAttachmentSrc(42)).toBeNull();
    });
  });
});
