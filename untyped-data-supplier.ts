import { fs, path } from "./deps.ts";

export interface UntypedDataSupplierEntryContext {
  readonly isUntypedDataSupplierEntryContext: true;
}

export interface UntypedDataSupplierContext<
  C extends UntypedDataSupplierEntryContext,
> {
  readonly onEntry: (ctx: C) => void;
}

export interface UntypedDataSupplier<
  EC extends UntypedDataSupplierEntryContext,
  SC extends UntypedDataSupplierContext<EC>,
> {
  readonly forEach: (ctx: SC) => void;
}

export interface JsonSupplierEntryContext
  extends UntypedDataSupplierEntryContext {
  readonly jsonValue: unknown;
}

export function isJsonSupplierEntryContext(
  o: UntypedDataSupplierEntryContext,
): o is JsonSupplierEntryContext {
  return "jsonValue" in o;
}

export interface FileContext {
  readonly isFileContext: true;
  readonly absFileName: string;
  readonly fileName: string;
  readonly fileNameWithoutExtn: string;
  readonly fileExtensions: string[];
  readonly lastFileExtn: string;
  readonly forceExtension: (extn: string) => string;
}

export function isFileContext(o: unknown): o is FileContext {
  return o && typeof o === "object" && "isFileContext" in o;
}

export interface UntypedDataSupplierEntryContextGuesser {
  guessFromFile: (
    fc: FileContext,
  ) => UntypedDataSupplierEntryContext | undefined;
}

export class JsonSupplierEntryContextGuesser {
  static readonly singleton = new JsonSupplierEntryContextGuesser();

  guessFromFile(
    fc: FileContext,
  ): UntypedDataSupplierEntryContext | undefined {
    if (fc.lastFileExtn != "json") return undefined;
    const jsonValue = JSON.parse(Deno.readTextFileSync(fc.absFileName));
    const jseCtx: JsonSupplierEntryContext & FileContext = {
      isUntypedDataSupplierEntryContext: true,
      jsonValue: jsonValue,
      ...fc,
    };
    return jseCtx;
  }
}

export interface GlobWalkEntryContext extends FileContext {
  readonly isGlobWalkEntryContext: true;
  readonly walkEntry: fs.WalkEntry;
}

export function isGlobWalkEntryContext(o: unknown): o is GlobWalkEntryContext {
  return o && typeof o === "object" && "isGlobWalkEntryContext" in o;
}

export class FileSystemGlobSupplier implements
  UntypedDataSupplier<
    UntypedDataSupplierEntryContext,
    UntypedDataSupplierContext<UntypedDataSupplierEntryContext>
  > {
  readonly isUntypedDataSupplier = true;
  readonly isJsonSupplier = true;

  constructor(
    readonly sourceSpec: string,
    readonly guessers: UntypedDataSupplierEntryContextGuesser[] = [
      JsonSupplierEntryContextGuesser.singleton,
    ],
  ) {
  }

  forEach(
    udsCtx: UntypedDataSupplierContext<UntypedDataSupplierEntryContext>,
  ): void {
    for (const we of fs.expandGlobSync(this.sourceSpec)) {
      const dotPosition = we.name.indexOf(".");
      const fileNameWithoutExtn = dotPosition === -1
        ? we.name
        : we.name.substr(0, dotPosition);
      const fileExtensions = dotPosition === -1
        ? []
        : we.name.substr(dotPosition + 1).split(".");
      const lastFileExtn = fileExtensions.length > 0
        ? fileExtensions[fileExtensions.length - 1]
        : "";
      const gweCtx: GlobWalkEntryContext = {
        isFileContext: true,
        fileName: we.name,
        absFileName: we.path,
        fileNameWithoutExtn: fileNameWithoutExtn,
        fileExtensions: fileExtensions,
        lastFileExtn: lastFileExtn,
        forceExtension(extn: string): string {
          return `${
            path.join(path.dirname(we.path), fileNameWithoutExtn)
          }${extn}`;
        },
        isGlobWalkEntryContext: true,
        walkEntry: we,
      };
      for (const guesser of this.guessers) {
        const guessed = guesser.guessFromFile(gweCtx);
        if (guessed) {
          udsCtx.onEntry(guessed);
        }
      }
    }
  }
}
