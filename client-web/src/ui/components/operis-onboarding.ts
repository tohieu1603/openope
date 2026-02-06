import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface OnboardingStep {
  id: string;
  target: string; // CSS selector for the element to highlight
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right" | "auto";
  requiresClick?: boolean; // User must click the target to proceed
  action?: string; // Label for the action button if different from "Next"
  type?: "default" | "welcome" | "celebration"; // Step types: welcome = centered intro, celebration = confetti modal
  emoji?: string; // Optional emoji for welcome/celebration modals
}

export interface OnboardingConfig {
  steps: OnboardingStep[];
  storageKey?: string; // Key to save completion status
  onComplete?: () => void;
  onSkip?: () => void;
}

@customElement("operis-onboarding")
export class OperisOnboarding extends LitElement {
  @property({ type: Array }) steps: OnboardingStep[] = [];
  @property({ type: String }) storageKey = "operis-onboarding-completed";
  @property({ type: Boolean }) active = false;

  @state() private currentStep = 0;
  @state() private targetRect: DOMRect | null = null;
  @state() private tooltipPosition = { x: 0, y: 0 };
  @state() private tooltipSide: "top" | "bottom" | "left" | "right" = "bottom";
  @state() private cursorPosition = { x: 0, y: 0 };
  @state() private showCursor = false;
  @state() private cursorClicking = false;
  @state() private isAnimating = false;
  @state() private showCelebration = false;
  @state() private showWelcome = false;
  @state() private confetti: Array<{
    id: number;
    x: number;
    color: string;
    delay: number;
    duration: number;
    shape: string;
  }> = [];

  private resizeObserver: ResizeObserver | null = null;

