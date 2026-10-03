import { describe, expect, it } from "vitest";
import { readInstalledVersion, readSdkVersions } from "./installed-versions.js";

describe("readSdkVersions", () => {
  it("reads every version from the installed packages", () => {
    const sdkVersions = readSdkVersions();
    expect(sdkVersions.ai).toBe("7.0.126");
    for (const [packageName, version] of Object.entries(sdkVersions)) {
      expect(version, packageName).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it("says unknown for a package that is not installed", () => {
    expect(readInstalledVersion("@krinolabs/not-a-package")).toBe("unknown");
  });
});
