(function () {
  "use strict";

  const TEST_ID = "test-record";
  const networkStatus = document.querySelector("#network-status");
  const result = document.querySelector("#result");
  const importFile = document.querySelector("#import-file");

  function showResult(message, isError = false) {
    result.textContent = message;
    result.classList.toggle("error", isError);
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    networkStatus.className = `network-status ${online ? "online" : "offline"}`;
    networkStatus.querySelector("span:last-child").textContent = online ? "オンライン" : "オフライン";
  }

  async function run(button, action) {
    button.disabled = true;
    try { await action(); }
    catch (error) { showResult(error instanceof Error ? error.message : "処理に失敗しました。", true); }
    finally { button.disabled = false; }
  }

  document.querySelector("#save-button").addEventListener("click", (event) => run(event.currentTarget, async () => {
    const record = { id: TEST_ID, message: "テストデータです", savedAt: new Date().toISOString() };
    await window.LocalDB.put(record);
    showResult(`保存しました。\n${JSON.stringify(record, null, 2)}`);
  }));

  document.querySelector("#load-button").addEventListener("click", (event) => run(event.currentTarget, async () => {
    const record = await window.LocalDB.get(TEST_ID);
    showResult(record ? `読み込みました。\n${JSON.stringify(record, null, 2)}` : "保存済みのテストデータはありません。");
  }));

  document.querySelector("#export-button").addEventListener("click", (event) => run(event.currentTarget, async () => {
    const records = await window.LocalDB.getAll();
    const payload = { app: "My Local App", version: 1, exportedAt: new Date().toISOString(), records };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `my-local-app-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showResult(`${records.length}件のデータをJSONにエクスポートしました。`);
  }));

  document.querySelector("#import-button").addEventListener("click", () => {
    importFile.value = "";
    importFile.click();
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || payload.app !== "My Local App" || payload.version !== 1 || !Array.isArray(payload.records)) {
        throw new TypeError("My Local Appの有効なバックアップファイルではありません。");
      }
      await window.LocalDB.replaceAll(payload.records);
      showResult(`${payload.records.length}件のデータをインポートしました。`);
    } catch (error) {
      showResult(error instanceof Error ? error.message : "JSONの読み込みに失敗しました。", true);
    }
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const serviceWorkerUrl = new URL("sw.js", document.baseURI);
        await navigator.serviceWorker.register(serviceWorkerUrl, { scope: "./" });
      } catch (error) {
        console.error("Service Workerの登録に失敗しました。", error);
      }
    });
  }
})();
