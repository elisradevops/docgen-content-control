import logger from '../services/logger';
import { ArtifactChangesGroup, NonLinkedCommit } from '../models/changeModels';
import { formatLocalIL, buildReleaseRunChangeComparator } from '../services/adapterUtils';

/**
 * Adapter that builds a separate table for commits without linked work items.
 * Rows are sorted by Release Version, Release Run Date, then Commit Date (descending).
 */
export default class NonAssociatedCommitsDataSkinAdapter {
  rawChangesArray: ArtifactChangesGroup[] = [];
  adoptedData: any[] = [];
  includeCommittedBy: boolean = false;

  /**
   * @param rawChangesArray Aggregated artifact groups containing nonLinkedCommits
   * @param includeCommittedBy Whether to include a "Committed by" column
   */
  constructor(rawChangesArray: ArtifactChangesGroup[], includeCommittedBy: boolean = false) {
    this.rawChangesArray = rawChangesArray;
    this.includeCommittedBy = includeCommittedBy;
  }

  /**
   * Converts a UTC date/time to 'en-IL' localized output (Asia/Jerusalem).
   */
  private convertDateToLocalTime(utcDateString: string | Date): string {
    return formatLocalIL(utcDateString);
  }

  /**
   * Sanitize text for Word/OpenXML output by removing control characters that
   * are invalid in XML (e.g. vertical tab 0x0B). This prevents downstream
   * serialization errors in the JsonToWord service.
   */
  private sanitizeText(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    // Remove ASCII control chars that are not TAB (0x09), LF (0x0A), or CR (0x0D)
    return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  /**
   * Adopts a flat list of non-linked commits into a skin-friendly rows array.
   * Only artifacts with nonLinkedCommits are considered. Column order and widths
   * are tuned for portrait layout.
   */
  async adoptSkinData() {
    logger.debug('NonAssociatedCommitsDataSkinAdapter: Started adopting skin data');
    this.adoptedData = [];
    const nonLinkedCommits: NonLinkedCommit[] = this.rawChangesArray
      .filter((change: any) => change.nonLinkedCommits && change.nonLinkedCommits.length > 0)
      ?.map((change: any) => change.nonLinkedCommits)
      ?.flat();

    const sortedNonLinked = [...(nonLinkedCommits || [])].sort(
      buildReleaseRunChangeComparator<NonLinkedCommit>(
        (c) => c?.releaseVersion || '',
        (c) => c?.releaseRunDate,
        (c) => c?.commitDate
      )
    );

    sortedNonLinked.forEach((commit: NonLinkedCommit, index: number) => {
      const isReleaseCommit = commit.releaseVersion && commit.releaseRunDate;
      const fields: any[] = [
        { name: '#', value: index + 1, width: '5.5%' },
        {
          name: 'Commit #',
          value: this.sanitizeText(commit.commitId.substring(0, 5)),
          width: '11.1%',
          url: this.sanitizeText(commit.url),
        },
      ];

      fields.push(
        { name: 'Comment', value: this.sanitizeText(commit.comment) },
        {
          name: 'Committed Date & Time',
          value: this.sanitizeText(this.convertDateToLocalTime(commit.commitDate)),
          width: isReleaseCommit ? '15.3%' : '20.7%',
        }
      );
      if (this.includeCommittedBy) {
        fields.push({
          name: 'Committed by',
          value: this.sanitizeText(commit.committer),
          width: isReleaseCommit ? '15.3%' : '19.4%',
        });
      }

      if (isReleaseCommit) {
        fields.push({
          name: 'Release',
          value: this.sanitizeText(commit.releaseVersion || ''),
          width: '12.5%',
        });
        fields.push({
          name: 'Created',
          value: commit.releaseRunDate
            ? this.sanitizeText(this.convertDateToLocalTime(commit.releaseRunDate))
            : '',
          width: '12.5%',
        });
      }
      this.adoptedData.push({ fields });
    });

    return this.adoptedData;
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
