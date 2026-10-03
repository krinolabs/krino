import nodePath from "node:path";
import { KRINO_CONFIG_DEFAULTS } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import {
  buildKrinoConfigFile,
  detectHosts,
  KRINO_CONFIG_DESCRIPTION,
  parseKrinoConfigFile,
  projectNameFrom,
  resolveConfiguredTraceDirectory,
} from "./init-config.js";

describe("detectHosts", () => {
  it("finds the AI SDK in dependencies", () => {
    expect(detectHosts({ dependencies: { ai: "^7.0.111" } })).toEqual(["ai-sdk"]);
  });

  it("finds the Claude Agent SDK in devDependencies", () => {
    expect(
      detectHosts({ devDependencies: { "@anthropic-ai/claude-agent-sdk": "0.3.286" } }),
    ).toEqual(["claude-agent-sdk"]);
  });

  it("finds a host in peerDependencies", () => {
    expect(detectHosts({ peerDependencies: { ai: ">=7.0.111 <8" } })).toEqual(["ai-sdk"]);
  });

  it("finds both hosts, AI SDK first", () => {
    expect(
      detectHosts({
        devDependencies: { "@anthropic-ai/claude-agent-sdk": "0.3.286" },
        dependencies: { ai: "7.0.126" },
      }),
    ).toEqual(["ai-sdk", "claude-agent-sdk"]);
  });

  it("finds nothing without a host dependency", () => {
    expect(detectHosts({ dependencies: { zod: "4.6.5" } })).toEqual([]);
  });

  it("ignores manifests and sections that are not plain objects", () => {
    expect(detectHosts(null)).toEqual([]);
    expect(detectHosts(["ai"])).toEqual([]);
    expect(detectHosts("ai")).toEqual([]);
    expect(detectHosts({ dependencies: ["ai"] })).toEqual([]);
    expect(detectHosts({ dependencies: "ai" })).toEqual([]);
    expect(detectHosts({ dependencies: null })).toEqual([]);
  });

  it("reads only own keys, so prototype-named keys never match", () => {
    const manifest: unknown = JSON.parse(
      '{"dependencies":{"__proto__":{"ai":"1"},"constructor":"1","toString":"1"},' +
        '"__proto__":{"devDependencies":{"ai":"1"}}}',
    );
    expect(detectHosts(manifest)).toEqual([]);
  });
});

describe("projectNameFrom", () => {
  it("uses the package name", () => {
    expect(projectNameFrom({ name: "@acme/shop" }, "folder")).toBe("@acme/shop");
  });

  it("falls back to the folder name when the package name is missing, blank or not a string", () => {
    expect(projectNameFrom({}, "my shop")).toBe("my shop");
    expect(projectNameFrom({ name: "  " }, "my shop")).toBe("my shop");
    expect(projectNameFrom({ name: 42 }, "my shop")).toBe("my shop");
    expect(projectNameFrom(null, "my shop")).toBe("my shop");
  });

  it("does not read a prototype-named name", () => {
    expect(projectNameFrom(JSON.parse('{"__proto__":{"name":"evil"}}'), "folder")).toBe("folder");
  });
});

describe("buildKrinoConfigFile", () => {
  it("sets every decision kind to shadow and says the file is CLI-only", () => {
    const configFile = buildKrinoConfigFile({ projectName: "shop", traceDirectory: null });
    expect(configFile.description).toBe(KRINO_CONFIG_DESCRIPTION);
    expect(configFile.description).toContain("CLI");
    expect(Object.keys(configFile.decisionModes).sort()).toEqual(
      Object.keys(KRINO_CONFIG_DEFAULTS.decisionModes).sort(),
    );
    expect(Object.values(configFile.decisionModes).every((mode) => mode === "shadow")).toBe(true);
  });

  it("omits traceDirectory by default", () => {
    const configFile = buildKrinoConfigFile({ projectName: "shop", traceDirectory: null });
    expect(Object.hasOwn(configFile, "traceDirectory")).toBe(false);
    expect(Object.keys(configFile)).toEqual(["description", "projectName", "decisionModes"]);
  });

  it("stores --trace-dir as typed", () => {
    const configFile = buildKrinoConfigFile({
      projectName: "shop",
      traceDirectory: "..\\shared traces",
    });
    expect(configFile.traceDirectory).toBe("..\\shared traces");
    expect(Object.keys(configFile)).toEqual([
      "description",
      "projectName",
      "traceDirectory",
      "decisionModes",
    ]);
  });
});

describe("parseKrinoConfigFile", () => {
  it("reads the project name and the trace directory", () => {
    const configText = JSON.stringify(
      buildKrinoConfigFile({ projectName: "shop", traceDirectory: "traces" }),
    );
    expect(parseKrinoConfigFile(configText)).toEqual({
      parseKind: "valid",
      projectName: "shop",
      traceDirectory: "traces",
    });
  });

  it("reads a config without a trace directory", () => {
    const configText = JSON.stringify(
      buildKrinoConfigFile({ projectName: "shop", traceDirectory: null }),
    );
    expect(parseKrinoConfigFile(configText)).toEqual({
      parseKind: "valid",
      projectName: "shop",
      traceDirectory: null,
    });
  });

  it("accepts a UTF-8 byte order mark", () => {
    expect(parseKrinoConfigFile('\uFEFF{"projectName":"shop"}').parseKind).toBe("valid");
  });

  it.each([
    ["invalid JSON", "{"],
    ["an array", "[]"],
    ["a missing projectName", "{}"],
    ["a blank projectName", '{"projectName":" "}'],
    ["a non-string traceDirectory", '{"projectName":"shop","traceDirectory":3}'],
    ["a blank traceDirectory", '{"projectName":"shop","traceDirectory":""}'],
    ["a prototype-only projectName", '{"__proto__":{"projectName":"shop"}}'],
  ])("rejects %s", (_caseName, configText) => {
    expect(parseKrinoConfigFile(configText).parseKind).toBe("invalid");
  });
});

describe("resolveConfiguredTraceDirectory", () => {
  it("resolves a relative path from the config file's folder (Windows)", () => {
    expect(
      resolveConfiguredTraceDirectory("C:\\Projects\\my shop", "traces\\local", nodePath.win32),
    ).toBe("C:\\Projects\\my shop\\traces\\local");
    expect(
      resolveConfiguredTraceDirectory("C:\\Projects\\my shop", "../shared traces", nodePath.win32),
    ).toBe("C:\\Projects\\shared traces");
  });

  it("keeps an absolute path (Windows)", () => {
    expect(
      resolveConfiguredTraceDirectory("C:\\Projects\\shop", "D:\\krino\\traces", nodePath.win32),
    ).toBe("D:\\krino\\traces");
  });

  it("resolves a relative path from the config file's folder (POSIX)", () => {
    expect(resolveConfiguredTraceDirectory("/home/dev/shop", "./traces", nodePath.posix)).toBe(
      "/home/dev/shop/traces",
    );
    expect(resolveConfiguredTraceDirectory("/home/dev/shop", "/var/krino", nodePath.posix)).toBe(
      "/var/krino",
    );
  });
});
