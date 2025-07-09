import logger from '../services/logger';

export default class NonAssociatedCommitsDataSkinAdapter {
  rawChangesArray: any = [];
  adoptedData: any = [];
  includeCommitterName: boolean = false;

  constructor(rawChangesArray: any, includeCommitterName: boolean = false) {
    this.rawChangesArray = rawChangesArray;
    this.includeCommitterName = includeCommitterName;
  }

  private convertDateToLocalTime(utcDateString: string): string {
    const date = new Date(utcDateString);
    return date.toLocaleString('en-IL', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  async adoptSkinData() {
    logger.debug('NonAssociatedCommitsDataSkinAdapter: Started adopting skin data');
    this.adoptedData = [];
    const nonLinkedCommits = this.rawChangesArray
      .filter((change: any) => change.nonLinkedCommits && change.nonLinkedCommits.length > 0)
      ?.map((change: any) => change.nonLinkedCommits)
      ?.flat()
      ?.sort((a: any, b: any) => new Date(b.commitDate).getTime() - new Date(a.commitDate).getTime());

    nonLinkedCommits.forEach((commit: any, index: number) => {
      const fields: any[] = [
        { name: '#', value: index + 1, width: '5.5%' },
        { name: 'Commit #', value: commit.commitId.substring(0, 5), width: '11.1%', url: commit.url },
      ];

      if (this.includeCommitterName) {
        fields.push({ name: 'Committer', value: commit.committer, width: '19.4%' });
      }

      fields.push(
        { name: 'Comment', value: commit.comment },
        { name: 'Date', value: this.convertDateToLocalTime(commit.commitDate), width: '20.7%' }
      );
      this.adoptedData.push({ fields });
    });

    return this.adoptedData;
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
