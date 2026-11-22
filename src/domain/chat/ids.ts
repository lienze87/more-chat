/**
 * Small, dependency-free id generator.
 * crypto.randomUUID is not guaranteed to exist in every Hermes build.
 */
let counter = 0;

export function createId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(
    36,
  )}${random}`;
}
