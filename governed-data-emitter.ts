import { path } from "./deps.ts";
import type * as udt from "./untyped-data-typer.ts";

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

export class CliArgsEmitter implements JsonEmitter {
  constructor(
    readonly fromSrcModuleURL: string,
    readonly retype: udt.JsonRetyper,
    readonly defaultJsonExtn = ".auto.json",
  ) {
  }

  emitJSON(content: unknown | EmittableContent): string | void {
    if (Deno.args && Deno.args.length > 0) {
      switch (Deno.args[0]) {
        case ".json":
          return new FileSystemEmitter(
            forceExtension(this.defaultJsonExtn, this.fromSrcModuleURL),
          ).emitJSON(content);

        case "inspect":
          console.dir(this.retype);
          return;

        case "retype":
        case "sync":
          console.log("TODO: retyping/syncing not supported yet");
          return;

        default:
          return new FileSystemEmitter(Deno.args[0]).emitJSON(content);
      }
    } else {
      StdOutEmitter.singleton.emitJSON(content);
    }
  }
}
