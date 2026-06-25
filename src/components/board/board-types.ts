export type AvatarColor = "default" | "red" | "blue" | "green";

export type FileAttachment = {
  name: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
};

export type BoardReaction = {
  emoji: string;
  count: number;
  isMine: boolean;
};

export type BoardPost = {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  imageUrls: string[];
  fileAttachments: FileAttachment[];
  isPinned: boolean;
  pinnedAt: string | null;
  allowComments: boolean;
  createdAt: string;
  authorName: string;
  authorId: string;
  authorRole: string;
  avatarColor: AvatarColor;
  commentCount: number;
  reactions: BoardReaction[];
  isUnread: boolean;
  category: string | null;
};

export type BoardComment = {
  id: string;
  content: string;
  authorName: string;
  authorId: string;
  avatarColor: AvatarColor;
  timeLabel: string;
  imageUrls: string[];
  isOwn: boolean;
  reactions: { emoji: string; count: number }[];
};
