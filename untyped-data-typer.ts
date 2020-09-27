import * as uds from "./untyped-data-supplier.ts";

import {
  serializeJS as sjs,
  serializeJsStringify as sjss,
  serializeJsTypes as sjst,
  fs,
} from "./deps.ts";

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

export function isTextResult(o: unknown): o is TextResult {
  return o && typeof o === "object" && "text" in o;
}

export interface FileDestinationResult {
  readonly destFileName: string;
}

export function isFileDestinationResult(
  o: unknown,
): o is FileDestinationResult {
  return o && typeof o === "object" && "destFileName" in o;
}

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

  stringifyJSON(ctx: JsonTyperContext): string | undefined {
    return sjs.stringify(
      ctx.jseCtx.jsonValue,
      this.options.stringifyReplacer,
      this.options.stringifyIndent,
    );
  }

  abstract typeData(ctx: StructuredDataTyperContext): JsonTyperTextResult;
}

export interface TypicalJsonTyperOptions extends JsonTyperOptions {
  readonly govnDataImportURL: string;
  readonly typeImportURL: string;
  readonly typeName: string;
  readonly instanceName: string;
  readonly emittedFileExtn: string;
}

export function defaultTypicalJsonTyperOptions(
  typeImportURL: string,
  typeName: string,
  override: Partial<
    Omit<TypicalJsonTyperOptions, "typeImportURL" | "typeName">
  >,
): TypicalJsonTyperOptions {
  const { govnDataImportURL, instanceName, emittedFileExtn } = override;
  return {
    ...defaultJsonTyperOptions(),
    govnDataImportURL: govnDataImportURL ||
      `https://denopkg.com/gov-suite/governed-structured-data/mod.ts`,
    typeImportURL: typeImportURL, // required
    typeName: typeName, // required
    instanceName: instanceName || "instance",
    emittedFileExtn: emittedFileExtn || ".auto.ts",
  };
}

export class TypicalJsonTyper extends JsonTyper {
  constructor(readonly options: TypicalJsonTyperOptions) {
    super(options);
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
    } = this.options;
    let textResult, destFileName;
    if (isJsonTyperContext(ctx)) {
      if (uds.isFileContext(ctx.udseCtx)) {
        destFileName = ctx.udseCtx.forceExtension(emittedFileExtn);
        textResult = `
        // Generated from ${ctx.udseCtx.fileName}. DO NOT EDIT.
  
        import * as govnData from "${govnDataImportURL}";
        import type * as mod from "${typeImportURL}";
    
        export const ${instanceName}: mod.${typeName} = ${
          this.stringifyJSON(ctx)
        };
    
        export default ${instanceName};
    
        if (import.meta.main) {
          new govnData.CliArgsEmitter(import.meta.url).emitJSON(${instanceName});
        }`;
      } else {
        textResult =
          `ctx.jseCtx is expected to be a FileContext instance: ${ctx.jseCtx}`;
      }
    } else {
      textResult = `ctx is expected to be a JsonTyperContext instance: ${ctx}`;
    }
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
      };
      return enhanced;
    }
    return result;
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
