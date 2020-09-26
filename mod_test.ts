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
