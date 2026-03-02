import type { ThemeMode } from "./theme";

export interface ClientSettings {
  theme: ThemeMode;
  navCollapsed: boolean;
  chatSidebarCollapsed: boolean;
  isLoggedIn: boolean;
  username: string | null;
}

const STORAGE_KEY = "operis-client-settings";

const DEFAULT_SETTINGS: ClientSettings = {
  theme: "system",
  navCollapsed: false,
  chatSidebarCollapsed: false,
  isLoggedIn: false,
  username: null,
};

export function loadSettings(): ClientSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ClientSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}
