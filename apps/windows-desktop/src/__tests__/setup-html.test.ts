/**
 * Tests for setup.html first-run page
 * Validates HTML structure and API references
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";

describe("setup.html", () => {
  let htmlContent: string;

  beforeAll(() => {
    const setupPath = path.join(__dirname, "..", "..", "resources", "setup.html");
    htmlContent = fs.readFileSync(setupPath, "utf-8");
  });

  it("should exist and be readable", () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent.length).toBeGreaterThan(0);
  });

  it("should contain required HTML structure", () => {
    expect(htmlContent).toContain("<!DOCTYPE html>");
    expect(htmlContent).toContain("<html");
    expect(htmlContent).toContain("<head>");
    expect(htmlContent).toContain("<body>");
  });

  it("should have a setup form with correct ID", () => {
    expect(htmlContent).toContain('id="setup-form"');
    expect(htmlContent).toContain('<form id="setup-form">');
  });

  it("should have Anthropic token input field", () => {
    expect(htmlContent).toContain('id="anthropic-token"');
    expect(htmlContent).toContain('type="password"');
    expect(htmlContent).toContain('placeholder="sk-ant-..."');
    expect(htmlContent).toContain("required");
  });

  it("should have optional Cloudflare token input field", () => {
    expect(htmlContent).toContain('id="cf-token"');
    expect(htmlContent).toContain('type="text"');
    expect(htmlContent).toContain('placeholder="eyJ..."');
  });

  it("should have a submit button", () => {
    expect(htmlContent).toContain('id="submit-btn"');
    expect(htmlContent).toContain('type="submit"');
    expect(htmlContent).toContain("Complete Setup");
  });

  it("should reference window.electronAPI.submitOnboard", () => {
    expect(htmlContent).toContain("window.electronAPI.submitOnboard");
    expect(htmlContent).toContain("electronAPI.submitOnboard(data)");
  });

  it("should reference window.electronAPI.onboardComplete", () => {
    expect(htmlContent).toContain("window.electronAPI.onboardComplete");
    expect(htmlContent).toContain("electronAPI.onboardComplete");
  });

  it("should have a status display element", () => {
    expect(htmlContent).toContain('id="status"');
    expect(htmlContent).toContain('<div class="status" id="status">');
  });

  it("should include error status styling", () => {
    expect(htmlContent).toContain(".status.error");
    expect(htmlContent).toContain("setStatus(\"error\"");
  });

  it("should include success status styling", () => {
    expect(htmlContent).toContain(".status.success");
    expect(htmlContent).toContain("setStatus(\"success\"");
  });

  it("should include loading status with spinner", () => {
    expect(htmlContent).toContain(".status.loading");
    expect(htmlContent).toContain("setStatus(\"loading\"");
    expect(htmlContent).toContain("spinner");
    expect(htmlContent).toContain("@keyframes spin");
  });

  it("should validate anthropic token is required before submit", () => {
    expect(htmlContent).toContain("if (!anthropicToken)");
    expect(htmlContent).toContain("Anthropic API token is required");
  });

  it("should disable submit button during submission", () => {
    expect(htmlContent).toContain("btn.disabled = true");
  });

  it("should handle submission timeout before reload", () => {
    expect(htmlContent).toContain("setTimeout");
    expect(htmlContent).toContain("1000");
  });

  it("should handle form submission with async/await", () => {
    expect(htmlContent).toContain("async (e) =>");
    expect(htmlContent).toContain("e.preventDefault()");
    expect(htmlContent).toContain("await window.electronAPI");
  });

  it("should have proper charset and viewport meta tags", () => {
    expect(htmlContent).toContain('charset="UTF-8"');
    expect(htmlContent).toContain('name="viewport"');
    expect(htmlContent).toContain("width=device-width");
  });

  it("should have a title", () => {
    expect(htmlContent).toContain("<title>");
    expect(htmlContent).toContain("Agent Operis - Setup");
  });

  it("should have styled form elements", () => {
    expect(htmlContent).toContain("setup-card");
    expect(htmlContent).toContain("field");
    expect(htmlContent).toContain("field-hint");
  });

  it("should include inline CSS styling", () => {
    expect(htmlContent).toContain("<style>");
    expect(htmlContent).toContain("</style>");
    expect(htmlContent).toContain("body");
    expect(htmlContent).toContain("button");
  });

  it("should include inline script", () => {
    expect(htmlContent).toContain("<script>");
    expect(htmlContent).toContain("</script>");
  });
});
