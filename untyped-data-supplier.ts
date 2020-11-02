import { fs, path } from "./deps.ts";

export interface UntypedDataProvenance {
  readonly isUntypedDataProvenance: true;
}

export interface UntypedDataSupplierEntryContext {
  readonly isUntypedDataSupplierEntryContext: true;
}

export interface UntypedDataSupplierContext {
  readonly onEntry: (ctx: UntypedDataSupplierEntryContext) => void;
}

export interface UntypedDataSupplier {
  readonly forEach: (ctx: UntypedDataSupplierContext) => void;
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

export interface FileProvenance extends UntypedDataProvenance {
  readonly isFileProvenance: true;
  readonly fileName: string;
  readonly size: number;
  readonly atime: Date | null;
  readonly mtime: Date | null;
  readonly birthtime: Date | null;
}

export interface FileContext {
  readonly isFileContext: true;
  readonly absFileName: string;
  readonly fileName: string;
  readonly fileNameWithoutExtn: string;
  readonly fileExtensions: string[];
  readonly lastFileExtn: string;
  readonly forceExtension: (extn: string) => string;
  readonly provenance: FileProvenance;
}

export function isFileContext(o: unknown): o is FileContext {
  return o && typeof o === "object" && "isFileContext" in o;
}

export interface BufferProvenance extends UntypedDataProvenance {
  readonly isBufferProvenance: true;
  readonly bufferIdentity?: string;
}

export function isBufferContext(o: unknown): o is BufferProvenance {
  return o && typeof o === "object" && "isBufferProvenance" in o;
}

export interface UntypedDataSupplierEntryContextGuesser {
  guessFromFile: (
    fc: FileContext,
  ) => UntypedDataSupplierEntryContext | undefined;
  guessFromBuffer(
    buffer: Uint8Array,
    identity?: string,
  ): UntypedDataSupplierEntryContext | undefined;
}

export class JsonSupplierEntryContextGuesser {
  static readonly singleton = new JsonSupplierEntryContextGuesser();

  jsonFileContext(fc: FileContext): JsonSupplierEntryContext & FileContext {
    const jsonValue = JSON.parse(Deno.readTextFileSync(fc.absFileName));
    const jseCtx: JsonSupplierEntryContext & FileContext = {
      isUntypedDataSupplierEntryContext: true,
      jsonValue: jsonValue,
      ...fc,
    };
    return jseCtx;
  }

  guessFromFile(
    fc: FileContext,
  ): UntypedDataSupplierEntryContext | undefined {
    if (fc.lastFileExtn == "json") {
      return this.jsonFileContext(fc);
    }
  }

  guessFromBuffer(
    buffer: Uint8Array,
    identity?: string,
  ): UntypedDataSupplierEntryContext | undefined {
    // TODO: right now this is not "guessing", just "forcing" - need to add
    // a JSON "sniffer" at some point
    const jsonValue = JSON.parse(new TextDecoder().decode(buffer));
    const jseCtx: JsonSupplierEntryContext & BufferProvenance = {
      isUntypedDataSupplierEntryContext: true,
      isUntypedDataProvenance: true,
      isBufferProvenance: true,
      jsonValue: jsonValue,
      bufferIdentity: identity,
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

export interface FileSystemGlobSupplierOptions {
  guessers: UntypedDataSupplierEntryContextGuesser[];
  onNoSourcesFound: (sourceSpec: string) => void;
  onNoGuesses: (fc: FileContext) => UntypedDataSupplierEntryContext | undefined;
}

export function defaultFileSystemGlobSupplierOptions(): FileSystemGlobSupplierOptions {
  return {
    onNoSourcesFound: (spec): void => {
      console.log(`No sources found for spec "${spec}"`);
    },
    guessers: [
      JsonSupplierEntryContextGuesser.singleton,
    ],
    onNoGuesses: (
      fc: FileContext,
    ): UntypedDataSupplierEntryContext => {
      return JsonSupplierEntryContextGuesser.singleton.jsonFileContext(fc);
    },
  };
}

export class FileSystemGlobSupplier implements UntypedDataSupplier {
  readonly isUntypedDataSupplier = true;
  readonly isJsonSupplier = true;

  constructor(
    readonly sourceSpec: string,
    readonly options: FileSystemGlobSupplierOptions =
      defaultFileSystemGlobSupplierOptions(),
  ) {
  }

  static globWalkEntryContext(we: fs.WalkEntry): GlobWalkEntryContext {
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
    const lstat = Deno.lstatSync(we.path);
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
      provenance: {
        isUntypedDataProvenance: true,
        isFileProvenance: true,
        fileName: we.path,
        size: lstat.size,
        mtime: lstat.mtime,
        birthtime: lstat.birthtime,
        atime: lstat.atime,
      },
      isGlobWalkEntryContext: true,
      walkEntry: we,
    };
    return gweCtx;
  }

  forEach(udsCtx: UntypedDataSupplierContext): void {
    let handled = 0;
    for (const we of fs.expandGlobSync(this.sourceSpec)) {
      const gweCtx = FileSystemGlobSupplier.globWalkEntryContext(we);

      let guessedCount = 0;
      for (const guesser of this.options.guessers) {
        const guessed = guesser.guessFromFile(gweCtx);
        if (guessed) {
          udsCtx.onEntry(guessed);
          guessedCount++;
        }
      }

      if (guessedCount == 0 && this.options.onNoGuesses) {
        const defaultHandler = this.options.onNoGuesses(gweCtx);
        if (defaultHandler) {
          udsCtx.onEntry(defaultHandler);
        } else {
          console.log(`Unable to handle ${gweCtx}`);
        }
      }

      handled++;
    }

    if (handled == 0) {
      this.options.onNoSourcesFound(this.sourceSpec);
    }
  }
}

export interface BufferSupplierOptions {
  readonly identity: string;
  readonly guessers: UntypedDataSupplierEntryContextGuesser[];
  readonly noContentAvailable: () => void;
  readonly onNoGuesses: (
    buffer: Uint8Array,
  ) => UntypedDataSupplierEntryContext | undefined;
}

export function defaultBufferSupplierOptions(
  identity?: string,
): BufferSupplierOptions {
  return {
    identity: identity || "buffer",
    guessers: [
      JsonSupplierEntryContextGuesser.singleton,
    ],
    noContentAvailable: (): void => {
      console.log(`No content available in ${identity}`);
    },
    onNoGuesses: (
      buffer: Uint8Array,
    ): UntypedDataSupplierEntryContext | undefined => {
      return JsonSupplierEntryContextGuesser.singleton.guessFromBuffer(buffer);
    },
  };
}

export class BufferSupplier implements UntypedDataSupplier {
  readonly isUntypedDataSupplier = true;
  readonly isJsonSupplier = true;

  constructor(
    readonly buffer: Uint8Array,
    readonly options = defaultBufferSupplierOptions(),
  ) {
  }

  forEach(udsCtx: UntypedDataSupplierContext): void {
    if (this.buffer.length > 0) {
      let guessedCount = 0;
      for (const guesser of this.options.guessers) {
        const guessed = guesser.guessFromBuffer(
          this.buffer,
          this.options.identity,
        );
        if (guessed) {
          udsCtx.onEntry(guessed);
          guessedCount++;
        }
      }

      if (guessedCount == 0 && this.options.onNoGuesses) {
        const defaultHandler = this.options.onNoGuesses(this.buffer);
        if (defaultHandler) {
          udsCtx.onEntry(defaultHandler);
        } else {
          console.log(`Unable to handle STDIN buffer`);
        }
      }
    } else {
      this.options.noContentAvailable();
    }
  }
}
