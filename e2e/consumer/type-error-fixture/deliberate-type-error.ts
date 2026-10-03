import { createKrino } from "@krinolabs/krino";

// A deliberate type error in the consumer's own code. The e2e test checks that the library-check
// pass, which ignores third-party declaration errors, still fails on this one.

export const krinoRuntime = createKrino({
  // Wrong on purpose: projectName must be a string.
  projectName: 42,
  decisionModes: {},
});
