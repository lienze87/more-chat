import {getRandomValues} from 'expo-crypto';

export function createId(prefix: string): string {
  const bytes = getRandomValues(new Uint8Array(16));
  const suffix = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${prefix}_${suffix}`;
}
