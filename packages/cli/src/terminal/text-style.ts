/** What decides whether the CLI may print colors. */
export type ColorSupportInputs = {
  environment: Readonly<Record<string, string | undefined>>;
  /** `process.stdout.isTTY`; `undefined` when stdout is a pipe or a file. */
  isTerminal: boolean | undefined;
};

/** No color when `NO_COLOR` is set to anything non-empty (no-color.org) or stdout is not a terminal. */
export function supportsColor({ environment, isTerminal }: ColorSupportInputs): boolean {
  const noColor = environment.NO_COLOR;
  if (noColor !== undefined && noColor !== "") {
    return false;
  }
  return isTerminal === true;
}

export type TextStyle = {
  bold: (text: string) => string;
  dim: (text: string) => string;
  accent: (text: string) => string;
  warning: (text: string) => string;
};

const ESCAPE = "\u001b[";

function ansi(openCode: number, closeCode: number): (text: string) => string {
  return (text) => `${ESCAPE}${openCode}m${text}${ESCAPE}${closeCode}m`;
}

const COLOR_STYLE: TextStyle = {
  bold: ansi(1, 22),
  dim: ansi(2, 22),
  accent: ansi(36, 39),
  warning: ansi(33, 39),
};

const keepText = (text: string): string => text;

export const PLAIN_STYLE: TextStyle = {
  bold: keepText,
  dim: keepText,
  accent: keepText,
  warning: keepText,
};

export function createTextStyle(useColor: boolean): TextStyle {
  return useColor ? COLOR_STYLE : PLAIN_STYLE;
}
