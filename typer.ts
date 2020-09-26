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

export interface StructuredDataTyper {
  isTypeable: (ctx: StructuredDataTyperContext) => boolean;
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

export interface JsonTyperTextResult extends StructuredDataTyperResult {
  readonly isJsonTyperTextResult: true;
  readonly text: string;
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

  isTypeable(ctx: StructuredDataTyperContext): boolean {
    if (uds.isJsonSupplierEntryContext(ctx.udseCtx)) {
      return true;
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

export interface TypedDataEmitterContext<
  EC extends uds.UntypedDataSupplierEntryContext,
  SC extends uds.UntypedDataSupplierContext<EC>,
> {
  readonly isTypedDataEmitterContext: true;
  readonly udSupplier: uds.UntypedDataSupplier<EC, SC>;
}

export interface TypedDataEmitter {
  emitTypedData: (
    tdeCtx: TypedDataEmitterContext<
      uds.UntypedDataSupplierEntryContext,
      uds.UntypedDataSupplierContext<uds.UntypedDataSupplierEntryContext>
    >,
  ) => void;
}

export interface TypedDataFileEmitterFileNameSupplier {
  (sdtResult: StructuredDataTyperResult): string;
}

export class TypedDataFileSystemEmitter<R extends StructuredDataTyperResult>
  implements TypedDataEmitter {
  constructor(
    readonly typers: StructuredDataTyper[],
    readonly fileNameSupplier: TypedDataFileEmitterFileNameSupplier,
  ) {
  }

  emitTypedData(
    tdeCtx: TypedDataEmitterContext<
      uds.UntypedDataSupplierEntryContext,
      uds.UntypedDataSupplierContext<uds.UntypedDataSupplierEntryContext>
    >,
  ): void {
    tdeCtx.udSupplier.forEach({
      onEntry: (ctx: uds.UntypedDataSupplierEntryContext): void => {
        for (const t of this.typers) {
          const sdtCtx: StructuredDataTyperContext = {
            isStructuredDataTyperContext: true,
            udseCtx: ctx,
          };
          if (t.isTypeable(sdtCtx)) {
            t.typeData(sdtCtx);
          }
        }
      },
    });
  }
}
