import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { projectFolderName, resolveTraceDirectory } from "./trace-directory.js";

const windowsDefaults = {
  projectName: "billing-agent",
  environment: {},
  homeDirectory: "C:\\Users\\Ada",
  workingDirectory: "C:\\work\\app",
  pathModule: nodePath.win32,
};

const posixDefaults = {
  projectName: "billing-agent",
  environment: {},
  homeDirectory: "/home/ada",
  workingDirectory: "/work/app",
  pathModule: nodePath.posix,
};

describe("resolveTraceDirectory with Windows paths (path.win32)", () => {
  it("uses KRINO_TRACE_DIRECTORY as given, without a project folder", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      environment: {
        KRINO_TRACE_DIRECTORY: "D:\\krino\\traces",
        XDG_STATE_HOME: "C:\\Users\\Ada\\state",
      },
    });
    expect(traceDirectory).toBe("D:\\krino\\traces");
  });

  it("normalizes forward slashes in KRINO_TRACE_DIRECTORY", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      environment: { KRINO_TRACE_DIRECTORY: "D:/krino/traces/" },
    });
    expect(traceDirectory).toBe("D:\\krino\\traces");
  });

  it("resolves a relative KRINO_TRACE_DIRECTORY against the working directory", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      environment: { KRINO_TRACE_DIRECTORY: ".krino\\traces" },
    });
    expect(traceDirectory).toBe("C:\\work\\app\\.krino\\traces");
  });

  it("keeps UNC paths", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      environment: { KRINO_TRACE_DIRECTORY: "\\\\fileserver\\share\\krino" },
    });
    expect(traceDirectory).toBe("\\\\fileserver\\share\\krino");
  });

  it("uses XDG_STATE_HOME/krino/traces/<project> when KRINO_TRACE_DIRECTORY is not set", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      environment: { XDG_STATE_HOME: "C:\\Users\\Ada\\AppData\\Local\\state" },
    });
    expect(traceDirectory).toBe(
      "C:\\Users\\Ada\\AppData\\Local\\state\\krino\\traces\\billing-agent",
    );
  });

  it("falls back to <home>\\.krino\\traces\\<project>", () => {
    expect(resolveTraceDirectory(windowsDefaults)).toBe(
      "C:\\Users\\Ada\\.krino\\traces\\billing-agent",
    );
  });

  it("makes project names with Windows-forbidden characters safe", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      projectName: 'team/billing:agent<v2>|"x"?*',
    });
    expect(traceDirectory).toBe("C:\\Users\\Ada\\.krino\\traces\\team-billing-agent-v2---x---");
  });

  it("an explicit traceDirectory wins over every environment variable", () => {
    const traceDirectory = resolveTraceDirectory({
      ...windowsDefaults,
      traceDirectory: "E:\\explicit",
      environment: { KRINO_TRACE_DIRECTORY: "D:\\env", XDG_STATE_HOME: "C:\\state" },
    });
    expect(traceDirectory).toBe("E:\\explicit");
  });
});

describe("resolveTraceDirectory with POSIX paths (path.posix)", () => {
  it("uses KRINO_TRACE_DIRECTORY first", () => {
    const traceDirectory = resolveTraceDirectory({
      ...posixDefaults,
      environment: { KRINO_TRACE_DIRECTORY: "/var/krino", XDG_STATE_HOME: "/home/ada/.state" },
    });
    expect(traceDirectory).toBe("/var/krino");
  });

  it("uses XDG_STATE_HOME/krino/traces/<project> next", () => {
    const traceDirectory = resolveTraceDirectory({
      ...posixDefaults,
      environment: { XDG_STATE_HOME: "/home/ada/.local/state" },
    });
    expect(traceDirectory).toBe("/home/ada/.local/state/krino/traces/billing-agent");
  });

  it("ignores a relative XDG_STATE_HOME, as the XDG spec requires", () => {
    const traceDirectory = resolveTraceDirectory({
      ...posixDefaults,
      environment: { XDG_STATE_HOME: "relative/state" },
    });
    expect(traceDirectory).toBe("/home/ada/.krino/traces/billing-agent");
  });

  it("treats empty or blank variables as not set", () => {
    const traceDirectory = resolveTraceDirectory({
      ...posixDefaults,
      environment: { KRINO_TRACE_DIRECTORY: "", XDG_STATE_HOME: "   " },
    });
    expect(traceDirectory).toBe("/home/ada/.krino/traces/billing-agent");
  });

  it("falls back to ~/.krino/traces/<project>", () => {
    expect(resolveTraceDirectory(posixDefaults)).toBe("/home/ada/.krino/traces/billing-agent");
  });

  it("a project name cannot escape the traces folder", () => {
    expect(resolveTraceDirectory({ ...posixDefaults, projectName: "../../etc" })).toBe(
      "/home/ada/.krino/traces/..-..-etc",
    );
  });
});

describe("projectFolderName", () => {
  it.each([
    ["billing-agent", "billing-agent"],
    ["  spaced name  ", "spaced name"],
    ["a\\b/c", "a-b-c"],
    ["tab\there", "tab-here"],
    ["trailing dots...", "trailing dots"],
    [".", "unnamed-project"],
    ["..", "unnamed-project"],
    ["CON", "CON-project"],
    ["nul.txt", "nul.txt-project"],
    ["lpt1", "lpt1-project"],
    ["console", "console"],
    ["プロジェクト", "プロジェクト"],
  ])("%j becomes %j", (projectName, folderName) => {
    expect(projectFolderName(projectName)).toBe(folderName);
  });
});
