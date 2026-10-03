// Entry point for `@krinolabs/krino/ai-sdk`. Imports `ai` (optional peer dependency),
// so it must never be re-exported from the root entry point.

export { AI_SDK_HOST_CAPABILITIES } from "./call-runs.js";
export { type GenerateTextOptions, type StreamTextOptions, withKrino } from "./with-krino.js";
