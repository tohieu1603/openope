/**
 * Unit tests for TrayManager
 * Tests tray initialization, status updates, icon mapping, menu structure,
 * quitting flag, and integration with main.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import type { BrowserWindow } from "electron";

// Mock Electron modules
vi.mock("electron", () => {
  // Track instances and calls
  const instances: any[] = [];
  const constructorCalls: any[] = [];

  // Create a class that can be instantiated with 'new'
  class MockTray {
    setToolTip = vi.fn();
    setImage = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
    destroy = vi.fn();

    constructor(iconPath: string) {
      constructorCalls.push([iconPath]);
      instances.push(this);
      (MockTray as any).instances = instances;
      (MockTray as any).mock = { calls: constructorCalls };
    }
  }

  // Store instances array and mock object on the class for testing
  (MockTray as any).instances = instances;
  (MockTray as any).mock = { calls: constructorCalls };

  return {
    Tray: MockTray,
    Menu: {
      buildFromTemplate: vi.fn(),
    },
    app: {
      isPackaged: false,
      resourcesPath: "/app/resources",
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
      setLoginItemSettings: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: {},
  };
});

import { TrayManager } from "../tray-manager";
import { Tray, Menu, app } from "electron";

describe("TrayManager", () => {
  let manager: TrayManager;
  let mockWindow: BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
    mockMenuBuildFromTemplate.mockReturnValue({});

    mockWindow = {
      isMinimized: vi.fn().mockReturnValue(false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
    } as any;

    manager = new TrayManager();
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
  });

  describe("Class structure", () => {
    it("should have init method", () => {
      expect(typeof manager.init).toBe("function");
    });

    it("should have updateGateway method", () => {
      expect(typeof manager.updateGateway).toBe("function");
    });

    it("should have updateTunnel method", () => {
      expect(typeof manager.updateTunnel).toBe("function");
    });

    it("should have setQuitting method", () => {
      expect(typeof manager.setQuitting).toBe("function");
    });

    it("should have isQuitting getter", () => {
      expect(typeof manager.isQuitting).toBe("boolean");
    });

    it("should have destroy method", () => {
      expect(typeof manager.destroy).toBe("function");
    });
  });

  describe("Initial state", () => {
    it("should have isQuitting = false on creation", () => {
      expect(manager.isQuitting).toBe(false);
    });
  });

  describe("setQuitting/isQuitting", () => {
    it("should set isQuitting flag to true", () => {
      expect(manager.isQuitting).toBe(false);
      manager.setQuitting();
      expect(manager.isQuitting).toBe(true);
    });
  });

  describe("ICON_MAP", () => {
    it("should map running status to tray-green.ico", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("running");

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setImage).toHaveBeenCalledWith(
        expect.stringContaining("tray-green.ico")
      );
    });

    it("should map starting status to tray-yellow.ico", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("starting");

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setImage).toHaveBeenCalledWith(
        expect.stringContaining("tray-yellow.ico")
      );
    });

    it("should map error status to tray-red.ico", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("error");

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setImage).toHaveBeenCalledWith(
        expect.stringContaining("tray-red.ico")
      );
    });

    it("should map stopped status to tray-gray.ico", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("stopped");

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setImage).toHaveBeenCalledWith(
        expect.stringContaining("tray-gray.ico")
      );
    });

    it("should use tray-gray.ico as default/initial icon", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const mockTrayFn = Tray as any;
      const calls = mockTrayFn.mock.calls;
      expect(calls.some((c: string[]) => c[0]?.includes("tray-gray.ico"))).toBe(true);
    });
  });

  describe("Tray icon files exist", () => {
    it("should have tray-green.ico in resources", () => {
      const iconPath = path.join(__dirname, "..", "..", "resources", "tray-green.ico");
      expect(fs.existsSync(iconPath)).toBe(true);
    });

    it("should have tray-yellow.ico in resources", () => {
      const iconPath = path.join(__dirname, "..", "..", "resources", "tray-yellow.ico");
      expect(fs.existsSync(iconPath)).toBe(true);
    });

    it("should have tray-red.ico in resources", () => {
      const iconPath = path.join(__dirname, "..", "..", "resources", "tray-red.ico");
      expect(fs.existsSync(iconPath)).toBe(true);
    });

    it("should have tray-gray.ico in resources", () => {
      const iconPath = path.join(__dirname, "..", "..", "resources", "tray-gray.ico");
      expect(fs.existsSync(iconPath)).toBe(true);
    });

    it("all 4 tray icons exist as files", () => {
      const icons = ["tray-green.ico", "tray-yellow.ico", "tray-red.ico", "tray-gray.ico"];
      const resourcesDir = path.join(__dirname, "..", "..", "resources");
      icons.forEach((icon) => {
        const iconPath = path.join(resourcesDir, icon);
        expect(fs.existsSync(iconPath) && fs.statSync(iconPath).isFile()).toBe(true);
      });
    });
  });

  describe("init()", () => {
    it("should create tray instance", () => {
      const mockTrayClass = Tray as any;
      const initialCount = mockTrayClass.instances?.length || 0;

      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      expect((mockTrayClass.instances?.length || 0) > initialCount).toBe(true);
    });

    it("should set tooltip on init", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setToolTip).toHaveBeenCalledWith(
        expect.stringContaining("Agent Operis")
      );
    });

    it("should register double-click handler", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      const onCalls = lastInstance?.on.mock.calls || [];
      expect(onCalls.some((c: any[]) => c[0] === "double-click")).toBe(true);
    });

    it("should build menu on init", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      expect(mockMenuBuildFromTemplate).toHaveBeenCalled();
    });
  });

  describe("updateGateway()", () => {
    it("should update icon on status change", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("running");

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setImage).toHaveBeenCalled();
    });

    it("should update tooltip with status", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("running");

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setToolTip).toHaveBeenCalledWith(expect.stringContaining("running"));
    });
  });

  describe("updateTunnel()", () => {
    it("should rebuild menu on tunnel status change", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      mockMenuBuildFromTemplate.mockClear();
      manager.updateTunnel("connected");

      expect(mockMenuBuildFromTemplate).toHaveBeenCalled();
    });

    it("should not update icon on tunnel status change", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const mockTrayClass = Tray as any;
      mockTrayClass.instances?.forEach((instance: any) => instance?.setImage?.mockClear?.());

      manager.updateTunnel("connected");

      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      expect(lastInstance?.setImage).not.toHaveBeenCalled();
    });
  });

  describe("Context menu structure", () => {
    it("should have Show Window menu item", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const menuTemplate = mockMenuBuildFromTemplate.mock.calls[0][0];
      const showItem = menuTemplate.find((item: any) => item.label === "Show Window");
      expect(showItem).toBeDefined();
      expect(showItem?.click).toBeDefined();
    });

    it("should have Gateway status label", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      manager.updateGateway("running");

      const lastCall = mockMenuBuildFromTemplate.mock.calls[mockMenuBuildFromTemplate.mock.calls.length - 1][0];
      const gatewayLabel = lastCall.find((item: any) => item.label?.includes("Gateway:"));
      expect(gatewayLabel).toBeDefined();
    });

    it("should have Quit menu item that sets isQuitting", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      const mockAppObj = app as any;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const menuTemplate = mockMenuBuildFromTemplate.mock.calls[0][0];
      const quit = menuTemplate.find((item: any) => item.label === "Quit");

      expect(manager.isQuitting).toBe(false);
      quit?.click?.();
      expect(manager.isQuitting).toBe(true);
      expect(mockAppObj.quit).toHaveBeenCalled();
    });

    it("should have all required menu items", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const menuTemplate = mockMenuBuildFromTemplate.mock.calls[0][0];
      const labels = menuTemplate.map((item: any) => item.label);

      expect(labels).toContain("Show Window");
      expect(labels).toContain("Restart Gateway");
      expect(labels).toContain("Reconnect Tunnel");
      expect(labels).toContain("Start on Login");
      expect(labels).toContain("Quit");
    });

    it("Start on Login should be a checkbox", () => {
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const menuTemplate = mockMenuBuildFromTemplate.mock.calls[0][0];
      const autoStart = menuTemplate.find((item: any) => item.label === "Start on Login");
      expect(autoStart?.type).toBe("checkbox");
    });

    it("Show Window should restore minimized window", () => {
      mockWindow.isMinimized = vi.fn().mockReturnValue(true);
      const mockMenuBuildFromTemplate = (Menu as any).buildFromTemplate;
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const menuTemplate = mockMenuBuildFromTemplate.mock.calls[0][0];
      const showWindow = menuTemplate.find((item: any) => item.label === "Show Window");
      showWindow?.click?.();

      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.show).toHaveBeenCalled();
    });
  });

  describe("destroy()", () => {
    it("should call tray.destroy() if initialized", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];

      manager.destroy();
      expect(lastInstance?.destroy).toHaveBeenCalled();
    });

    it("should be safe to call destroy without init", () => {
      expect(() => manager.destroy()).not.toThrow();
    });

    it("should be safe to call destroy multiple times", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      expect(() => {
        manager.destroy();
        manager.destroy();
      }).not.toThrow();
    });
  });

  describe("Double-click handler", () => {
    it("should show window on tray double-click", () => {
      manager.init(mockWindow, {
        onRestartGateway: vi.fn(),
        onOpenLogs: vi.fn(),
        onRestartTunnel: vi.fn(),
      });

      const mockTrayClass = Tray as any;
      const lastInstance = mockTrayClass.instances?.[mockTrayClass.instances.length - 1];
      const doubleClickCall = lastInstance?.on.mock.calls.find((c: any) => c[0] === "double-click");

      doubleClickCall?.[1]?.();
      expect(mockWindow.show).toHaveBeenCalled();
    });
  });
});
