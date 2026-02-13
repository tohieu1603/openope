import type { IconName } from "./icons";

export type Tab = "chat" | "billing" | "logs" | "workflow" | "docs" | "channels" | "settings" | "login" | "agents" | "skills" | "nodes" | "analytics";

export const NAV_ITEMS: Array<{
  tab: Tab;
  label: string;
  icon: IconName;
  description: string;
  section: "main" | "account" | "agent";
}> = [
  {
    tab: "chat",
    label: "Chat",
    icon: "messageSquare",
    description: "Direct gateway chat session for quick interventions.",
    section: "main",
  },
  {
    tab: "analytics",
    label: "Analytics",
    icon: "barChart",
    description: "View usage statistics and costs",
    section: "main",
  },
  {
    tab: "billing",
    label: "Billing",
    icon: "creditCard",
    description: "Manage your subscription and payments",
    section: "main",
  },
  {
    tab: "logs",
    label: "Logs",
    icon: "scrollText",
    description: "View your conversation history",
    section: "main",
  },
  {
    tab: "workflow",
    label: "Workflow",
    icon: "workflow",
    description: "Automate tasks with workflows",
    section: "main",
  },
  {
    tab: "docs",
    label: "Docs",
    icon: "book",
    description: "Documentation and guides",
    section: "main",
  },
  // Agent section
  {
    tab: "agents",
    label: "Agents",
    icon: "folder",
    description: "Quản lý agents và workspace",
    section: "agent",
  },
  {
    tab: "skills",
    label: "Skills",
    icon: "zap",
    description: "Quản lý skills và cài đặt",
    section: "agent",
  },
  {
    tab: "nodes",
    label: "Nodes",
    icon: "cpu",
    description: "Thiết bị và node kết nối",
    section: "agent",
  },
  // Account section
  {
    tab: "settings",
    label: "Settings",
    icon: "settings",
    description: "Account settings and preferences",
    section: "account",
  },
  {
    tab: "login",
    label: "Login",
    icon: "logIn",
    description: "Sign in to your account",
    section: "account",
  },
];

const TAB_PATHS: Record<Tab, string> = {
  chat: "/chat",
  analytics: "/analytics",
  billing: "/billing",
  logs: "/logs",
  workflow: "/workflow",
  docs: "/docs",
  channels: "/channels",
  settings: "/settings",
  login: "/login",
  agents: "/agents",
  skills: "/skills",
  nodes: "/nodes",
};

const PATH_TO_TAB = new Map(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab])
);

export function normalizeBasePath(basePath: string): string {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base === "/") return "";
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

export function normalizePath(path: string): string {
  if (!path) return "/";
  let normalized = path.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) normalized = "/";
  if (normalized === "/") return "chat";
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function iconForTab(tab: Tab): IconName {
  const item = NAV_ITEMS.find((item) => item.tab === tab);
  return item?.icon ?? "messageSquare";
}

export function titleForTab(tab: Tab): string {
  const item = NAV_ITEMS.find((item) => item.tab === tab);
  return item?.label ?? "Chat";
}

export function subtitleForTab(tab: Tab): string {
  const item = NAV_ITEMS.find((item) => item.tab === tab);
  return item?.description ?? "";
}
