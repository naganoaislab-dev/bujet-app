(function () {
  "use strict";

  const DB_NAME = "my-local-app";
  const DB_VERSION = 1;
  const STORE_NAME = "records";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("データベースの更新がブロックされました。"));
    });
  }

  async function withStore(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;

      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("処理が中断されました。")); };

      try {
        const request = operation(store);
        if (request) {
          request.onsuccess = () => { result = request.result; };
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  const LocalDB = {
    put(record) { return withStore("readwrite", (store) => store.put(record)); },
    get(id) { return withStore("readonly", (store) => store.get(id)); },
    getAll() { return withStore("readonly", (store) => store.getAll()); },
    async replaceAll(records) {
      if (!Array.isArray(records)) throw new TypeError("インポートデータは配列である必要があります。");
      return withStore("readwrite", (store) => {
        store.clear();
        records.forEach((record) => {
          if (!record || typeof record !== "object" || typeof record.id !== "string") {
            throw new TypeError("各データには文字列のidが必要です。");
          }
          store.put(record);
        });
      });
    }
  };

  window.LocalDB = Object.freeze(LocalDB);
})();
