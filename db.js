(function () {
  "use strict";

  const DB_NAME = "my-local-app";
  const DB_VERSION = 2;
  const STORE_NAME = "appState";
  const STATE_ID = "main";
  const PLAN_SCALE_STEP = 100;
  const DEFAULT_PLAN_SCALE_MAX = 100000;
  const MAX_PLAN_SCALE_MAX = 1000000000;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function addMonths(date, count) {
    return new Date(date.getFullYear(), date.getMonth() + count, 1);
  }

  function monthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function validDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && dateKey(date) === value;
  }

  function normalizePlanScaleMax(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_PLAN_SCALE_MAX;
    return Math.min(MAX_PLAN_SCALE_MAX, Math.max(PLAN_SCALE_STEP, Math.round(amount / PLAN_SCALE_STEP) * PLAN_SCALE_STEP));
  }

  function monthsBetween(startDate, endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const months = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= finalMonth && months.length < 120) {
      months.push(monthKey(cursor));
      cursor = addMonths(cursor, 1);
    }
    return months;
  }

  function createDefaultState() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = monthEnd(addMonths(start, 35));
    const startDate = dateKey(start);
    const endDate = dateKey(end);
    const months = monthsBetween(startDate, endDate);

    const categories = [
      { id: "expense-food", name: "食費", group: "variable", color: "#e4773d", order: 10, active: true, defaultAmount: 45000 },
      { id: "expense-daily", name: "日用品", group: "variable", color: "#cc9a34", order: 20, active: true, defaultAmount: 10000 },
      { id: "expense-medical", name: "医療費", group: "variable", color: "#c85f6a", order: 30, active: true, defaultAmount: 8000 },
      { id: "expense-transport", name: "交通費", group: "variable", color: "#4b86a8", order: 40, active: true, defaultAmount: 12000 },
      { id: "expense-fun", name: "娯楽費", group: "variable", color: "#805ea3", order: 50, active: true, defaultAmount: 15000 },
      { id: "expense-rent", name: "住居費", group: "fixed", color: "#49725d", order: 60, active: true, defaultAmount: 80000 },
      { id: "expense-phone", name: "通信費", group: "fixed", color: "#4f718d", order: 70, active: true, defaultAmount: 8000 },
      { id: "expense-insurance", name: "保険", group: "fixed", color: "#6f6e9c", order: 80, active: true, defaultAmount: 12000 },
      { id: "income-salary", name: "給与", group: "income", color: "#2b8a63", order: 90, active: true, defaultAmount: 280000 },
      { id: "income-bonus", name: "賞与", group: "income", color: "#398b8c", order: 100, active: true, defaultAmount: 0 },
      { id: "income-other", name: "その他収入", group: "income", color: "#5a80b7", order: 110, active: true, defaultAmount: 0 }
    ].map((category) => ({
      ...category,
      planScaleMax: DEFAULT_PLAN_SCALE_MAX,
      dailyBudgetEnabled: category.id === "expense-food"
    }));

    const plans = {};
    categories.forEach((category) => {
      plans[category.id] = {};
      months.forEach((month) => {
        plans[category.id][month] = category.defaultAmount;
      });
    });

    return {
      id: STATE_ID,
      schemaVersion: 4,
      settings: {
        closingDay: 31,
        startDate,
        endDate,
        currency: "JPY"
      },
      categories,
      plans,
      transactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeState(value) {
    const fallback = createDefaultState();
    if (!value || typeof value !== "object") return fallback;
    const state = {
      ...fallback,
      ...value,
      id: STATE_ID,
      schemaVersion: 4,
      settings: { ...fallback.settings, ...(value.settings || {}) },
      categories: Array.isArray(value.categories) ? value.categories : fallback.categories,
      plans: value.plans && typeof value.plans === "object" ? value.plans : fallback.plans,
      transactions: Array.isArray(value.transactions) ? value.transactions : []
    };
    state.settings.closingDay = Math.min(31, Math.max(1, Math.round(Number(state.settings.closingDay) || 31)));
    if (!validDateKey(state.settings.startDate) || !validDateKey(state.settings.endDate) || new Date(`${state.settings.endDate}T00:00:00`) < new Date(`${state.settings.startDate}T00:00:00`)) {
      state.settings = { ...fallback.settings };
    }
    state.categories.forEach((category, index) => {
      category.id = String(category.id || `category-${index}`);
      category.name = String(category.name || "名称未設定").slice(0, 40);
      category.group = ["variable", "fixed", "income"].includes(category.group) ? category.group : "variable";
      category.color = /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : "#3f7d5b";
      category.order = Number.isFinite(Number(category.order)) ? Number(category.order) : index * 10;
      category.active = category.active !== false;
      category.defaultAmount = Math.max(0, Math.round(Number(category.defaultAmount) || 0));
      category.planScaleMax = normalizePlanScaleMax(category.planScaleMax);
      category.dailyBudgetEnabled = category.group !== "income" && (
        typeof category.dailyBudgetEnabled === "boolean"
          ? category.dailyBudgetEnabled
          : category.id === "expense-food"
      );
      if (category.planRule && typeof category.planRule === "object") {
        category.planRule = {
          startMonth: /^\d{4}-\d{2}$/.test(category.planRule.startMonth) ? category.planRule.startMonth : monthKey(new Date()),
          interval: Math.min(36, Math.max(1, Math.round(Number(category.planRule.interval) || 1))),
          amount: Math.max(0, Math.round(Number(category.planRule.amount) || 0))
        };
      } else {
        category.planRule = null;
      }
      if (!state.plans[category.id]) state.plans[category.id] = {};
    });
    state.transactions = state.transactions.filter((transaction) => transaction && typeof transaction === "object").map((transaction, index) => ({
      id: String(transaction.id || `transaction-${index}`),
      direction: transaction.direction === "income" ? "income" : "expense",
      categoryId: String(transaction.categoryId || ""),
      date: validDateKey(transaction.date) ? transaction.date : dateKey(new Date()),
      amount: Math.max(1, Math.round(Number(transaction.amount) || 1)),
      memo: String(transaction.memo || "").slice(0, 500),
      createdAt: transaction.createdAt || new Date().toISOString(),
      updatedAt: transaction.updatedAt || new Date().toISOString()
    }));
    return state;
  }

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
      request.onerror = () => reject(request.error || new Error("データベースを開けませんでした。"));
      request.onblocked = () => reject(new Error("別の画面でアプリが開かれています。閉じてから再度お試しください。"));
    });
  }

  async function requestFromStore(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("保存処理に失敗しました。")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("保存処理が中断されました。")); };
      try {
        const request = operation(store);
        if (request) request.onsuccess = () => { result = request.result; };
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  const BudgetDB = {
    async getState() {
      const stored = await requestFromStore("readonly", (store) => store.get(STATE_ID));
      if (stored) return normalizeState(stored);
      const initial = createDefaultState();
      await this.saveState(initial);
      return initial;
    },

    async saveState(state) {
      const normalized = normalizeState(JSON.parse(JSON.stringify(state)));
      normalized.updatedAt = new Date().toISOString();
      await requestFromStore("readwrite", (store) => store.put(normalized));
      return normalized;
    },

    async reset() {
      const initial = createDefaultState();
      await this.saveState(initial);
      return initial;
    },

    createDefaultState,
    monthsBetween
  };

  window.BudgetDB = Object.freeze(BudgetDB);
})();
