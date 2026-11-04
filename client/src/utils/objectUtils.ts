/**
 * Deep equality and object sorting utilities to accurately detect
 * whether step variables/payloads have been customized vs inheriting from variants.
 */

export function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

export function areObjectsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  try {
    return JSON.stringify(sortObjectKeys(a)) === JSON.stringify(sortObjectKeys(b));
  } catch {
    return false;
  }
}
