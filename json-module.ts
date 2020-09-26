import {
  serializeJS as sjs,
  serializeJsStringify as sjss,
  serializeJsTypes as sjst,
  fs,
} from "./deps.ts";

// deno-lint-ignore no-explicit-any
export function isNumeric(val: any): val is number | string {
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
export function cleanJS(
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

export interface SourceCode {
  readonly provenance: string;
  readonly content: string;
}

export interface Validatable {
  readonly isValid: boolean;
  readonly error?: string | Error;
}

export interface LocalSourceCode extends SourceCode, Validatable {
  readonly isLocalSourceCode: true;
}

export function isLocalSourceCode(sc: SourceCode): sc is LocalSourceCode {
  return "isLocalSourceCode" in sc;
}

export interface RemoteSourceCode extends SourceCode, Validatable {
  readonly isRemoteSourceCode: true;
  readonly fetchResult: RemoteUrlFetchResult;
}

export function isRemoteSourceCode(sc: SourceCode): sc is RemoteSourceCode {
  return "isRemoteSourceCode" in sc;
}

export class LocalFsTextFileSourceCode implements LocalSourceCode {
  readonly isLocalSourceCode = true;
  readonly content: string;
  readonly isValid: boolean;
  readonly error?: string | Error;

  constructor(readonly provenance: string) {
    if (fs.existsSync(provenance)) {
      try {
        this.content = Deno.readTextFileSync(provenance);
        this.isValid = true;
      } catch (err) {
        this.isValid = false;
        this.error = err;
        this.content = err;
      }
    } else {
      this.content = `${provenance} does not exist.`;
      this.isValid = false;
      this.error = new Error(this.content);
    }
  }
}

export function isRemoteURL(text: string | URL): boolean {
  if (typeof text === "string") {
    const pattern = new RegExp(
      "^(https?:\\/\\/)?" + // protocol
        "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
        "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
        "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
        "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
        "(\\#[-a-z\\d_]*)?$", // fragment locator
      "i",
    );
    return !!pattern.test(text);
  }
  return true;
}

export interface RemoteUrlFetchResult {
  readonly origURL: string | URL;
  readonly finalURL: string;
  readonly isValid: boolean;
  readonly error?: string | Error;
  readonly content?: string;
}

export async function remoteUrlContent(
  url: string | URL,
): Promise<RemoteUrlFetchResult> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    const finalUrl = response.url.replace(/\/$/, "");
    const result: RemoteUrlFetchResult = {
      origURL: url,
      finalURL: finalUrl,
      isValid: false,
      content: await response.text(),
    };
    if (response.status != 200) {
      return {
        ...result,
        error: new Deno.errors.Http(
          `${url}: status ${response.status}-'${response.statusText}' while reading ${finalUrl}`,
        ),
      };
    }
    return {
      ...result,
      isValid: true,
    };
  } catch (err) {
    return {
      origURL: url,
      finalURL: url.toString(),
      isValid: false,
      error: err,
    };
  }
}

export class RemoteUrlTextFileSourceCode implements RemoteSourceCode {
  readonly isRemoteSourceCode = true;
  readonly provenance: string;
  readonly content: string;
  readonly isValid: boolean;
  readonly error?: string | Error;

  constructor(readonly fetchResult: RemoteUrlFetchResult) {
    this.provenance = fetchResult.finalURL;
    if (fetchResult.isValid) {
      this.isValid = true;
      this.content = fetchResult.content!;
    } else {
      this.isValid = false;
      this.content = `${this.provenance} is not a valid URL: ${this.error}.`;
      this.error = fetchResult.error;
    }
  }
}

export async function acquireSourceCode(
  provenance: string | URL,
): Promise<SourceCode & Validatable> {
  if (isRemoteURL(provenance)) {
    return new RemoteUrlTextFileSourceCode(await remoteUrlContent(provenance));
  } else if (typeof provenance === "string") {
    return new LocalFsTextFileSourceCode(provenance);
  } else {
    return {
      provenance: provenance.toString(),
      isValid: false,
      error: new Error(`${provenance} must be a local file or remote URL`),
      content:
        `${provenance}: provenance is neither a string (local file name) nor a remote URL`,
    };
  }
}

export interface JsonModuleImport {
  readonly denoCompilerSrcKey: (sc: SourceCode) => string;
  readonly typeScriptImportRef: (sc: SourceCode) => string;
  readonly importedRefSourceCode: SourceCode;
}

export interface JsonModuleOptions {
  readonly moduleName: string;
  readonly imports: JsonModuleImport[];
  readonly jsonContentFileName: string;
  readonly primaryConstName: string;
  readonly primaryConstTsType: string;
  readonly primaryConstIsDefault?: boolean;
  readonly tdgModuleImportRef?: string;
}

export class JsonModule {
  readonly jsonValue: unknown;
  readonly generatedTypeScript: string;

  constructor(
    readonly options: JsonModuleOptions,
  ) {
    this.jsonValue = JSON.parse(
      Deno.readTextFileSync(this.options.jsonContentFileName),
    );
    let sourceCode = `
    ${
      this.options.imports.map((i) =>
        i.typeScriptImportRef(i.importedRefSourceCode)
      ).join("\n")
    };

    export const ${this.options.primaryConstName}: ${this.options.primaryConstTsType} = ${
      sjs.stringify(this.jsonValue, cleanJS, 2)
    };`;

    if (this.options.primaryConstIsDefault) {
      sourceCode += `
      export default ${this.options.primaryConstName};`;
    }

    // TODO: the built-in deno fmt should be used to pretty-up generated code
    this.generatedTypeScript = sourceCode;
  }

  async validate(): Promise<Deno.Diagnostic[] | undefined> {
    const moduleURL = "/" + this.options.moduleName;
    const sources: Record<string, string> = {};
    sources[moduleURL] = this.generatedTypeScript;
    for (const i of this.options.imports) {
      sources[i.denoCompilerSrcKey(i.importedRefSourceCode)] =
        i.importedRefSourceCode.content;
    }

    const [diagnostics] = await Deno.compile(moduleURL, sources);
    return diagnostics;
  }

  persistGeneratedSrcCode(asFileName?: string): string {
    const emitFileName = asFileName || this.options.moduleName;
    Deno.writeTextFileSync(emitFileName, this.generatedTypeScript);
    return emitFileName;
  }

  persistTypedDataGenCode(asFileName?: string): string {
    const emitFileName = asFileName || this.options.moduleName;
    const tdgImportRef = this.options.tdgModuleImportRef ||
      `import * as typedDataGen from "https://denopkg.com/shah/tsd-typed-data-gen/mod.ts";`;
    Deno.writeTextFileSync(
      emitFileName,
      `
      ${tdgImportRef}
      ${this.generatedTypeScript}
      if (import.meta.main) {
        new typedDataGen.CliArgsEmitter(import.meta.url).emitJSON(${this.options.primaryConstName});
      }      
    `,
    );
    return emitFileName;
  }
}
