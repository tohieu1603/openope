import { html, nothing } from "lit";

export interface RegisterProps {
  loading?: boolean;
  error?: string;
  onRegister: (email: string, password: string, name: string) => void;
  onNavigateToLogin: () => void;
}

export function renderRegister(props: RegisterProps) {
  const { loading = false, error } = props;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (loading) return;

    const form = e.target as HTMLFormElement;
    const nameInput = form.querySelector('operis-input[name="name"]') as HTMLElement & { value?: string };
    const emailInput = form.querySelector('operis-input[type="email"]') as HTMLElement & { value?: string };
    const passwordInput = form.querySelector('operis-input[type="password"]') as HTMLElement & { value?: string };
    const confirmInput = form.querySelector('operis-input[name="confirm"]') as HTMLElement & { value?: string };

    const name = nameInput?.value?.trim() ?? "";
    const email = emailInput?.value?.trim() ?? "";
    const password = passwordInput?.value?.trim() ?? "";
    const confirm = confirmInput?.value?.trim() ?? "";

    if (!name || !email || !password) return;

    if (password !== confirm) {
      // Show error via form validation
      return;
    }

    props.onRegister(email, password, name);
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
      .register-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
        padding: 12px 16px;
        border-radius: var(--radius-md);
        font-size: 14px;
        margin-bottom: 16px;
      }

      .register-form button[type="submit"]:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      .register-container {
        position: absolute;
        inset: 0;
        background: var(--bg);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .register-card {
        width: 100%;
        max-width: 400px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 32px;
      }

      .register-header {
        text-align: center;
        margin-bottom: 24px;
      }

      .register-logo {
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        background: var(--accent-subtle);
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--accent);
      }

      .register-logo svg {
        width: 24px;
        height: 24px;
      }

      .register-title {
        font-size: 20px;
        font-weight: 600;
        color: var(--text-strong);
        margin-bottom: 4px;
      }

      .register-subtitle {
        font-size: 14px;
        color: var(--muted);
      }

      .register-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .register-footer {
        text-align: center;
        margin-top: 20px;
        font-size: 14px;
        color: var(--muted);
      }

      .register-footer a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 500;
      }

      .register-footer a:hover {
        text-decoration: underline;
      }
    </style>

    <div class="register-container">
      <div class="register-card">
        <div class="register-header">
          <div class="register-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="register-title">Tạo tài khoản</div>
          <div class="register-subtitle">Đăng ký tài khoản Operis mới</div>
        </div>

        ${error ? html`<div class="register-error">${error}</div>` : nothing}

        <form class="register-form" @submit=${handleSubmit}>
          <div class="form-group">
            <label class="form-label">Họ và tên</label>
            <operis-input
              type="text"
              name="name"
              placeholder="Nguyễn Văn A"
              required
              autocomplete="name"
              ?disabled=${loading}
              @keydown=${handleKeyDown}
            ></operis-input>
          </div>

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
              placeholder="Tối thiểu 8 ký tự"
              required
              autocomplete="new-password"
              ?disabled=${loading}
              @keydown=${handleKeyDown}
            ></operis-input>
          </div>

          <div class="form-group">
            <label class="form-label">Xác nhận mật khẩu</label>
            <operis-input
              type="password"
              name="confirm"
              placeholder="Nhập lại mật khẩu"
              required
              autocomplete="new-password"
              ?disabled=${loading}
              @keydown=${handleKeyDown}
            ></operis-input>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;" ?disabled=${loading}>
            ${loading ? "Đang đăng ký..." : "Đăng ký"}
          </button>
        </form>

        <div class="register-footer">
          Đã có tài khoản?
          <a href="#" @click=${(e: Event) => { e.preventDefault(); props.onNavigateToLogin(); }}>Đăng nhập</a>
        </div>
      </div>
    </div>
  `;
}