  static styles = css`
    :host {
      --onboarding-overlay: rgba(0, 0, 0, 0.75);
      --onboarding-spotlight: 8px;
      --onboarding-card-bg: var(--card, #1a1a2e);
      --onboarding-card-border: var(--border, rgba(255, 255, 255, 0.1));
      --onboarding-accent: var(--accent, #6366f1);
      --onboarding-text: var(--text, #e5e5e5);
      --onboarding-muted: var(--muted, #888);
    }

    .onboarding-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
      pointer-events: none;
    }

    .onboarding-backdrop {
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 9997;
      pointer-events: all;
    }

    .spotlight {
      position: fixed;
      z-index: 9999;
      border-radius: var(--onboarding-spotlight);
      box-shadow:
        0 0 0 9999px var(--onboarding-overlay),
        0 0 40px 8px rgba(99, 102, 241, 0.15);
      pointer-events: none;
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .spotlight::before {
      content: "";
      position: absolute;
      inset: -4px;
      border: 2px solid var(--onboarding-accent);
      border-radius: calc(var(--onboarding-spotlight) + 4px);
      opacity: 0.6;
      animation: spotlight-pulse 2s ease-in-out infinite;
    }

    @keyframes spotlight-pulse {
      0%,
      100% {
        opacity: 0.6;
        transform: scale(1);
      }
      50% {
        opacity: 0.3;
        transform: scale(1.02);
      }
    }

    .tooltip-card {
      position: fixed;
      z-index: 10001;
      width: 320px;
      max-height: calc(100vh - 32px);
      // overflow-y: hidden;
      background: var(--onboarding-card-bg);
      border: 1px solid var(--onboarding-card-border);
      border-radius: 16px;
      padding: 20px;
      box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      backdrop-filter: blur(20px);
      opacity: 0;
      transform: translateY(10px) scale(0.98);
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: all;
    }

    .tooltip-card.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .tooltip-card::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 16px;
      background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.05) 0%,
        transparent 50%
      );
      pointer-events: none;
    }

    .tooltip-arrow {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--onboarding-card-bg);
      border: 1px solid var(--onboarding-card-border);
      transform: rotate(45deg);
      z-index: -1;
    }

    .tooltip-card[data-side="bottom"] .tooltip-arrow {
      top: -7px;
      left: 50%;
      margin-left: -6px;
      border-right: none;
      border-bottom: none;
    }

    .tooltip-card[data-side="top"] .tooltip-arrow {
      bottom: -7px;
      left: 50%;
      margin-left: -6px;
      border-left: none;
      border-top: none;
    }

    .tooltip-card[data-side="left"] .tooltip-arrow {
      right: -7px;
      top: 50%;
      margin-top: -6px;
      border-left: none;
      border-bottom: none;
    }

    .tooltip-card[data-side="right"] .tooltip-arrow {
      left: -7px;
      top: 50%;
      margin-top: -6px;
      border-right: none;
      border-top: none;
    }

    .tooltip-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .tooltip-step-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .step-dots {
      display: flex;
      gap: 6px;
    }

    .step-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--onboarding-card-border);
      transition: all 0.3s ease;
    }

    .step-dot.active {
      background: var(--onboarding-accent);
      box-shadow: 0 0 8px var(--onboarding-accent);
    }

    .step-dot.completed {
      background: var(--onboarding-accent);
      opacity: 0.5;
    }

    .step-count {
      font-size: 12px;
      color: var(--onboarding-muted);
      font-weight: 500;
    }

    .tooltip-close {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: var(--onboarding-muted);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tooltip-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--onboarding-text);
    }

    .tooltip-close svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .tooltip-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--onboarding-text);
      margin: 0 0 6px;
      line-height: 1.3;
    }

    .tooltip-description {
      font-size: 13px;
      color: var(--onboarding-muted);
      line-height: 1.5;
      margin: 0 0 16px;
      white-space: pre-line;
    }

    .tooltip-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tooltip-btn {
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tooltip-btn-primary {
      background: var(--onboarding-accent);
      color: white;
      flex: 1;
    }

    .tooltip-btn-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .tooltip-btn-primary:active {
      transform: translateY(0);
    }

    .tooltip-btn-ghost {
      background: transparent;
      color: var(--onboarding-muted);
      padding: 8px 12px;
    }

    .tooltip-btn-ghost:hover {
      color: var(--onboarding-text);
      background: rgba(255, 255, 255, 0.05);
    }

    .tooltip-btn-back {
      width: 32px;
      height: 32px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    }

    .tooltip-btn-back svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .tooltip-btn-back:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--onboarding-text);
    }

    /* Animated Cursor */
    .onboarding-cursor {
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
    }

    .onboarding-cursor.visible {
      opacity: 1;
    }

    .cursor-hand {
      width: 40px;
      height: 40px;
      position: relative;
    }

    .cursor-hand svg {
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }

    .cursor-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 24px;
      height: 24px;
      margin: -12px 0 0 -12px;
      border: 2px solid var(--onboarding-accent);
      border-radius: 50%;
      opacity: 0;
      transform: scale(0.5);
      transition: all 0.3s ease;
    }

    .onboarding-cursor.clicking .cursor-ring {
      opacity: 1;
      transform: scale(1.5);
      animation: cursor-ripple 0.6s ease-out;
    }

    @keyframes cursor-ripple {
      0% {
        opacity: 1;
        transform: scale(0.5);
      }
      100% {
        opacity: 0;
        transform: scale(2);
      }
    }

    /* Interaction hint */
    .interaction-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 8px;
      margin-top: 12px;
      font-size: 12px;
      color: var(--onboarding-accent);
    }

    .interaction-hint svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      flex-shrink: 0;
    }

    .progress-fill {
      height: 100%;
      background: var(--onboarding-accent);
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Celebration Modal */
    .celebration-overlay {
      position: fixed;
      inset: 0;
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.85);
      opacity: 0;
      transition: opacity 0.4s ease;
    }

    .celebration-overlay.visible {
      opacity: 1;
    }

    .celebration-modal {
      position: relative;
      width: 90%;
      max-width: 420px;
      background: linear-gradient(
        135deg,
        var(--onboarding-card-bg),
        rgba(99, 102, 241, 0.1)
      );
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 24px;
      padding: 40px 32px;
      text-align: center;
      box-shadow:
        0 0 60px rgba(99, 102, 241, 0.3),
        0 25px 50px -12px rgba(0, 0, 0, 0.5);
      transform: scale(0.8) translateY(20px);
      opacity: 0;
      transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .celebration-overlay.visible .celebration-modal {
      transform: scale(1) translateY(0);
      opacity: 1;
    }

    .celebration-emoji {
      font-size: 72px;
      margin-bottom: 16px;
      animation: celebration-bounce 1s ease-in-out infinite;
    }

    @keyframes celebration-bounce {
      0%,
      100% {
        transform: translateY(0) scale(1);
      }
      50% {
        transform: translateY(-10px) scale(1.1);
      }
    }

    .celebration-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--onboarding-text);
      margin: 0 0 12px;
      background: linear-gradient(135deg, #fff, #a5b4fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .celebration-description {
      font-size: 15px;
      color: var(--onboarding-muted);
      line-height: 1.6;
      margin: 0 0 28px;
    }

    .celebration-btn {
      padding: 14px 32px;
      font-size: 15px;
      font-weight: 600;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }

    .celebration-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
    }

    /* Confetti */
    .confetti-container {
      position: fixed;
      inset: 0;
      z-index: 10001;
      pointer-events: none;
      overflow: hidden;
    }

    .confetti {
      position: absolute;
      width: 10px;
      height: 10px;
      animation: confetti-fall linear forwards;
    }

    .confetti.circle {
      border-radius: 50%;
    }
    .confetti.square {
      border-radius: 2px;
    }
    .confetti.ribbon {
      width: 8px;
      height: 20px;
      border-radius: 2px;
    }

    @keyframes confetti-fall {
      0% {
        transform: translateY(-100vh) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateY(100vh) rotate(720deg);
        opacity: 0;
      }
    }

    /* Sparkles around modal */
    .sparkle {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #fff;
      border-radius: 50%;
      animation: sparkle 1.5s ease-in-out infinite;
    }

    @keyframes sparkle {
      0%,
      100% {
        opacity: 0;
        transform: scale(0);
      }
      50% {
        opacity: 1;
        transform: scale(1);
      }
    }

    /* Welcome Modal (similar to celebration but cleaner) */
    .welcome-overlay {
      position: fixed;
      inset: 0;
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.85);
      opacity: 0;
      transition: opacity 0.4s ease;
    }

    .welcome-overlay.visible {
      opacity: 1;
    }

    .welcome-modal {
      position: relative;
      width: 90%;
      max-width: 440px;
      background: var(--onboarding-card-bg);
      border: 1px solid var(--onboarding-card-border);
      border-radius: 24px;
      padding: 48px 36px 40px;
      text-align: center;
      box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      transform: scale(0.9) translateY(20px);
      opacity: 0;
      transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .welcome-overlay.visible .welcome-modal {
      transform: scale(1) translateY(0);
      opacity: 1;
    }

    .welcome-emoji {
      font-size: 64px;
      margin-bottom: 20px;
      animation: welcome-float 3s ease-in-out infinite;
    }

    @keyframes welcome-float {
      0%,
      100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-8px);
      }
    }

    .welcome-title {
      font-size: 26px;
      font-weight: 700;
      color: var(--onboarding-text);
      margin: 0 0 12px;
    }

    .welcome-description {
      font-size: 15px;
      color: var(--onboarding-muted);
      line-height: 1.7;
      margin: 0 0 32px;
    }

    .welcome-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .welcome-btn {
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .welcome-btn-primary {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }

    .welcome-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
    }

    .welcome-btn-ghost {
      background: transparent;
      color: var(--onboarding-muted);
      border: 1px solid var(--onboarding-card-border);
    }

    .welcome-btn-ghost:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--onboarding-text);
    }

    .welcome-step-indicator {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 24px;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => this.updateTargetPosition());
    window.addEventListener("resize", () => this.updateTargetPosition());
    window.addEventListener("scroll", () => this.updateTargetPosition(), true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", () => this.updateTargetPosition());
    window.removeEventListener(
      "scroll",
      () => this.updateTargetPosition(),
      true,
    );
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("active") && this.active) {
      this.startOnboarding();
    }
    if (changedProperties.has("currentStep")) {
      const step = this.steps[this.currentStep];
      if (step?.type === "celebration") {
        this.showCelebrationModal();
      } else if (step?.type === "welcome") {
        this.showWelcomeModal();
      } else {
        this.updateTargetPosition();
      }
    }
  }

  private showWelcomeModal() {
    this.targetRect = null;
    this.showCursor = false;
    setTimeout(() => {
      this.showWelcome = true;
    }, 100);
  }

  private showCelebrationModal() {
    this.targetRect = null;
    this.showCursor = false;
    this.generateConfetti();
    setTimeout(() => {
      this.showCelebration = true;
    }, 100);
  }

  private generateConfetti() {
    const colors = [
      "#6366f1",
      "#8b5cf6",
      "#ec4899",
      "#f59e0b",
      "#10b981",
      "#3b82f6",
      "#ef4444",
    ];
    const shapes = ["circle", "square", "ribbon"];
    const confetti: typeof this.confetti = [];

    for (let i = 0; i < 80; i++) {
      confetti.push({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      });
    }

    this.confetti = confetti;
  }

  private startOnboarding() {
    this.currentStep = 0;
    this.showWelcome = false;
    this.showCelebration = false;
    this.isAnimating = true;

    const firstStep = this.steps[0];
    setTimeout(() => {
      if (firstStep?.type === "welcome") {
        this.showWelcomeModal();
      } else if (firstStep?.type === "celebration") {
        this.showCelebrationModal();
      } else {
        this.updateTargetPosition();
        this.animateCursor();
      }
      this.isAnimating = false;
    }, 100);
  }

  private updateTargetPosition() {
    if (!this.active || this.steps.length === 0) return;

    const step = this.steps[this.currentStep];
    if (!step) return;

    const target = document.querySelector(step.target);
    if (!target) return;

    // Scroll target into view if needed
    const rect = target.getBoundingClientRect();
    const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;

    if (!isInView) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => this.updateTargetPosition(), 500);
      return;
    }

    this.targetRect = rect;
    this.calculateTooltipPosition(rect, step.position);
  }

  private calculateTooltipPosition(rect: DOMRect, preferredPosition?: string) {
    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 260; // Approximate including padding
    const gap = 32; // Gap between target and tooltip

    let x = 0;
    let y = 0;
    let side: "top" | "bottom" | "left" | "right" = "bottom";

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;

    // Determine best position - prioritize avoiding overlap
    if (preferredPosition && preferredPosition !== "auto") {
      side = preferredPosition as "top" | "bottom" | "left" | "right";
    } else {
      // Smart auto-position based on available space
      // If target is in top half, prefer bottom; if in bottom half, prefer top
      const targetCenterY = rect.top + rect.height / 2;
      const viewportCenterY = window.innerHeight / 2;

      if (targetCenterY < viewportCenterY) {
        // Target is in top half - prefer bottom
        if (spaceBelow >= tooltipHeight + gap) {
          side = "bottom";
        } else if (spaceLeft >= tooltipWidth + gap) {
          side = "left";
        } else if (spaceRight >= tooltipWidth + gap) {
          side = "right";
        } else {
          side = "bottom"; // Fallback
        }
      } else {
        // Target is in bottom half - prefer top
        if (spaceAbove >= tooltipHeight + gap) {
          side = "top";
        } else if (spaceLeft >= tooltipWidth + gap) {
          side = "left";
        } else if (spaceRight >= tooltipWidth + gap) {
          side = "right";
        } else {
          side = "top"; // Fallback
        }
      }
    }

    // Calculate position based on side - with smart alignment
    switch (side) {
      case "bottom":
        y = rect.bottom + gap;
        // Align tooltip to not overlap with target horizontally
        if (rect.right > window.innerWidth - tooltipWidth - padding) {
          // Target is on the right - align tooltip to the left
          x = rect.right - tooltipWidth;
        } else if (rect.left < tooltipWidth + padding) {
          // Target is on the left - align tooltip to the right
          x = rect.left;
        } else {
          // Center align
          x = rect.left + rect.width / 2 - tooltipWidth / 2;
        }
        break;
      case "top":
        y = rect.top - tooltipHeight;
        if (rect.right > window.innerWidth - tooltipWidth - padding) {
          x = rect.right - tooltipWidth;
        } else if (rect.left < tooltipWidth + padding) {
          x = rect.left;
        } else {
          x = rect.left + rect.width / 2 - tooltipWidth / 2;
        }
        break;
      case "right":
        x = rect.right + gap;
        y = rect.top + rect.height / 2 - tooltipHeight / 2;
        break;
      case "left": {
        // Tooltip right edge should be gap pixels away from target left edge
        const tooltipRightEdge = rect.left - gap * 2.5;
        x = tooltipRightEdge - tooltipWidth;
        // Vertically center the tooltip with the target
        y = rect.top + rect.height / 2 - tooltipHeight / 2 + gap;
        break;
      }
    }

    // Keep within viewport (but skip for "left" - we handle it separately)
    if (side !== "left") {
      x = Math.max(
        padding,
        Math.min(x, window.innerWidth - tooltipWidth - padding),
      );
    }
    y = Math.max(
      padding,
      Math.min(y, window.innerHeight - tooltipHeight - padding),
    );

    // For "left" position: check if there's enough space, otherwise reposition
    if (side === "left") {
      // If x is negative or tooltip would overlap target, not enough space on left
      if (x < padding || x + tooltipWidth + gap > rect.left) {
        // Fallback: position above the target, aligned to its right edge
        x = Math.max(padding, rect.right - tooltipWidth);
        y = rect.top - tooltipHeight - gap;
        side = "top";
        // If not enough space above, try below
        if (y < padding) {
          y = rect.bottom + gap;
          side = "bottom";
        }
      }
      // Ensure x is within viewport bounds
      x = Math.max(
        padding,
        Math.min(x, window.innerWidth - tooltipWidth - padding),
      );
    }

    this.tooltipPosition = { x, y };
    this.tooltipSide = side;
  }

  private animateCursor() {
    if (!this.targetRect || !this.steps[this.currentStep]?.requiresClick) {
      this.showCursor = false;
      return;
    }

    // Start cursor from bottom right corner
    this.cursorPosition = {
      x: window.innerWidth - 100,
      y: window.innerHeight - 100,
    };
    this.showCursor = true;
    this.cursorClicking = false;

    // Animate to target center
    setTimeout(() => {
      if (!this.targetRect) return;
      this.cursorPosition = {
        x: this.targetRect.left + this.targetRect.width / 2,
        y: this.targetRect.top + this.targetRect.height / 2,
      };

      // Show click animation
      setTimeout(() => {
        this.cursorClicking = true;
        setTimeout(() => {
          this.cursorClicking = false;
        }, 600);
      }, 700);
    }, 100);
  }

  private nextStep() {
    if (this.currentStep >= this.steps.length - 1) {
      this.complete();
      return;
    }

    const currentStepData = this.steps[this.currentStep];

    // If current step requires click, trigger the target element click first
    if (currentStepData?.requiresClick) {
      const target = document.querySelector(
        currentStepData.target,
      ) as HTMLElement;
      if (target) {
        target.click();
      }
    }

    this.isAnimating = true;
    this.showCursor = false;

    // Add delay to wait for any UI changes (like form opening)
    // Use 400ms for requiresClick steps to ensure form fully renders
    const nextStepDelay = currentStepData?.requiresClick ? 400 : 100;

    setTimeout(() => {
      this.currentStep++;
      this.isAnimating = false;
      // Use requestAnimationFrame to ensure DOM is ready before searching
      requestAnimationFrame(() => {
        // Retry finding target element with delay for dynamically rendered elements
        this.waitForTargetAndUpdate();
      });
    }, nextStepDelay);
  }

  private waitForTargetAndUpdate(retries = 15) {
    const step = this.steps[this.currentStep];
    if (!step) return;

    const target = document.querySelector(step.target) as HTMLElement;

    // Check if element exists AND is actually rendered (has dimensions)
    const isVisible =
      target && (target.offsetWidth > 0 || target.offsetHeight > 0);

    if (isVisible) {
      console.log(`[onboarding] Found target for step: ${step.id}`);
      this.updateTargetPosition();
      setTimeout(() => this.animateCursor(), 300);
    } else if (retries > 0) {
      // Retry after a short delay if target not found or not visible yet
      console.log(
        `[onboarding] Waiting for target: ${step.id}, selector: ${step.target}, retries left: ${retries}`,
      );
      setTimeout(() => this.waitForTargetAndUpdate(retries - 1), 100);
    } else {
      // Target not found after retries, skip to next step or complete
      console.warn(
        `[onboarding] Target not found for step: ${step.id}, selector: ${step.target}`,
      );
      if (this.currentStep < this.steps.length - 1) {
        this.currentStep++;
        this.waitForTargetAndUpdate();
      } else {
        this.complete();
      }
    }
  }

  private prevStep() {
    if (this.currentStep <= 0) return;

    const fromStep = this.steps[this.currentStep];
    const toStepIndex = this.currentStep - 1;
    const toStep = this.steps[toStepIndex];

    // Emit stepback event so parent can handle UI changes (like closing form)
    this.dispatchEvent(
      new CustomEvent("stepback", {
        detail: {
          fromStep: fromStep,
          toStep: toStep,
          fromIndex: this.currentStep,
          toIndex: toStepIndex,
        },
      }),
    );

    this.isAnimating = true;
    this.showCursor = false;

    // Give parent time to close form or make other UI changes
    setTimeout(() => {
      this.currentStep--;
      this.isAnimating = false;
      // Use waitForTargetAndUpdate to handle dynamically appearing elements
      requestAnimationFrame(() => {
        this.waitForTargetAndUpdate();
      });
    }, 300);
  }

  private canGoBack(): boolean {
    return this.currentStep > 0;
  }

  private complete() {
    localStorage.setItem(this.storageKey, "true");
    this.showWelcome = false;
    this.showCelebration = false;
    this.confetti = [];
    this.dispatchEvent(new CustomEvent("complete"));
    this.active = false;
  }

  private skip() {
    localStorage.setItem(this.storageKey, "skipped");
    this.showWelcome = false;
    this.showCelebration = false;
    this.confetti = [];
    this.dispatchEvent(new CustomEvent("skip"));
    this.active = false;
  }

  render() {
    if (!this.active || this.steps.length === 0) return nothing;

    const step = this.steps[this.currentStep];
    const progress = ((this.currentStep + 1) / this.steps.length) * 100;

    // Welcome modal for intro step
    if (step?.type === "welcome") {
      return html`
        <div class="welcome-overlay ${this.showWelcome ? "visible" : ""}">
          <div class="welcome-modal">
            <div class="welcome-step-indicator">
              <div class="step-dots">
                ${this.steps.map(
                  (_, i) => html`
                    <div
                      class="step-dot ${i === this.currentStep
                        ? "active"
                        : i < this.currentStep
                          ? "completed"
                          : ""}"
                    ></div>
                  `,
                )}
              </div>
            </div>
            <div class="welcome-emoji">${step.emoji || "👋"}</div>
            <h2 class="welcome-title">${step.title}</h2>
            <p class="welcome-description">${step.description}</p>
            <div class="welcome-actions">
              <button
                class="welcome-btn welcome-btn-primary"
                @click=${() => {
                  this.showWelcome = false;
                  this.nextStep();
                }}
              >
                ${step.action || "Bắt đầu hướng dẫn"}
              </button>
              <button class="welcome-btn welcome-btn-ghost" @click=${this.skip}>
                Bỏ qua hướng dẫn
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Celebration modal for final step
    if (step?.type === "celebration") {
      return html`
        <!-- Confetti -->
        <div class="confetti-container">
          ${this.confetti.map(
            (c) => html`
              <div
                class="confetti ${c.shape}"
                style="
                left: ${c.x}%;
                background: ${c.color};
                animation-delay: ${c.delay}s;
                animation-duration: ${c.duration}s;
              "
              ></div>
            `,
          )}
        </div>

        <!-- Celebration Modal -->
        <div
          class="celebration-overlay ${this.showCelebration ? "visible" : ""}"
        >
          <div class="celebration-modal">
            <!-- Sparkles -->
            <div
              class="sparkle"
              style="top: -20px; left: 20%; animation-delay: 0s;"
            ></div>
            <div
              class="sparkle"
              style="top: 10%; right: -15px; animation-delay: 0.3s;"
            ></div>
            <div
              class="sparkle"
              style="bottom: 20%; left: -10px; animation-delay: 0.6s;"
            ></div>
            <div
              class="sparkle"
              style="bottom: -15px; right: 30%; animation-delay: 0.9s;"
            ></div>

            <div class="celebration-emoji">🎉</div>
            <h2 class="celebration-title">${step.title}</h2>
            <p class="celebration-description">${step.description}</p>
            <button class="celebration-btn" @click=${this.complete}>
              ${step.action || "Bắt đầu sử dụng"}
            </button>
          </div>
        </div>
      `;
    }

