import {
  path,
  safety,
  serializeJS as sjs,
  serializeJsStringify as sjss,
  serializeJsTypes as sjst,
} from "./deps.ts";
import * as uds from "./untyped-data-supplier.ts";

// deno-lint-ignore no-explicit-any
function isNumeric(val: any): val is number | string {
  // from: https://github.com/ReactiveX/rxjs/blob/master/src/internal/util/isNumeric.ts
  return !Array.isArray(val) && (val - parseFloat(val) + 1) >= 0;
}

/**
   * We want JSON to look as hand-written as possible so we clean incoming
   * JSON such that strings that look like numbers are converted to non-quoted
   * numbers, etc.
   * @param value The original value in the JSON object
   * @param space Whether we want indentation
   * @param next The next object in the list
   * @param key The propery name
   */
function cleanJS(
  value: unknown,
  space: string,
  next: sjst.Next,
  key: PropertyKey | undefined,
): string | undefined {
  if (isNumeric(value)) {
    // return unquoted numbers if a string is a number
    return value.toString();
  }
  return sjss.toString(value, space, next, key);
}

export interface StructuredDataTyperContext {
  readonly isStructuredDataTyperContext: true;
  readonly udseCtx: uds.UntypedDataSupplierEntryContext;
}

export interface StructuredDataTyperResult {
  readonly isStructuredDataTyperResult: true;
  readonly udseCtx: uds.UntypedDataSupplierEntryContext;
}

export interface TextResult {
  readonly text: string;
}

export const isTextResult = safety.typeGuard<TextResult>("text");

export interface FileDestinationResult {
  readonly destFileName: string;
  readonly destFileNameRel: (relTo: string) => string;
}

export const isFileDestinationResult = safety.typeGuard<FileDestinationResult>(
  "destFileName",
);

export interface StructuredDataTyper {
  isTypeable: (
    ctx: StructuredDataTyperContext,
  ) => StructuredDataTyperContext | false;
  typeData: (ctx: StructuredDataTyperContext) => StructuredDataTyperResult;
}

export interface JsonTyperContext extends StructuredDataTyperContext {
  readonly isJsonTyperContext: true;
  readonly jseCtx: uds.JsonSupplierEntryContext;
}

export function isJsonTyperContext(
  o: StructuredDataTyperContext,
): o is JsonTyperContext {
  return "isJsonTyperContext" in o;
}

export interface JsonTyperTextResult
  extends StructuredDataTyperResult, TextResult {
  readonly isJsonTyperTextResult: true;
}

export function isJsonTyperTextResult(
  o: StructuredDataTyperResult,
): o is JsonTyperTextResult {
  return "isJsonTyperTextResult" in o;
}

export interface JsonTyperOptions {
  readonly stringifyReplacer: sjst.ToString;
  readonly stringifyIndent: number;
}

export function defaultJsonTyperOptions(): JsonTyperOptions {
  return {
    stringifyReplacer: cleanJS,
    stringifyIndent: 2,
  };
}

export abstract class JsonTyper implements StructuredDataTyper {
  constructor(
    readonly options: JsonTyperOptions = defaultJsonTyperOptions(),
  ) {
  }

  isTypeable(
    ctx: StructuredDataTyperContext,
  ): StructuredDataTyperContext | false {
    if (uds.isJsonSupplierEntryContext(ctx.udseCtx)) {
      const result: JsonTyperContext = {
        ...ctx,
        isJsonTyperContext: true,
        jseCtx: ctx.udseCtx,
      };
      return result;
    }
    return false;
  }

  stringifyJsonValue(jsonValue: unknown): string | undefined {
    return sjs.stringify(
      jsonValue,
      this.options.stringifyReplacer,
      this.options.stringifyIndent,
    );
  }

  stringifyJSON(ctx: JsonTyperContext): string | undefined {
    return this.stringifyJsonValue(ctx.jseCtx.jsonValue);
  }

  abstract typeData(ctx: StructuredDataTyperContext): JsonTyperTextResult;
}

export interface TypicalJsonTyperOptions extends JsonTyperOptions {
  readonly govnDataImportURL: string;
  readonly typeImportURL: string | string[];
  readonly typeName: string;
  readonly instanceName: string;
  readonly inspectorPropertyTS: string;
  readonly emittedFileExtn: string;
}

export function defaultTypicalJsonTyperOptions(
  typeImportURL: string | string[],
  typeName: string,
  override: Partial<
    Omit<TypicalJsonTyperOptions, "typeImportURL" | "typeName">
  >,
): TypicalJsonTyperOptions {
  const {
    govnDataImportURL,
    instanceName,
    emittedFileExtn,
    inspectorPropertyTS,
  } = override;
  return {
    ...defaultJsonTyperOptions(),
    govnDataImportURL: govnDataImportURL ||
      `https://denopkg.com/gov-suite/governed-structured-data/mod.ts`,
    typeImportURL: typeImportURL, // required
    typeName: typeName, // required
    instanceName: instanceName || "instance",
    inspectorPropertyTS: inspectorPropertyTS || "dataInspector: undefined",
    emittedFileExtn: emittedFileExtn || ".auto.ts",
  };
}

