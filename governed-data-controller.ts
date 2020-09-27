import * as cli from "./cli.ts";
import { docopt, fs, path } from "./deps.ts";
import * as uds from "./untyped-data-supplier.ts";
import * as udt from "./untyped-data-typer.ts";

export const $GDCTL_VERSION = cli.determineVersion(import.meta.url);

// NOTE: If any changes are made to gdCtlDocoptSpec be sure to make the same changes
//       to the subset of commands allowed in `gdctl.ts`.docoptSpec.
export const gdCtlDocoptSpec = `
Governed Data Controller (GDC) ${$GDCTL_VERSION}. 

The GDC is designed to be "built into" each TypeScript file that is defined as "governed structured data" (a fancy
way of saying that data is strongly typed). The GDC can take an appropriately governed TypeScript and generate JSON 
plus do many other common data tasks such as validation and re-typing.

Usage:
  gdctl inspect
  gdctl json emit [<emit-dest>]
  gdctl json sync [--dry-run] [--overwrite]
  gdctl json type <json-src> --type-import=<url> --type=<symbol> [--dry-run] [--validate] [--overwrite] [--instance=<symbol>] [--gsd-import=<url>] [--verbose]
  gdctl -h | --help
  gdctl --version

Options:
  <emit-dest>             The name of the file to emit, if it's just ".json" use same name as active file but force extension
  <json-src>              JSON single local file name or glob (like "*.json" or "**/*.json")
  --validate              Validate what's emitted
  --overwrite             If the file already exists, it's OK to replace it
  --type-import=<url>     The import where the primary TypeScript type definition is found
  --type=<symbol>         The TypeScript symbol that should be assigned the primary type
  --instance=<symbol>     The name of the TypeScript instance that should be assigned (default: "instance")
  --gsd-import=<url>      The import where the Governed Structured Data (GSD) library is found
  --dry-run               Don't perform any actions but be verbose on what might be done
  --verbose               Be explicit about what's going on (automatically turned on if using --dry-run)
  -h --help               Show this screen
  --version               Show version
`;

export const jsonStringifyIndentDefault = 2;

export function forceExtension(forceExtn: string, fileName: string): string {
  const fileUrlPrefix = "file://";
  if (fileName.startsWith(fileUrlPrefix)) {
    fileName = fileName.substr(fileUrlPrefix.length);
  }
  const extn = path.extname(fileName);
  if (extn && extn.length > 0) {
    return fileName.substr(0, fileName.length - extn.length) +
      forceExtn;
  }
  return fileName + forceExtn;
}

export interface EmittableContent {
  (): unknown;
}

export interface JsonPreparer {
  prepareJSON: (content: unknown | EmittableContent) => unknown;
}

export interface JsonStringifier {
  stringifyJSON: (content: unknown | EmittableContent) => string;
}

export class TypicalJsonPreparer implements JsonPreparer {
  static readonly singleton = new TypicalJsonPreparer();

  prepareJSON(content: unknown | EmittableContent): unknown {
    return typeof content === "function" ? content() : content;
  }
}

export class TypicalJsonStringifier implements JsonStringifier {
  static readonly singleton = new TypicalJsonStringifier();

  constructor(readonly jp: JsonPreparer = TypicalJsonPreparer.singleton) {
  }

  stringifyJSON(content: unknown | EmittableContent): string {
    const data = this.jp.prepareJSON(content);
    return typeof data === "string"
      ? data
      : JSON.stringify(data, null, jsonStringifyIndentDefault);
  }
}

export interface JsonEmitter {
  emitJSON: (content: unknown | EmittableContent) => unknown;
}

export class StdOutEmitter implements JsonEmitter {
  static readonly singleton = new StdOutEmitter();

  constructor(
    readonly js: JsonStringifier = TypicalJsonStringifier.singleton,
  ) {}

  emitJSON(content: unknown | EmittableContent): void {
    console.log(this.js.stringifyJSON(content));
  }
}

export class TextEmitter implements JsonEmitter {
  static readonly singleton = new TextEmitter();

  constructor(
    readonly js: JsonStringifier = TypicalJsonStringifier.singleton,
  ) {}

  emitJSON(content: unknown | EmittableContent): string {
    return this.js.stringifyJSON(content);
  }
}

export class FileSystemEmitter implements JsonEmitter {
  constructor(
    readonly destFileName: string | ((fse: FileSystemEmitter) => string),
    readonly js: JsonStringifier = TypicalJsonStringifier.singleton,
  ) {
  }

  emitJSON(content: unknown | EmittableContent): string {
    const jsonText = this.js.stringifyJSON(content);
    const writeFileDest = typeof this.destFileName === "function"
      ? this.destFileName(this)
      : this.destFileName;
    Deno.writeFileSync(
      writeFileDest,
      new TextEncoder().encode(jsonText),
    );
    return writeFileDest;
  }
}

export interface TypicalControllerOptions {
  readonly dataInstance: unknown;
  readonly retype?: udt.JsonRetyper;
  readonly inspectInstance: () => unknown;
  readonly destFileName?: (given: string) => string;
  readonly defaultJsonExtn: string;
}

