import type { Conversation } from "../../chat-api";
import type { ModelEntry } from "./model-selector";
import type { ThinkingLevel } from "./thinking-control";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | Date;
  /** Base64 image previews attached to this message */
  images?: Array<{ preview: string }>;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  phase: "start" | "update" | "result";
  isError?: boolean;
  /** Short action detail e.g. "navigate · google.com" */
  detail?: string;
  /** Tool output text (result phase) */
  output?: string;
}

export interface QueueItem {
  id: string;
  text: string;
  createdAt: number;
  images?: Array<{ preview: string }>;
}

export interface PendingImage {
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for display
}

export interface ChatProps {
  messages: ChatMessage[];
  draft: string;
  sending: boolean;
  loading?: boolean;
  isLoggedIn: boolean;
  username?: string;
  botName?: string;
  streamingText?: string;
  toolCalls?: ToolCallInfo[];
  pendingImages?: PendingImage[];
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onLoginClick: () => void;
  onImageSelect: (files: FileList) => void;
  onImageRemove: (index: number) => void;
  onScroll?: (e: Event) => void;
  gatewayReady?: boolean;
  // Sidebar props
  conversations?: Conversation[];
  conversationsLoading?: boolean;
  currentConversationId?: string | null;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewConversation?: () => void;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onRefreshChat?: () => void;
  compactionActive?: boolean;
  queue?: QueueItem[];
  onQueueRemove?: (id: string) => void;
  sessionKey?: string;
  /** Available gateway sessions for the session selector dropdown */
  gatewaySessions?: Array<{
    key: string;
    displayName?: string;
    derivedTitle?: string;
    lastMessagePreview?: string;
    model?: string;
    updatedAt?: number | null;
    kind?: string;
  }>;
  onSessionChange?: (key: string) => void;
  // Thinking level control
  thinkingLevel?: ThinkingLevel | null;
  onThinkingChange?: (level: ThinkingLevel) => void;
  // Model selector
  availableModels?: ModelEntry[];
  currentModel?: string | null;
  modelsLoading?: boolean;
  onModelChange?: (modelId: string) => void;
}
