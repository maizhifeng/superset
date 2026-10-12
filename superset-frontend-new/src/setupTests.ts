import "@testing-library/jest-dom";

// Node 22+ defines an experimental `localStorage` global that is unusable
// unless `--localstorage-file` is passed, and it shadows the jsdom value in
// this vitest setup. Install an in-memory Storage implementation behind the
// real `Storage.prototype` so code using localStorage/sessionStorage works and
// tests can still monkey-patch Storage.prototype.getItem/setItem.
if (
  typeof window !== "undefined" &&
  typeof Storage !== "undefined" &&
  !window.localStorage
) {
  const stores = new WeakMap<object, Map<string, string>>();
  const storeOf = (self: object): Map<string, string> => {
    let store = stores.get(self);
    if (!store) {
      store = new Map<string, string>();
      stores.set(self, store);
    }
    return store;
  };

  const proto = Storage.prototype as unknown as Record<string, unknown>;
  proto.getItem = function (this: object, key: string): string | null {
    return storeOf(this).has(key) ? (storeOf(this).get(key) as string) : null;
  };
  proto.setItem = function (this: object, key: string, value: unknown): void {
    storeOf(this).set(key, String(value));
  };
  proto.removeItem = function (this: object, key: string): void {
    storeOf(this).delete(key);
  };
  proto.clear = function (this: object): void {
    storeOf(this).clear();
  };
  proto.key = function (this: object, index: number): string | null {
    return Array.from(storeOf(this).keys())[index] ?? null;
  };
  Object.defineProperty(proto, "length", {
    get(this: object) {
      return storeOf(this).size;
    },
    configurable: true,
  });

  const local = Object.create(Storage.prototype) as Storage;
  const session = Object.create(Storage.prototype) as Storage;
  Object.defineProperty(window, "localStorage", {
    value: local,
    configurable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: session,
    configurable: true,
  });
  // Node exposes a read-only `localStorage` global; redefine it as writable.
  Object.defineProperty(globalThis, "localStorage", {
    value: local,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: session,
    writable: true,
    configurable: true,
  });
}