export function defaultTypicalControllerOptions(
  dataInstance: unknown,
  override?: Partial<TypicalControllerOptions>,
): TypicalControllerOptions {
  const retypeInspector = override?.retype
    ? ((): unknown => {
      return override.retype;
    })
    : undefined;
  return {
    dataInstance: dataInstance,
    inspectInstance: override?.inspectInstance || retypeInspector ||
      ((): string => {
        return "[GSDC-00-100] No inspection content available.";
      }),
    defaultJsonExtn: override?.defaultJsonExtn || ".auto.json",
  };
}

export class TypicalController {
  constructor(
    readonly fromSrcModuleURL: string,
    readonly options: TypicalControllerOptions,
  ) {
  }

  jsonEmit(emitDest?: string): string | void {
    if (!emitDest) {
      StdOutEmitter.singleton.emitJSON(this.options.dataInstance);
      return;
    }

    if (emitDest == ".json") {
      return new FileSystemEmitter(
        forceExtension(this.options.defaultJsonExtn, this.fromSrcModuleURL),
      ).emitJSON(this.options.dataInstance);
    }

    return new FileSystemEmitter(emitDest).emitJSON(this.options.dataInstance);
  }

  jsonType(
    { verbose, jsonSrcSpec, typer, validate, dryRun, overwrite }: {
      jsonSrcSpec: string;
      typer: udt.JsonTyper;
      verbose?: boolean;
      validate?: boolean;
      overwrite?: boolean;
      dryRun?: boolean;
    },
  ): void {
    const emitter = new udt.TypedDataFileSystemEmitter([typer]);
    emitter.emitTypedData({
      udSupplier: new uds.FileSystemGlobSupplier(jsonSrcSpec),
      shouldEmit: (result: udt.StructuredDataTyperResult): boolean => {
        if (udt.isFileDestinationResult(result)) {
          if (fs.existsSync(result.destFileName)) {
            if (!overwrite) {
              console.warn(
                `[GSDC-01-000] ${
                  result.destFileNameRel(Deno.cwd())
                } exists, overwrite not requested, not replacing`,
              );
              return false;
            } else {
              if (verbose) {
                console.log(
                  `Overwriting: ${result.destFileNameRel(Deno.cwd())}`,
                );
              }
            }
          }
        }

        if (dryRun) {
          if (udt.isFileDestinationResult(result)) {
            console.log(result.destFileNameRel(Deno.cwd()));
          }
          return false;
        }

        return true;
      },
      onAfterEmit: (result: udt.StructuredDataTyperResult): void => {
        if (udt.isFileDestinationResult(result)) {
          const destRel = path.join(".", result.destFileNameRel(Deno.cwd()));
          if (verbose && !dryRun) {
            console.log(destRel);
          }
          if (validate && !dryRun) {
            // deno-lint-ignore no-undef
            import(destRel);
          }
        }
      },
    });
  }
}

export class CliJsonTyper extends udt.TypicalJsonTyper {
  constructor(
    {
      "--type-import": typeImportURL,
      "--type": typeName,
      "--instance": instanceName,
      "--gsd-import": govnDataImportURL,
    }: docopt.DocOptions,
  ) {
    super(udt.defaultTypicalJsonTyperOptions(
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

export async function inspectCliHandler(
  ctx: CliCmdHandlerContext,
): Promise<true | void> {
  const { "inspect": inspect } = ctx.cliOptions;
  if (inspect) {
    console.dir(ctx.tco.inspectInstance());
    return true;
  }
}

export async function jsonTyperCliHandler(
  ctx: CliCmdHandlerContext,
): Promise<true | void> {
  const { "json": json, "type": type } = ctx.cliOptions;
  if (json && type) {
    const ctl = new TypicalController(
      ctx.calledFromMetaURL,
      ctx.tco,
    );
    const { "<json-src>": jsonSrcSpec, "--validate": validate } =
      ctx.cliOptions;
    ctl.jsonType({
      jsonSrcSpec: jsonSrcSpec?.toString() || "*.json",
      typer: new CliJsonTyper(ctx.cliOptions),
      verbose: ctx.isVerbose || ctx.isDryRun,
      validate: validate ? true : false,
      overwrite: ctx.shouldOverwrite,
    });
    return true;
  }
}

export async function jsonEmitCliHandler(
  ctx: CliCmdHandlerContext,
): Promise<true | void> {
  const { "json": json, "emit": emit, "<emit-dest>": dest } = ctx.cliOptions;
  if (json && emit) {
    const ctl = new TypicalController(
      ctx.calledFromMetaURL,
      ctx.tco,
    );
    ctx.result = ctl.jsonEmit(dest ? dest.toString() : undefined);
    return true;
  }
}

export class CliCmdHandlerContext extends cli.TypicalCommandHandlerContext {
  #result: unknown;

  constructor(
    readonly calledFromMetaURL: string,
    readonly cliOptions: docopt.DocOptions,
    readonly tco: TypicalControllerOptions,
  ) {
    super(calledFromMetaURL, cliOptions);
  }

  get result(): unknown {
    return this.#result;
  }

  set result(v: unknown) {
    this.#result = v;
  }
}

export async function CLI(
  calledFromMetaURL: string,
  tco: TypicalControllerOptions,
): Promise<void> {
  cli.CLI<CliCmdHandlerContext>(
    gdCtlDocoptSpec,
    [jsonEmitCliHandler, jsonTyperCliHandler, inspectCliHandler],
    (options: docopt.DocOptions): CliCmdHandlerContext => {
      return new CliCmdHandlerContext(calledFromMetaURL, options, tco);
    },
  );
}
