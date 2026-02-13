import { html, nothing } from "lit";

export interface LoginProps {
  loading?: boolean;
  error?: string;
  onLogin: (email: string, password: string) => void;
}

export function renderLogin(props: LoginProps) {
  const { loading = false, error } = props;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (loading) return;

    const form = e.target as HTMLFormElement;
    const emailInput = form.querySelector('operis-input[type="email"]') as HTMLElement & { value?: string };
    const passwordInput = form.querySelector('operis-input[type="password"]') as HTMLElement & { value?: string };

    const email = emailInput?.value?.trim() ?? "";
    const password = passwordInput?.value?.trim() ?? "";

    if (email && password) {
      props.onLogin(email, password);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      const form = (e.target as HTMLElement).closest("form");
      if (form) {
        form.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    }
  };

  return html`
    <style>
      .login-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
        padding: 12px 16px;
        border-radius: var(--radius-md);
        font-size: 14px;
        margin-bottom: 16px;
      }

      .login-form button[type="submit"]:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    </style>

    <div class="login-container" style="position: absolute; inset: 0; background: var(--bg);">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="login-title">Chào mừng trở lại</div>
          <div class="login-subtitle">Đăng nhập vào tài khoản Operis</div>
        </div>

        ${error ? html`<div class="login-error">${error}</div>` : nothing}

        <form class="login-form" @submit=${handleSubmit}>
          <div class="form-group">
            <label class="form-label">Email</label>
            <operis-input
              type="email"
              placeholder="you@example.com"
              required
              autocomplete="email"
              ?disabled=${loading}
              @keydown=${handleKeyDown}
            ></operis-input>
          </div>

          <div class="form-group">
            <label class="form-label">Mật khẩu</label>
            <operis-input
              type="password"
              placeholder="Nhập mật khẩu"
              required
              autocomplete="current-password"
              ?disabled=${loading}
              @keydown=${handleKeyDown}
            ></operis-input>
            <div class="form-hint" style="text-align: right;">
              <a href="#" @click=${(e: Event) => e.preventDefault()}>Quên mật khẩu?</a>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;" ?disabled=${loading}>
            ${loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div class="login-footer">
          Liên hệ quản trị viên để được cấp tài khoản.
        </div>
      </div>
    </div>
  `;
}
