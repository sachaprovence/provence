export function enumTuple<T extends Record<string, string>>(obj: T): [T[keyof T], ...T[keyof T][]] {
  const values = Object.values(obj) as T[keyof T][];
  return values as [T[keyof T], ...T[keyof T][]];
}
