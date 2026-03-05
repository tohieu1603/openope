/**
 * Settings domain action functions.
 */
import { showToast } from "./components/operis-toast";
import { waitForConnection } from "./gateway-client";
import { getUserProfile, updateUserProfile, changePassword, type UserProfile } from "./user-api";

export interface SettingsHost {
  userProfile: UserProfile | null;
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: string | null;
  settingsSuccess: string | null;
  settingsEditingName: boolean;
  settingsNameValue: string;
  settingsShowPasswordForm: boolean;
  // API key
  settingsApiKey: string;
  settingsApiKeyLoading: boolean;
  settingsApiKeySaving: boolean;
  settingsApiKeyHasKey: boolean;
}

export async function loadUserProfile(host: SettingsHost) {
  host.settingsLoading = true;
  host.settingsError = null;
  try {
    host.userProfile = await getUserProfile();
    host.settingsNameValue = host.userProfile.name;
  } catch (err) {
    host.settingsError = err instanceof Error ? err.message : "Không thể tải hồ sơ";
  } finally {
    host.settingsLoading = false;
  }
}

export function handleEditName(host: SettingsHost) {
  host.settingsEditingName = true;
  host.settingsNameValue = host.userProfile?.name || "";
}

export function handleCancelEditName(host: SettingsHost) {
  host.settingsEditingName = false;
  host.settingsNameValue = host.userProfile?.name || "";
}

export async function handleSaveName(host: SettingsHost) {
  if (!host.settingsNameValue.trim()) return;
  host.settingsSaving = true;
  host.settingsError = null;
  host.settingsSuccess = null;
  try {
    host.userProfile = await updateUserProfile({ name: host.settingsNameValue.trim() });
    host.settingsEditingName = false;
    host.settingsSuccess = "Đã cập nhật thành công";
    setTimeout(() => (host.settingsSuccess = null), 3000);
    showToast("Đã cập nhật tên", "success");
  } catch (err) {
    host.settingsError = err instanceof Error ? err.message : "Không thể cập nhật hồ sơ";
    showToast(err instanceof Error ? err.message : "Không thể cập nhật hồ sơ", "error");
  } finally {
    host.settingsSaving = false;
  }
}

export async function handleChangePassword(
  host: SettingsHost,
  currentPassword: string,
  newPassword: string,
) {
  host.settingsSaving = true;
  host.settingsError = null;
  host.settingsSuccess = null;
  try {
    await changePassword(currentPassword, newPassword);
    host.settingsShowPasswordForm = false;
    host.settingsSuccess = "Đổi mật khẩu thành công";
    setTimeout(() => (host.settingsSuccess = null), 3000);
    showToast("Đổi mật khẩu thành công", "success");
  } catch (err) {
    host.settingsError = err instanceof Error ? err.message : "Không thể đổi mật khẩu";
    showToast(err instanceof Error ? err.message : "Không thể đổi mật khẩu", "error");
  } finally {
    host.settingsSaving = false;
  }
}

export async function loadApiKeyStatus(host: SettingsHost) {
  host.settingsApiKeyLoading = true;
  try {
    const client = await waitForConnection();
    const res = await client.request<{ config: Record<string, unknown>; hash: string }>(
      "config.get",
      {},
    );
    if (res?.config) {
      const providers = (res.config as any)?.models?.providers?.operis;
      host.settingsApiKeyHasKey = !!(providers?.apiKey && providers.apiKey !== "••••••••");
    }
  } catch {
    // ignore — config may not be available
  } finally {
    host.settingsApiKeyLoading = false;
  }
}

export async function handleSaveApiKey(host: SettingsHost) {
  const key = host.settingsApiKey.trim();
  if (!key) return;
  host.settingsApiKeySaving = true;
  host.settingsError = null;
  try {
    const client = await waitForConnection();
    const snapshot = await client.request<{ config: Record<string, unknown>; hash: string }>(
      "config.get",
      {},
    );
    const baseHash = snapshot?.hash ?? "";
    await client.request("config.patch", {
      baseHash,
      raw: JSON.stringify({ models: { providers: { operis: { apiKey: key } } } }),
    });
    host.settingsApiKey = "";
    host.settingsApiKeyHasKey = true;
    host.settingsSuccess = "API key đã được lưu";
    setTimeout(() => (host.settingsSuccess = null), 3000);
    showToast("API key đã được lưu", "success");
  } catch (err) {
    host.settingsError = err instanceof Error ? err.message : "Không thể lưu API key";
    showToast(err instanceof Error ? err.message : "Không thể lưu API key", "error");
  } finally {
    host.settingsApiKeySaving = false;
  }
}
