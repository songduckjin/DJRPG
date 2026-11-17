export function createBootProgress(paths: readonly string[], onProgress?: (loaded: number, total: number) => void) {
  const expected = new Set(paths);
  const completed = new Set<string>();
  const total = expected.size;
  return {
    total,
    get loaded() { return completed.size; },
    ratio() { return total === 0 ? 1 : completed.size / total; },
    report() { onProgress?.(completed.size, total); },
    tick(path: string) {
      if (expected.has(path) && !completed.has(path)) {
        completed.add(path);
        onProgress?.(completed.size, total);
      }
      return completed.size;
    }
  };
}
