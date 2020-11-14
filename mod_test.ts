import { testingAsserts as ta } from "./deps-test.ts";
import { path } from "./deps.ts";
import * as mod from "./mod.ts";
import gdcTestData from "./governed-data-controller.test.gsd.ts";

const testPath = path.relative(
  Deno.cwd(),
  path.dirname(import.meta.url).substr("file://".length),
);

const expectedEmitterJsonFileName =
  "governed-data-controller.test.auto.json.golden";

const expectedEmitterTomlFileName =
  "governed-data-controller.test.auto.toml.golden";

const expectedEmitterYamlFileName =
  "governed-data-controller.test.auto.yaml.golden";

const emitJsonFileName = path.join(testPath, "mod_test.auto.json");
Deno.test(`./governed-data-controller.test.gsd.ts emits ${emitJsonFileName}`, async () => {
  const ctx = new mod.CliCmdHandlerContext(
    import.meta.url,
    {
      "json": true,
      "emit": true,
      "<emit-dest>": mod.forceExtension(".auto.json", import.meta.url),
    },
    mod.defaultTypicalControllerOptions(gdcTestData),
  );
  ta.assert(await mod.jsonEmitCliHandler(ctx));
  const writtenToFile = ctx.result;
  ta.assert(typeof writtenToFile === "string");
  ta.assertEquals(
    Deno.readTextFileSync(expectedEmitterJsonFileName),
    Deno.readTextFileSync(emitJsonFileName),
  );
  // if we get to here, the assertion passed so remove the generated file
  Deno.removeSync(writtenToFile);
});

const emitTomlFileName = path.join(testPath, "mod_test.auto.toml");
Deno.test(`./governed-data-controller.test.gsd.ts emits ${emitTomlFileName}`, async () => {
  const ctx = new mod.CliCmdHandlerContext(
    import.meta.url,
    {
      "toml": true,
      "emit": true,
      "<emit-dest>": mod.forceExtension(".auto.toml", import.meta.url),
    },
    mod.defaultTypicalControllerOptions(gdcTestData),
  );
  ta.assert(await mod.tomlEmitCliHandler(ctx));
  const writtenToFile = ctx.result;
  ta.assert(typeof writtenToFile === "string");
  ta.assertEquals(
    Deno.readTextFileSync(expectedEmitterTomlFileName),
    Deno.readTextFileSync(emitTomlFileName),
  );
  // if we get to here, the assertion passed so remove the generated file
  Deno.removeSync(writtenToFile);
});

const emitYamlFileName = path.join(testPath, "mod_test.auto.yaml");
Deno.test(`./governed-data-controller.test.gsd.ts emits ${emitYamlFileName}`, async () => {
  const ctx = new mod.CliCmdHandlerContext(
    import.meta.url,
    {
      "yaml": true,
      "emit": true,
      "<emit-dest>": mod.forceExtension(".auto.yaml", import.meta.url),
    },
    mod.defaultTypicalControllerOptions(gdcTestData),
  );
  ta.assert(await mod.yamlEmitCliHandler(ctx));
  const writtenToFile = ctx.result;
  ta.assert(typeof writtenToFile === "string");
  ta.assertEquals(
    Deno.readTextFileSync(expectedEmitterYamlFileName),
    Deno.readTextFileSync(emitYamlFileName),
  );
  // if we get to here, the assertion passed so remove the generated file
  Deno.removeSync(writtenToFile);
});

Deno.test(`./governed-data-controller.test.gsd.ts emits text`, async () => {
  const generator = new mod.TextEmitter();
  const emittedSrcText = generator.emitJSON(gdcTestData);

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
      "mod.Expected",
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
      await import(emittedFileName!);
    },
    undefined,
    "TS2322 [ERROR]: Type 'string' is not assignable to type 'number'",
  );
});
