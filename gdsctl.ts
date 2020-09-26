import docopt, {
  DocOptions,
} from "https://denopkg.com/Eyal-Shalev/docopt.js@v1.0.1/src/docopt.ts";
import * as mod from "./mod.ts";

const $VERSION = "v0.5.0";
const docoptSpec = `
Governed Structured Data Controller ${$VERSION}.

Usage:
  gsdctl json-to-ts <json-src> --type-import=<url> --type=<symbol> [--instance=<symbol>] [--gsd-import=<url>] [--verbose]
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

export class CliJsonTyper extends mod.JsonTyper {
  readonly govnDataImportURL: string;
  readonly typeImportURL: string;
  readonly typeName: string;
  readonly instanceName: string;

  constructor(options: DocOptions) {
    super();
    const {
      "--gsd-import": govnDataImportURL,
      "--type-import": typeImportURL,
      "--type": typeName,
      "--instance": instanceName,
    } = options;
    this.govnDataImportURL = govnDataImportURL?.toString() ||
      "https://denopkg.com/gov-suite/governed-structured-data@{$VERSION}/mod.ts";
    this.typeImportURL = typeImportURL?.toString() ||
      "https://denopkg.com/shah/ts-lhncbc-lforms/mod.ts";
    this.typeName = typeName?.toString() || "mod.default";
    this.instanceName = instanceName?.toString() || "instance";
  }

  typeData(ctx: mod.StructuredDataTyperContext): mod.JsonTyperTextResult {
    let textResult;
    if (mod.isJsonTyperContext(ctx)) {
      if (mod.isFileContext(ctx.jseCtx)) {
        textResult = `
        // Generated from ${ctx.jseCtx.fileName}. DO NOT EDIT.
  
        import * as govnData from "${this.govnDataImportURL}";
        import * as mod from "${this.typeImportURL}";
    
        export const ${this.instanceName}: ${this.instanceName} = ${
          this.stringifyJSON(ctx)
        };
    
        export default ${this.instanceName};
    
        if (import.meta.main) {
          new govnData.CliArgsEmitter(import.meta.url).emitJSON(form);
        }`;
      } else {
        textResult = "ctx.jseCtx is expected to be a FileContext instance.";
      }
    } else {
      textResult = "ctx is expected to be a JsonTyperContext instance.";
    }
    return {
      isStructuredDataTyperResult: true,
      isJsonTyperTextResult: true,
      udseCtx: ctx.udseCtx,
      text: textResult,
    };
  }
}

export async function jsonToTypeScript(
  options: DocOptions,
): Promise<true | void> {
  const {
    "json-to-ts": jsonToTypedData,
    "<json-src>": lhcFormJsonSrcSpec,
  } = options;
  if (jsonToTypedData && lhcFormJsonSrcSpec) {
    const verbose = isVerbose(options);
    const supplier = new mod.FileSystemGlobSupplier(
      lhcFormJsonSrcSpec.toString(),
    );
    const typer = new CliJsonTyper(options);
    const emitter = new mod.TypedDataFileSystemEmitter<mod.JsonTyperTextResult>(
      [typer],
      (result: mod.StructuredDataTyperResult): string => {
        if (mod.isFileContext(result.udseCtx)) {
          return result.udseCtx.forceExtension(".auto.json");
        } else {
          console.error(
            "result.udseCtx is expected to be a FileContext instance.",
          );
          return "ERROR.auto.json";
        }
      },
    );
    supplier.forEach({
      onEntry: (udseCtx: mod.UntypedDataSupplierEntryContext): void => {
      },
    });
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
