export function isDeepMergeableObject(
  o: unknown,
): o is Record<string, unknown> {
  if (o && typeof o === "object") return !Array.isArray(o);
  return false;
}

export function mergeDeep(target: unknown, ...sources: unknown[]): unknown {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isDeepMergeableObject(target) && isDeepMergeableObject(source)) {
    for (const key in source) {
      if (isDeepMergeableObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}
