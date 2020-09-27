import { inflect } from "./deps.ts";

export interface TypeScriptClassNameOptions {
  readonly forceSuffix?: string;
  readonly removeSuffixes?: string[];
}

export function typeScriptClassName(
  iv: inflect.InflectableValue,
  { forceSuffix, removeSuffixes }: TypeScriptClassNameOptions,
): string {
  let result = inflect.toPascalCase(iv);
  if (removeSuffixes) {
    for (const suffix of removeSuffixes) {
      if (result.endsWith(suffix)) {
        result = result.substr(0, result.length - suffix.length);
      }
    }
  }
  if (forceSuffix) {
    if (!result.endsWith(forceSuffix)) result += forceSuffix;
  }
  return result;
}
