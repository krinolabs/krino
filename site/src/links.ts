/** Every outbound link the site uses. Tests pin these values. */
export const LINKS = {
  github: "https://github.com/krinolabs/krino",
  npm: "https://www.npmjs.com/package/@krinolabs/krino",
  portfolio: "https://sush.dev",
} as const;

export type OutboundLinkName = keyof typeof LINKS;