export interface JsonRetyper {
  readonly provenance: uds.FileProvenance;
  readonly jsonRetyperOptions: Partial<TypicalJsonTyperOptions>;
}

export class TypicalJsonTyper extends JsonTyper {
  constructor(readonly options: TypicalJsonTyperOptions) {
    super(options);
  }

  protected retype(provenance: uds.FileProvenance): JsonRetyper {
    return {
      provenance: provenance,
      jsonRetyperOptions: {
        typeImportURL: this.options.typeImportURL,
        typeName: this.options.typeName,
        instanceName: this.options.instanceName,
        govnDataImportURL: this.options.govnDataImportURL,
        emittedFileExtn: this.options.emittedFileExtn,
      },
    };
  }

  protected typerResult(
    ctx: StructuredDataTyperContext,
    textResult: string,
    destFileName?: string,
  ): JsonTyperTextResult {
    const result: JsonTyperTextResult = {
      isStructuredDataTyperResult: true,
      isJsonTyperTextResult: true,
      udseCtx: ctx.udseCtx,
      text: textResult,
    };
    if (destFileName) {
      const enhanced: JsonTyperTextResult & FileDestinationResult = {
        ...result,
        destFileName: destFileName,
        destFileNameRel: (relTo: string): string => {
          return path.relative(relTo, destFileName);
        },
      };
      return enhanced;
    }
    return result;
  }

  typeData(
    ctx: StructuredDataTyperContext,
  ): JsonTyperTextResult {
    const {
      govnDataImportURL,
      typeImportURL,
      typeName,
      instanceName,
      emittedFileExtn,
      inspectorPropertyTS,
    } = this.options;
    let textResult, destFileName: string | undefined;
    if (isJsonTyperContext(ctx)) {
      if (uds.isFileContext(ctx.udseCtx)) {
        destFileName = ctx.udseCtx.forceExtension(emittedFileExtn);
        const retype = this.retype({
          ...ctx.udseCtx.provenance,
          fileName: path.relative(
            path.dirname(destFileName),
            ctx.udseCtx.absFileName,
          ),
        });
        const modImportLines = typeof this.options.typeImportURL === "string"
          ? [
            `import * as govnData from "${govnDataImportURL}";`,
            `import type * as mod from "${typeImportURL}";`,
          ]
          : this.options.typeImportURL;
        textResult = `
        // Generated by GSD. DO NOT EDIT.
  
        ${modImportLines.join("\n")}

        // \`${instanceName}\` created on ${new Date()} from:
        //   ${retype.provenance.fileName}
        //   ${retype.provenance.mtime}, ${retype.provenance.size} bytes

        export const ${instanceName}: ${typeName} = ${this.stringifyJSON(ctx)};
    
        export default ${instanceName};
    
        export const retype: govnData.JsonRetyper = ${
          this.stringifyJsonValue(retype)
        }

        if (import.meta.main) {     
          govnData.CLI(
            import.meta.url,
            govnData.defaultTypicalControllerOptions(${instanceName}, { retype: retype, ${inspectorPropertyTS} }),
          );
        }`.replaceAll(/^ {8}/gm, ""); // remove indendation
      } else {
        textResult =
          `ctx.jseCtx is expected to be a FileContext instance: ${ctx.jseCtx}`;
      }
    } else {
      textResult = `ctx is expected to be a JsonTyperContext instance: ${ctx}`;
    }
    return this.typerResult(ctx, textResult, destFileName);
  }
}

export interface TypedDataEmitterContext {
  readonly udSupplier: uds.UntypedDataSupplier;
  readonly shouldEmit?: (result: StructuredDataTyperResult) => boolean;
  readonly onAfterEmit?: (result: StructuredDataTyperResult) => void;
}

export interface TypedDataEmitter {
  emitTypedData: (tdeCtx: TypedDataEmitterContext) => void;
}

export interface TypedDataFileEmitterFileNameSupplier {
  (sdtResult: StructuredDataTyperResult): string;
}

export class TypedDataFileSystemEmitter implements TypedDataEmitter {
  constructor(readonly typers: StructuredDataTyper[]) {
  }

  emitTypedData(tdeCtx: TypedDataEmitterContext): void {
    tdeCtx.udSupplier.forEach({
      onEntry: (ctx: uds.UntypedDataSupplierEntryContext): void => {
        for (const t of this.typers) {
          const sdtCtx: StructuredDataTyperContext = {
            isStructuredDataTyperContext: true,
            udseCtx: ctx,
          };
          const enhanced = t.isTypeable(sdtCtx);
          if (enhanced) {
            const result = t.typeData(enhanced);
            if (!tdeCtx.shouldEmit || tdeCtx.shouldEmit(result)) {
              if (isTextResult(result)) {
                if (isFileDestinationResult(result)) {
                  Deno.writeTextFileSync(result.destFileName, result.text);
                }
                if (tdeCtx.onAfterEmit) {
                  tdeCtx.onAfterEmit(result);
                }
              }
            }
          }
        }
      },
    });
  }
}
