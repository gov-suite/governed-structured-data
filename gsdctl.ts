import docopt, {
  DocOptions,
} from "https://denopkg.com/Eyal-Shalev/docopt.js@v1.0.1/src/docopt.ts";
import * as mod from "./mod.ts";

const $VERSION = "v0.5.0";
const docoptSpec = `
Governed Structured Data Controller ${$VERSION}.

Usage:
  gsdctl json-to-ts <json-src> --type-import=<url> --type=<symbol> [--instance=<symbol>] [--gsd-import=<url>] [--verbose] [--validate]
  gsdctl -h | --help
  gsdctl --version

Options:
  <json-src>              JSON single local file name or glob (like "*.json" or "**/*.json")
  --type-import=<url>     The import where the primary TypeScript type definition is found
  --type=<symbol>         The TypeScript symbol that should be assigned the primary type
  --instance=<symbol>     The name of the TypeScript instance that should be assigned (default: "instance")
  --gsd-import=<url>      The import where the Governed Structured Data (GSD) library is found
  --verbose               Be explicit about what's going on
  -h --help               Show this screen
  --version               Show version
`;

export interface CommandHandler {
  (options: DocOptions): Promise<true | void>;
}

export function isDryRun(options: DocOptions): boolean {
  const { "--dry-run": dryRun } = options;
  return dryRun ? true : false;
}

export function isVerbose(options: DocOptions): boolean {
  const { "--verbose": verbose } = options;
  return verbose ? true : false;
}

export class CliJsonTyper extends mod.TypicalJsonTyper {
  constructor(
    {
      "--type-import": typeImportURL,
      "--type": typeName,
      "--instance": instanceName,
      "--gsd-import": govnDataImportURL,
    }: DocOptions,
  ) {
    super(mod.defaultTypicalJsonTyperOptions(
      typeImportURL!.toString(),
      typeName!.toString(),
      {
        instanceName: instanceName ? instanceName.toString() : undefined,
        govnDataImportURL: govnDataImportURL
          ? govnDataImportURL.toString()
          : undefined,
      },
    ));
  }
}

export async function jsonToTypeScript(
  options: DocOptions,
): Promise<true | void> {
  const {
    "json-to-ts": jsonToTypedData,
    "<json-src>": jsonSrcSpec,
    "--validate": validate,
  } = options;
  if (jsonToTypedData && jsonSrcSpec) {
    const verbose = isVerbose(options);
    const typer = new CliJsonTyper(options);
    const emitter = new mod.TypedDataFileSystemEmitter([typer]);
    emitter.emitTypedData({
      udSupplier: new mod.FileSystemGlobSupplier(
        jsonSrcSpec.toString(),
      ),
      onAfterEmit: (result: mod.StructuredDataTyperResult): void => {
        if (mod.isFileDestinationResult(result)) {
          if (verbose) {
            console.log(result.destFileName);
          }
          if (validate) {
            // deno-lint-ignore no-undef
            import(result.destFileName);
          }
        }
      },
    });
    return true;
  }
}

if (import.meta.main) {
  const handlers: CommandHandler[] = [
    jsonToTypeScript,
  ];
  try {
    const options = docopt(docoptSpec);
    let handled: true | void;
    for (const handler of handlers) {
      handled = await handler(options);
      if (handled) break;
    }
    if (!handled) {
      console.error("Unable to handle validly parsed docoptSpec:");
      console.dir(options);
    }
  } catch (e) {
    console.error(e.message);
  }
}
