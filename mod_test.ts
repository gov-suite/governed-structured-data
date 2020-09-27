import { testingAsserts as ta } from "./deps-test.ts";
import { path } from "./deps.ts";
import * as mod from "./mod.ts";
import gdeTestData from "./governed-data-emitter.test.gsd.ts";
const testPath = path.relative(
  Deno.cwd(),
  path.dirname(import.meta.url).substr("file://".length),
);

const expectedEmitterJsonFileName =
  "governed-data-emitter.test.auto.json.golden";

const emitFileName = path.join(testPath, "mod_test.auto.json");
Deno.test(`./governed-data-emitter.test.gsd.ts emits ${emitFileName}`, async () => {
  const generator = new mod.FileSystemEmitter(
    mod.forceExtension(".auto.json", import.meta.url),
  );
  const writtenToFile = generator.emitJSON(gdeTestData);
  ta.assertEquals(
    Deno.readTextFileSync(expectedEmitterJsonFileName),
    Deno.readTextFileSync(emitFileName),
  );
  // if we get to here, the assertion passed so remove the generated file
  Deno.removeSync(writtenToFile);
});

Deno.test(`./governed-data-emitter.test.gsd.ts emits text`, async () => {
  const generator = new mod.TextEmitter();
  const emittedSrcText = generator.emitJSON(gdeTestData);

  ta.assertEquals(
    Deno.readTextFileSync(expectedEmitterJsonFileName),
    emittedSrcText,
  );
});

export class TestJsonTyper extends mod.TypicalJsonTyper {
  static validTestFileName = "./untyped-data-typer.test-valid.json.golden";
  static invalidTestFileName = "./untyped-data-typer.test-invalid.json.golden";

  constructor(forceExtn: string) {
    super(mod.defaultTypicalJsonTyperOptions(
      "./untyped-data-typer.test-schema.ts",
      "Expected",
      {
        govnDataImportURL: "./mod.ts",
        emittedFileExtn: forceExtn,
      },
    ));
  }
}

Deno.test(`${TestJsonTyper.validTestFileName} generates valid TypeScript`, async () => {
  const typer = new TestJsonTyper(".test-valid.auto.ts");
  const emitter = new mod.TypedDataFileSystemEmitter([typer]);
  let emittedFileName: string;
  emitter.emitTypedData({
    udSupplier: new mod.FileSystemGlobSupplier(
      TestJsonTyper.validTestFileName,
    ),
    onAfterEmit: (result: mod.StructuredDataTyperResult): void => {
      ta.assert(mod.isTextResult(result));
      ta.assert(mod.isFileDestinationResult(result));
      if (mod.isFileDestinationResult(result)) {
        emittedFileName = result.destFileName;
      }
    },
  });
  // deno-lint-ignore no-undef
  ta.assert(await import(emittedFileName!));
});

Deno.test(`${TestJsonTyper.invalidTestFileName} generates invalid TypeScript`, async () => {
  const typer = new TestJsonTyper(".test-invalid.auto.ts");
  const emitter = new mod.TypedDataFileSystemEmitter([typer]);
  let emittedFileName: string;
  emitter.emitTypedData({
    udSupplier: new mod.FileSystemGlobSupplier(
      TestJsonTyper.invalidTestFileName,
    ),
    onAfterEmit: (result: mod.StructuredDataTyperResult): void => {
      ta.assert(mod.isTextResult(result));
      ta.assert(mod.isFileDestinationResult(result));
      if (mod.isFileDestinationResult(result)) {
        emittedFileName = result.destFileName;
      }
    },
  });
  ta.assertThrowsAsync(
    async () => {
      // deno-lint-ignore no-undef
      await import(emittedFileName!);
    },
    undefined,
    "TS2322 [ERROR]: Type 'string' is not assignable to type 'number'",
  );
});
