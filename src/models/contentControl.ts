export class contentControl {
  title: string;
  wordObjects: any[];
  minioAttachmentData?: any[];
}

export interface Artifact {
  alias: string;
  definitionReference: any;
  isPrimary: boolean;
  isRetained: boolean;
  type: string;
}

export interface GitObject {
  type: string;
  ref: string;
}
