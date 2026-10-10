import type { SpeechModelStorage } from "./models.ts";

/** Lazy opening keeps SSR and importing the package free of browser side effects. */
export class IndexedDbSpeechModelStorage implements SpeechModelStorage {
  private database?: Promise<IDBDatabase>;
  private open() {
    return this.database ??= new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open("spndrr-speech-models", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("assets");
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); this.database = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { this.database = undefined; reject(request.error); };
      request.onblocked = () => {
        blocked = true;
        this.database = undefined;
        reject(new Error("Close other Spndrr tabs to upgrade model storage."));
      };
    });
  }
  private async transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("assets", mode);
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Model storage transaction failed."));
      action(transaction.objectStore("assets"), value => { result = value; });
    });
  }
  get<T>(key: string) {
    return this.transaction<T | undefined>("readonly", (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => result(request.result as T | undefined);
    });
  }
  put<T>(key: string, value: T) { return this.transaction<void>("readwrite", store => { store.put(value, key); }); }
  removePrefix(prefix: string) {
    return this.transaction<void>("readwrite", store => {
      const request = store.openCursor(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    });
  }
  list<T>(prefix: string) {
    return this.transaction<T[]>("readonly", (store, result) => {
      const request = store.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      request.onsuccess = () => result(request.result as T[]);
    });
  }
}
