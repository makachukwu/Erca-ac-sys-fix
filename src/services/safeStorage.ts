/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure in-memory runtime cache only.
// NO local storage (window.localStorage / sessionStorage) is permitted as Firestore is the sole source of truth.
const memoryStore: Record<string, string> = {};

export const safeStorage = {
  getItem: (key: string): string | null => {
    return memoryStore[key] ?? null;
  },

  setItem: (key: string, value: string): void => {
    memoryStore[key] = value;
  },

  removeItem: (key: string): void => {
    delete memoryStore[key];
  },

  clear: (): void => {
    for (const key of Object.keys(memoryStore)) {
      delete memoryStore[key];
    }
  },
};
