import { docopt, versionHelper as vh } from "./deps.ts";
export { docopt } from "./deps.ts";

export interface CommandHandlerContext {
  readonly calledFromMetaURL: string;
  readonly cliOptions: docopt.DocOptions;
  readonly isDryRun: boolean;
  readonly isVerbose: boolean;
  readonly shouldOverwrite: boolean;
}

export interface CommandHandler<T extends CommandHandlerContext> {
  (ctx: T): Promise<true | void>;
}

export class TypicalCommandHandlerContext implements CommandHandlerContext {
  constructor(
    readonly calledFromMetaURL: string,
    readonly cliOptions: docopt.DocOptions,
  ) {
  }

  get isDryRun(): boolean {
    const { "--dry-run": dryRun } = this.cliOptions;
    return dryRun ? true : false;
  }

  get isVerbose(): boolean {
    const { "--verbose": verbose } = this.cliOptions;
    return verbose ? true : false;
  }

  get shouldOverwrite(): boolean {
    const { "--overwrite": overwrite } = this.cliOptions;
    return overwrite ? true : false;
  }
}

export async function versionHandler(
  ctx: CommandHandlerContext,
): Promise<true | void> {
  const { "--version": version } = ctx.cliOptions;
  if (version) {
    console.log(
      await vh.determineVersionFromRepoTag(
        ctx.calledFromMetaURL,
        { repoIdentity: "gov-suite/governed-structured-data" },
      ),
    );
    return true;
  }
}

export const commonHandlers = [versionHandler];

export async function CLI<T extends CommandHandlerContext>(
  docoptSpec: string,
  handlers: CommandHandler<T>[],
  prepareContext: (options: docopt.DocOptions) => T,
): Promise<void> {
  try {
    const options = docopt.default(docoptSpec);
    const context = prepareContext(options);
    let handled: true | void;
    for (const handler of handlers) {
      handled = await handler(context);
      if (handled) break;
    }
    if (!handled) {
      for (const handler of commonHandlers) {
        handled = await handler(context);
        if (handled) break;
      }
    }
    if (!handled) {
      console.error("Unable to handle validly parsed docoptSpec:");
      console.dir(options);
    }
  } catch (e) {
    console.error(e.message);
  }
}
