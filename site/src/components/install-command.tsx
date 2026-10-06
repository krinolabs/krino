import { CopyButton } from "./copy-button";

export const INSTALL_COMMAND = "npm i @krinolabs/krino";

export function InstallCommand() {
  return (
    <div className="border-hairline bg-surface flex items-center justify-between gap-3 rounded-lg border py-1.5 pr-1.5 pl-4">
      <code className="text-fg truncate font-mono text-sm">
        <span className="text-fg-4 select-none">$ </span>
        {INSTALL_COMMAND}
      </code>
      <CopyButton text={INSTALL_COMMAND} eventName="copy_install" />
    </div>
  );
}
