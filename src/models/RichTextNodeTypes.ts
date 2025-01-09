export type RichNode = ParagraphNode | TextNode | ImageNode | TableNode | BreakNode | ListNode | OtherNode;

export interface ParagraphNode {
  type: 'paragraph';
  children: RichNode[];
}

export interface textStyle {
  Bold?: boolean;
  Italic?: boolean;
  Underline?: boolean;
  Small?: boolean; //<small></small>
  StrikeThrough?: boolean; //<del></del>
  Marked?: boolean; //<mark></mark>
  Subscript?: boolean; //<sub></sub>
  Superscript?: boolean; //<sup></sup>
  Href?: string; //<a href=""></a>
  InsertSpace?: boolean;
}

export interface TextNode {
  type: 'text';
  value: string;
  textStyling?: textStyle;
}

export interface BreakNode {
  type: 'break';
}

export interface ImageNode {
  type: 'image';
  src: string;
  alt?: string;
}

export interface TableNode {
  type: 'table';
  children: RichNode[];
}

export interface ListNode {
  type: 'list';
  isOrdered: boolean;
  children: RichNode[];
}

export interface OtherNode {
  type: 'other';
  tagName: string;
  children: RichNode[];
}
