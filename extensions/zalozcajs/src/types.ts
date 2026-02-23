// zca-js wrapper types

export type ZcaJsFriend = {
  userId: string;
  displayName: string;
  avatar?: string;
  zaloName?: string;
  phoneNumber?: string;
};

export type ZcaJsGroup = {
  groupId: string;
  name: string;
  memberCount?: number;
};

export type ZcaJsUserInfo = {
  userId: string;
  displayName: string;
  avatar?: string;
};

export type ZcaJsMessage = {
  threadId: string;
  msgId?: string;
  content: string;
  timestamp: number;
  isGroup: boolean;
  isSelf: boolean;
  senderName?: string;
  senderId?: string;
  groupName?: string;
};

export type ZalozcajsAccountConfig = {
  enabled?: boolean;
  name?: string;
  credentialsPath?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Record<
    string,
    { allow?: boolean; enabled?: boolean; tools?: { allow?: string[]; deny?: string[] } }
  >;
  messagePrefix?: string;
  responsePrefix?: string;
};

export type ZalozcajsConfig = {
  enabled?: boolean;
  name?: string;
  credentialsPath?: string;
  defaultAccount?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Record<
    string,
    { allow?: boolean; enabled?: boolean; tools?: { allow?: string[]; deny?: string[] } }
  >;
  messagePrefix?: string;
  responsePrefix?: string;
  accounts?: Record<string, ZalozcajsAccountConfig>;
};

export type ResolvedZalozcajsAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  credentialsPath: string;
  authenticated: boolean;
  config: ZalozcajsAccountConfig;
};
