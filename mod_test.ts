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
Deno.test(`././governed-data-emitter.test.gsd.ts emits ${emitFileName}`, async () => {
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

const testJsonModuleOptionsDefault = {
  imports: [
    {
      denoCompilerSrcKey: (sc: mod.SourceCode): string => {
        return "/json-module.test-schema.ts";
      },
      typeScriptImportRef: (sc: mod.SourceCode): string => {
        return `import type * as mod from "./json-module.test-schema.ts"`;
      },
      importedRefSourceCode: await mod.acquireSourceCode(
        "./json-module.test-schema.ts",
      ),
    },
  ],
  primaryConstName: "expected",
  primaryConstTsType: "mod.Expected",
};

Deno.test("./json-module.test-valid.json.golden matches test schema", async () => {
  const validJsonModule = new mod.JsonModule(
    {
      ...testJsonModuleOptionsDefault,
      moduleName: "test-valid.ts",
      jsonContentFileName: "json-module.test-valid.json.golden",
    },
  );

  const tsSrcDiagnostics = await validJsonModule.validate();
  ta.assertEquals(
    undefined,
    tsSrcDiagnostics,
    "This a valid JSON file, no diagnostics should be produced",
  );
});

Deno.test("./json-module.test-invalid.json.golden generates diagnostics", async () => {
  const invalidJsonModule = new mod.JsonModule(
    {
      ...testJsonModuleOptionsDefault,
      moduleName: "test-invalid.ts",
      jsonContentFileName: "json-module.test-invalid.json.golden",
    },
  );

  const tsSrcDiagnostics = await invalidJsonModule.validate();
  ta.assert(
    tsSrcDiagnostics,
    "Diagonistics should be produced for invalid JSON Schema",
  );
  // console.log("\n", Deno.formatDiagnostics(tsSrcDiagnostics));
  const error = tsSrcDiagnostics[0];
  ta.assertEquals(5, error.start!.line);
  ta.assertEquals(
    "Type 'string' is not assignable to type 'number'.",
    error.messageText,
  );
});

Deno.test("acquire local source code module", async () => {
  const scModule = "./json-module.test-schema.ts";
  const sc = await mod.acquireSourceCode(scModule);
  ta.assert(mod.isLocalSourceCode(sc));
  ta.assert(sc.isValid);
  ta.assert(Deno.readTextFileSync(scModule), sc.content);
});

Deno.test("acquire remote source code module", async () => {
  const scModule =
    "https://raw.githubusercontent.com/shah/tsd-typed-data-gen/master/json-module.test-schema.ts";
  const sc = await mod.acquireSourceCode(scModule);
  ta.assert(mod.isRemoteSourceCode(sc));
  ta.assert(sc.isValid, `${scModule} should be valid`);
  ta.assert(sc.fetchResult, `${scModule} should have fetch results`);
  ta.assert(Deno.readTextFileSync("./json-module.test-schema.ts"), sc.content);
});

Deno.test("fail to acquire remote source code module", async () => {
  const scModule = "https://raw.githubusercontent.com/bad/url/test-schema.ts";
  const sc = await mod.acquireSourceCode(scModule);
  ta.assert(!sc.isValid);
  ta.assert(sc.error);
});