    return html`
      <!-- Backdrop (blocks all clicks outside tooltip) -->
      <div class="onboarding-backdrop"></div>

      <!-- Spotlight (visual highlight only) -->
      ${this.targetRect
        ? html`
            <div
              class="spotlight"
              style="
                top: ${this.targetRect.top - 8}px;
                left: ${this.targetRect.left - 8}px;
                width: ${this.targetRect.width + 16}px;
                height: ${this.targetRect.height + 16}px;
              "
            ></div>
          `
        : nothing}

      <!-- Tooltip Card -->
      <div
        class="tooltip-card ${this.targetRect && !this.isAnimating
          ? "visible"
          : ""}"
        data-side="${this.tooltipSide}"
        style="top: ${this.tooltipPosition.y}px; left: ${this.tooltipPosition
          .x}px;"
      >
        <div class="tooltip-arrow"></div>

        <div class="tooltip-header">
          <div class="tooltip-step-indicator">
            <div class="step-dots">
              ${this.steps.map(
                (_, i) => html`
                  <div
                    class="step-dot ${i === this.currentStep
                      ? "active"
                      : i < this.currentStep
                        ? "completed"
                        : ""}"
                  ></div>
                `,
              )}
            </div>
            <span class="step-count"
              >Bước ${this.currentStep + 1}/${this.steps.length}</span
            >
          </div>
          <button class="tooltip-close" @click=${this.skip} title="Bỏ qua">
            <svg viewBox="0 0 24 24">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <h3 class="tooltip-title">${step?.title}</h3>
        <p class="tooltip-description">${step?.description}</p>

        <div class="tooltip-actions">
          ${this.canGoBack()
            ? html`
                <button
                  class="tooltip-btn tooltip-btn-back"
                  @click=${this.prevStep}
                >
                  <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
                </button>
              `
            : nothing}
          <button class="tooltip-btn tooltip-btn-ghost" @click=${this.skip}>
            Bỏ qua
          </button>
          <button
            class="tooltip-btn tooltip-btn-primary"
            @click=${this.nextStep}
          >
            ${this.currentStep === this.steps.length - 1
              ? "Hoàn thành"
              : step?.action || "Tiếp theo"}
          </button>
        </div>
      </div>

      <!-- Animated Cursor -->
      <div
        class="onboarding-cursor ${this.showCursor ? "visible" : ""} ${this
          .cursorClicking
          ? "clicking"
          : ""}"
        style="top: ${this.cursorPosition.y}px; left: ${this.cursorPosition
          .x}px;"
      >
        <div class="cursor-hand">
          <svg viewBox="0 0 24 24" fill="white" stroke="#333" stroke-width="1">
            <path
              d="M12 2 L2 18 L8 18 L12 22 L12 18 L22 18 Z"
              transform="rotate(-30 12 12)"
            />
          </svg>
          <div class="cursor-ring"></div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "operis-onboarding": OperisOnboarding;
  }
}
