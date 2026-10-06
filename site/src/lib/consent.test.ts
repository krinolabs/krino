import { describe, expect, it } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  consentBootstrapScript,
  parseStoredConsent,
  resolveMeasurementId,
} from "./consent";

describe("parseStoredConsent", () => {
  it.each(["granted", "denied"] as const)("keeps %s", (storedValue) => {
    expect(parseStoredConsent(storedValue)).toBe(storedValue);
  });

  it.each([
    null,
    undefined,
    "",
    "yes",
    "GRANTED",
    " granted",
    "constructor",
    "__proto__",
    "toString",
  ])("treats %j as no choice yet", (storedValue) => {
    expect(parseStoredConsent(storedValue)).toBe("unset");
  });
});

describe("resolveMeasurementId", () => {
  it("returns the id on production", () => {
    expect(resolveMeasurementId("G-ABC123XYZ", "production")).toBe("G-ABC123XYZ");
    expect(resolveMeasurementId("  G-ABC123XYZ \n", "production")).toBe("G-ABC123XYZ");
  });

  it.each(["preview", "development", undefined])("returns nothing on %j", (vercelEnvironment) => {
    expect(resolveMeasurementId("G-ABC123XYZ", vercelEnvironment)).toBeUndefined();
  });

  it.each([undefined, "", "UA-12345-1", "G-abc123", "G-ABC');alert(1);//", "G-AB"])(
    "drops the malformed id %j",
    (configuredMeasurementId) => {
      expect(resolveMeasurementId(configuredMeasurementId, "production")).toBeUndefined();
    },
  );
});

describe("consentBootstrapScript", () => {
  const bootstrapScript = consentBootstrapScript("G-ABC123XYZ");

  it("denies every storage type by default, before configuring GA", () => {
    const consentDefaultIndex = bootstrapScript.indexOf("gtag('consent','default'");
    expect(consentDefaultIndex).toBeGreaterThan(-1);
    for (const storageType of [
      "analytics_storage",
      "ad_storage",
      "ad_user_data",
      "ad_personalization",
    ]) {
      expect(bootstrapScript).toContain(`${storageType}:'denied'`);
    }
    expect(bootstrapScript.indexOf("gtag('config'")).toBeGreaterThan(consentDefaultIndex);
  });

  it("grants analytics storage only from a stored Accept", () => {
    expect(bootstrapScript).toContain(
      `localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)})==='granted'`,
    );
    expect(bootstrapScript).toContain("gtag('config',\"G-ABC123XYZ\")");
  });
});
