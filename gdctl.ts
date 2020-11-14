import * as cli from "./cli.ts";
import type { docopt } from "./deps.ts";
import * as govnData from "./mod.ts";

/**
 * This docOptSpec should be a subset of govnData.gdCtlDocoptSpec only allowing commands
 * that do not require an active "instance" context. govnData.gdCtlDocoptSpec is designed
 * to be called in the context of a governed structure data instance TypeScript file but 
 * the one below is designed to be called without that context since it allows the creation
 * of a governed data TypeScript file.
 */
export const docoptSpec = `
Governed Data Controller (GDC) ${govnData.gdcVersion}. 

Usage:
  gdctl json type <json-src> --type-import=<url> --type=<symbol> [--dry-run] [--validate] [--overwrite] [--instance=<symbol>] [--gsd-import=<url>] [--verbose]
  gdctl -h | --help
  gdctl --version

Options:
  <json-src>              JSON single local file name or glob (like "*.json" or "**/*.json")
  --overwrite             If the file already exists, it's OK to replace it
  --type-import=<url>     The import where the primary TypeScript type definition is found
  --type=<symbol>         The TypeScript symbol that should be assigned the primary type
  --instance=<symbol>     The name of the TypeScript instance that should be assigned (default: "instance")
  --gsd-import=<url>      The import where the Governed Structured Data (GSD) library is found
  --verbose               Be explicit about what's going on
  -h --help               Show this screen
  --version               Show version
`;

if (import.meta.main) {
  cli.CLI<govnData.CliCmdHandlerContext>(
    docoptSpec,
    [govnData.jsonTyperCliHandler],
    (options: docopt.DocOptions): govnData.CliCmdHandlerContext => {
      return new govnData.CliCmdHandlerContext(
        import.meta.url,
        options,
        govnData.defaultTypicalControllerOptions({ cli: "NO DATA INSTANCE" }),
      );
    },
  );
}
