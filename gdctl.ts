import * as govnData from "./mod.ts";

export const instance = { cli: "NO DATA INSTANCE" };
export default instance;

if (import.meta.main) {
  govnData.CLI(
    import.meta.url,
    govnData.defaultTypicalControllerOptions(instance),
  );
}
