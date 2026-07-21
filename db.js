(function () {
  "use strict";

  const DB_NAME = "my-local-app";
  const DB_VERSION = 3;
  const STATE_STORE = "appState";
  const PROJECT_STORE = "projects";
  const META_STORE = "appMeta";
  const LEGACY_STATE_ID = "main";
  const WORKSPACE_ID = "workspace";
  const SAMPLE_PROJECT_ID = "sample-project";
  const SIGNED_INCOME_GROUP = "income-signed";
  const MIN_PLAN_SCALE_MAX = 100;
  const DEFAULT_PLAN_SCALE_MAX = 100000;
  const MAX_PLAN_SCALE_MAX = 1000000000;
  const DEFAULT_THEME_ID = "forest";
  const THEME_IDS = new Set(["forest", "ocean", "sapphire", "violet", "plum", "rose", "coral", "amber", "olive", "slate"]);

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
    return Math.min(MAX_PLAN_SCALE_MAX, Math.max(MIN_PLAN_SCALE_MAX, Math.round(amount)));
  }

  function isSignedIncomeCategory(category) {
    return category && category.group === SIGNED_INCOME_GROUP;
  }

  function normalizePlanAmount(category, value) {
    const parsed = Number(value);
    const amount = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    return isSignedIncomeCategory(category) ? amount : Math.max(0, amount);
  }

  function normalizeTransactionAmount(category, value) {
    const parsed = Number(value);
    const amount = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    if (isSignedIncomeCategory(category)) return amount === 0 ? 1 : amount;
    return Math.max(1, amount);
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

  function monthCount(startDate, endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
  }

  function defaultRange(startDate) {
    const start = validDateKey(startDate)
      ? new Date(`${startDate}T00:00:00`)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = monthEnd(addMonths(new Date(start.getFullYear(), start.getMonth(), 1), 35));
    return { startDate: dateKey(start), endDate: dateKey(end) };
  }

  function stateRange(options = {}) {
    const range = defaultRange(options.startDate);
    const startDate = range.startDate;
    const endDate = validDateKey(options.endDate) && options.endDate >= startDate ? options.endDate : range.endDate;
    return { startDate, endDate };
  }

  function createDefaultState(options = {}) {
    const { startDate, endDate } = stateRange(options);
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

    const now = new Date().toISOString();
    return {
      id: String(options.id || LEGACY_STATE_ID),
      schemaVersion: 6,
      settings: {
        closingDay: Math.min(31, Math.max(1, Math.round(Number(options.closingDay) || 31))),
        startDate,
        endDate,
        currency: "JPY",
        themeId: THEME_IDS.has(options.themeId) ? options.themeId : DEFAULT_THEME_ID
      },
      categories,
      plans,
      transactions: [],
      createdAt: now,
      updatedAt: now
    };
  }

  function createEmptyState(options = {}) {
    const { startDate, endDate } = stateRange(options);
    const now = new Date().toISOString();
    return {
      id: String(options.id || LEGACY_STATE_ID),
      schemaVersion: 6,
      settings: {
        closingDay: Math.min(31, Math.max(1, Math.round(Number(options.closingDay) || 31))),
        startDate,
        endDate,
        currency: "JPY",
        themeId: THEME_IDS.has(options.themeId) ? options.themeId : DEFAULT_THEME_ID
      },
      categories: [],
      plans: {},
      transactions: [],
      createdAt: now,
      updatedAt: now
    };
  }

  function createSampleState(options = {}) {
    const state = createDefaultState({ ...options, id: options.id || SAMPLE_PROJECT_ID });
    const start = new Date(`${state.settings.startDate}T00:00:00`);
    const end = new Date(`${state.settings.endDate}T00:00:00`);
    const today = new Date();
    const base = today < start ? start : today > end ? end : today;
    const sampleDate = (daysBefore) => {
      const date = new Date(base);
      date.setDate(date.getDate() - daysBefore);
      return date < start ? state.settings.startDate : dateKey(date);
    };
    const now = new Date().toISOString();
    state.transactions = [
      { id: "sample-income-salary", direction: "income", categoryId: "income-salary", date: sampleDate(7), enteredOn: sampleDate(7), amount: 280000, memo: "サンプル給与", createdAt: now, updatedAt: now },
      { id: "sample-food-1", direction: "expense", categoryId: "expense-food", date: sampleDate(3), enteredOn: sampleDate(3), amount: 2480, memo: "食材", createdAt: now, updatedAt: now },
      { id: "sample-daily-1", direction: "expense", categoryId: "expense-daily", date: sampleDate(2), enteredOn: sampleDate(2), amount: 1280, memo: "日用品", createdAt: now, updatedAt: now },
      { id: "sample-transport-1", direction: "expense", categoryId: "expense-transport", date: sampleDate(1), enteredOn: sampleDate(1), amount: 680, memo: "交通費", createdAt: now, updatedAt: now },
      { id: "sample-rent-1", direction: "expense", categoryId: "expense-rent", date: sampleDate(6), enteredOn: sampleDate(6), amount: 80000, memo: "家賃", createdAt: now, updatedAt: now }
    ];
    return state;
  }

  function normalizeState(value, stateId = LEGACY_STATE_ID) {
    const normalizedId = String(stateId || (value && value.id) || LEGACY_STATE_ID);
    const fallback = createDefaultState({
      id: normalizedId,
      startDate: value && value.settings && value.settings.startDate,
      endDate: value && value.settings && value.settings.endDate,
      closingDay: value && value.settings && value.settings.closingDay,
      themeId: value && value.settings && value.settings.themeId
    });
    if (!value || typeof value !== "object") return fallback;
    const state = {
      ...fallback,
      ...value,
      id: normalizedId,
      schemaVersion: 6,
      settings: { ...fallback.settings, ...(value.settings || {}) },
      categories: Array.isArray(value.categories) ? value.categories : fallback.categories,
      plans: value.plans && typeof value.plans === "object" ? value.plans : fallback.plans,
      transactions: Array.isArray(value.transactions) ? value.transactions : []
    };
    state.settings.closingDay = Math.min(31, Math.max(1, Math.round(Number(state.settings.closingDay) || 31)));
    state.settings.themeId = THEME_IDS.has(state.settings.themeId) ? state.settings.themeId : DEFAULT_THEME_ID;
    if (!validDateKey(state.settings.startDate) || !validDateKey(state.settings.endDate) || new Date(`${state.settings.endDate}T00:00:00`) < new Date(`${state.settings.startDate}T00:00:00`)) {
      state.settings = { ...fallback.settings };
    }
    state.categories.forEach((category, index) => {
      category.id = String(category.id || `category-${index}`);
      category.name = String(category.name || "名称未設定").slice(0, 40);
      category.group = ["variable", "fixed", "income", SIGNED_INCOME_GROUP].includes(category.group) ? category.group : "variable";
      category.color = /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : "#3f7d5b";
      category.order = Number.isFinite(Number(category.order)) ? Number(category.order) : index * 10;
      category.active = category.active !== false;
      category.defaultAmount = normalizePlanAmount(category, category.defaultAmount);
      category.planScaleMax = normalizePlanScaleMax(category.planScaleMax);
      category.dailyBudgetEnabled = category.group === "variable" && (
        typeof category.dailyBudgetEnabled === "boolean"
          ? category.dailyBudgetEnabled
          : category.id === "expense-food"
      );
      if (category.planRule && typeof category.planRule === "object") {
        category.planRule = {
          startMonth: /^\d{4}-\d{2}$/.test(category.planRule.startMonth) ? category.planRule.startMonth : monthKey(new Date()),
          interval: Math.min(36, Math.max(1, Math.round(Number(category.planRule.interval) || 1))),
          amount: normalizePlanAmount(category, category.planRule.amount)
        };
      } else {
        category.planRule = null;
      }
      if (!state.plans[category.id]) state.plans[category.id] = {};
      Object.keys(state.plans[category.id]).forEach((month) => {
        state.plans[category.id][month] = normalizePlanAmount(category, state.plans[category.id][month]);
      });
    });
    state.transactions = state.transactions.filter((transaction) => transaction && typeof transaction === "object").map((transaction, index) => {
      const date = validDateKey(transaction.date) ? transaction.date : dateKey(new Date());
      const createdAt = transaction.createdAt || new Date().toISOString();
      const createdDate = new Date(createdAt);
      const enteredOn = validDateKey(transaction.enteredOn)
        ? transaction.enteredOn
        : (Number.isNaN(createdDate.getTime()) ? date : dateKey(createdDate));
      const category = state.categories.find((item) => String(item.id) === String(transaction.categoryId));
      return {
        id: String(transaction.id || `transaction-${index}`),
        direction: transaction.direction === "income" ? "income" : "expense",
        categoryId: String(transaction.categoryId || ""),
        date,
        enteredOn,
        amount: normalizeTransactionAmount(category, transaction.amount),
        memo: String(transaction.memo || "").slice(0, 500),
        createdAt,
        updatedAt: transaction.updatedAt || new Date().toISOString()
      };
    });
    return state;
  }

  function makeProjectId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return `project-${globalThis.crypto.randomUUID()}`;
    return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeProject(value, state, id = state && state.id) {
    const projectId = String(id || (value && value.id) || LEGACY_STATE_ID);
    const createdAt = value && value.createdAt || state.createdAt || new Date().toISOString();
    return {
      id: projectId,
      stateId: String(value && value.stateId || projectId),
      name: String(value && value.name || "マイプロジェクト").trim().slice(0, 40) || "マイプロジェクト",
      isSample: value && value.isSample === true,
      createdAt,
      updatedAt: value && value.updatedAt || state.updatedAt || createdAt,
      startDate: state.settings.startDate,
      endDate: state.settings.endDate,
      closingDay: state.settings.closingDay
    };
  }

  function sortProjects(projects) {
    return [...projects].sort((left, right) => {
      if (left.isSample !== right.isSample) return left.isSample ? 1 : -1;
      return String(left.createdAt).localeCompare(String(right.createdAt));
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("データベースを開けませんでした。"));
      request.onblocked = () => reject(new Error("別の画面でアプリが開かれています。閉じてから再度お試しください。"));
    });
  }

  function requestFromStore(storeName, mode, operation) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("データの保存に失敗しました。")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("データの保存が中断されました。")); };
      try {
        const request = operation(store);
        if (request) request.onsuccess = () => { result = request.result; };
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }));
  }

  function requestFromStores(storeNames, mode, operation) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("データの保存に失敗しました。")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("データの保存が中断されました。")); };
      try {
        operation(stores);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }));
  }

  function getRecord(storeName, id) {
    return requestFromStore(storeName, "readonly", (store) => store.get(id));
  }

  function getRecords(storeName) {
    return requestFromStore(storeName, "readonly", (store) => store.getAll());
  }

  async function ensureWorkspace() {
    const storedWorkspace = await getRecord(META_STORE, WORKSPACE_ID);
    let projectList = (await getRecords(PROJECT_STORE)).filter((project) => project && project.id && project.stateId);
    if (!storedWorkspace || !projectList.length) {
      const legacy = await getRecord(STATE_STORE, LEGACY_STATE_ID);
      const mainState = normalizeState(legacy, LEGACY_STATE_ID);
      const mainProject = normalizeProject({ id: LEGACY_STATE_ID, stateId: LEGACY_STATE_ID, name: "マイプロジェクト" }, mainState, LEGACY_STATE_ID);
      const sampleState = createSampleState({ id: SAMPLE_PROJECT_ID });
      const sampleProject = normalizeProject({ id: SAMPLE_PROJECT_ID, stateId: SAMPLE_PROJECT_ID, name: "サンプルプロジェクト", isSample: true }, sampleState, SAMPLE_PROJECT_ID);
      const workspace = { id: WORKSPACE_ID, schemaVersion: 1, defaultProjectId: mainProject.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await requestFromStores([STATE_STORE, PROJECT_STORE, META_STORE], "readwrite", (stores) => {
        stores[STATE_STORE].put(mainState);
        stores[STATE_STORE].put(sampleState);
        stores[PROJECT_STORE].put(mainProject);
        stores[PROJECT_STORE].put(sampleProject);
        stores[META_STORE].put(workspace);
      });
      return { workspace, projects: sortProjects([mainProject, sampleProject]) };
    }

    let workspace = { ...storedWorkspace, id: WORKSPACE_ID, schemaVersion: 1 };
    let changed = false;
    if (!projectList.some((project) => project.id === SAMPLE_PROJECT_ID)) {
      const sampleState = createSampleState({ id: SAMPLE_PROJECT_ID });
      const sampleProject = normalizeProject({ id: SAMPLE_PROJECT_ID, stateId: SAMPLE_PROJECT_ID, name: "サンプルプロジェクト", isSample: true }, sampleState, SAMPLE_PROJECT_ID);
      await requestFromStores([STATE_STORE, PROJECT_STORE], "readwrite", (stores) => {
        stores[STATE_STORE].put(sampleState);
        stores[PROJECT_STORE].put(sampleProject);
      });
      projectList.push(sampleProject);
    }
    if (!projectList.some((project) => project.id === workspace.defaultProjectId)) {
      workspace.defaultProjectId = projectList.find((project) => !project.isSample)?.id || projectList[0].id;
      workspace.updatedAt = new Date().toISOString();
      changed = true;
    }
    if (changed) await requestFromStore(META_STORE, "readwrite", (store) => store.put(workspace));
    return { workspace, projects: sortProjects(projectList) };
  }

  async function loadProjectFromWorkspace(projectId, workspace, projectList) {
    const project = projectList.find((item) => item.id === projectId);
    if (!project) throw new Error("選択したプロジェクトが見つかりません。");
    const storedState = await getRecord(STATE_STORE, project.stateId);
    const state = storedState
      ? normalizeState(storedState, project.stateId)
      : (project.isSample ? createSampleState({ id: project.stateId, startDate: project.startDate, endDate: project.endDate, closingDay: project.closingDay }) : createEmptyState({ id: project.stateId, startDate: project.startDate, endDate: project.endDate, closingDay: project.closingDay }));
    if (!storedState) await requestFromStore(STATE_STORE, "readwrite", (store) => store.put(state));
    return { workspace, projects: sortProjects(projectList), project, state };
  }

  async function getWorkspace() {
    const { workspace, projects } = await ensureWorkspace();
    return loadProjectFromWorkspace(workspace.defaultProjectId, workspace, projects);
  }

  async function loadProject(projectId) {
    const { workspace, projects } = await ensureWorkspace();
    return loadProjectFromWorkspace(projectId, workspace, projects);
  }

  async function createProject(input) {
    const name = String(input && input.name || "").trim().slice(0, 40);
    const startDate = String(input && input.startDate || "");
    const endDate = String(input && input.endDate || "");
    if (!name) throw new Error("プロジェクト名を入力してください。");
    if (!validDateKey(startDate) || !validDateKey(endDate) || endDate < startDate) throw new Error("終了日は開始日以降にしてください。");
    if (monthCount(startDate, endDate) > 120) throw new Error("管理期間は最大120ヶ月にしてください。");
    const { workspace, projects } = await ensureWorkspace();
    const id = makeProjectId();
    const state = createEmptyState({ id, startDate, endDate });
    const project = normalizeProject({ id, stateId: id, name, isSample: false }, state, id);
    await requestFromStores([STATE_STORE, PROJECT_STORE], "readwrite", (stores) => {
      stores[STATE_STORE].put(state);
      stores[PROJECT_STORE].put(project);
    });
    return { workspace, projects: sortProjects([...projects, project]), project, state };
  }

  async function setDefaultProject(projectId) {
    const { workspace, projects } = await ensureWorkspace();
    if (!projects.some((project) => project.id === projectId)) throw new Error("選択したプロジェクトが見つかりません。");
    const nextWorkspace = { ...workspace, defaultProjectId: projectId, updatedAt: new Date().toISOString() };
    await requestFromStore(META_STORE, "readwrite", (store) => store.put(nextWorkspace));
    return { workspace: nextWorkspace, projects };
  }

  async function renameProject(projectId, nameInput) {
    const { workspace, projects } = await ensureWorkspace();
    const id = String(projectId || "");
    const project = projects.find((item) => item.id === id);
    const name = String(nameInput || "").trim().slice(0, 40);
    if (!project) throw new Error("選択したプロジェクトが見つかりません。");
    if (project.isSample) throw new Error("サンプルプロジェクトの名前は変更できません。");
    if (!name) throw new Error("プロジェクト名を入力してください。");
    const renamed = { ...project, name, updatedAt: new Date().toISOString() };
    await requestFromStore(PROJECT_STORE, "readwrite", (store) => store.put(renamed));
    return { workspace, projects: sortProjects(projects.map((item) => item.id === id ? renamed : item)), project: renamed };
  }

  async function deleteProject(projectId) {
    const { workspace, projects } = await ensureWorkspace();
    const id = String(projectId || "");
    const project = projects.find((item) => item.id === id);
    if (!project) throw new Error("選択したプロジェクトが見つかりません。");
    if (project.isSample) throw new Error("サンプルプロジェクトは削除できません。");
    const remaining = projects.filter((item) => item.id !== id);
    if (!remaining.length) throw new Error("最後のプロジェクトは削除できません。");
    const fallback = remaining.find((item) => !item.isSample) || remaining[0];
    const nextDefaultProjectId = workspace.defaultProjectId === id ? fallback.id : workspace.defaultProjectId;
    const activeProjectId = remaining.some((item) => item.id === nextDefaultProjectId) ? nextDefaultProjectId : fallback.id;
    const nextWorkspace = { ...workspace, defaultProjectId: activeProjectId, updatedAt: new Date().toISOString() };
    await requestFromStores([STATE_STORE, PROJECT_STORE, META_STORE], "readwrite", (stores) => {
      stores[STATE_STORE].delete(project.stateId);
      stores[PROJECT_STORE].delete(project.id);
      stores[META_STORE].put(nextWorkspace);
    });
    return { workspace: nextWorkspace, projects: sortProjects(remaining), activeProjectId };
  }

  async function saveState(state, projectId) {
    const { workspace, projects } = await ensureWorkspace();
    const id = String(projectId || workspace.defaultProjectId);
    const project = projects.find((item) => item.id === id);
    if (!project) throw new Error("保存先のプロジェクトが見つかりません。");
    const normalized = normalizeState(JSON.parse(JSON.stringify(state)), project.stateId);
    normalized.updatedAt = new Date().toISOString();
    const nextProject = normalizeProject({ ...project, updatedAt: normalized.updatedAt }, normalized, project.id);
    await requestFromStores([STATE_STORE, PROJECT_STORE], "readwrite", (stores) => {
      stores[STATE_STORE].put(normalized);
      stores[PROJECT_STORE].put(nextProject);
    });
    return normalized;
  }

  async function resetProject(projectId) {
    const { workspace, projects } = await ensureWorkspace();
    const id = String(projectId || workspace.defaultProjectId);
    const project = projects.find((item) => item.id === id);
    if (!project) throw new Error("初期化するプロジェクトが見つかりません。");
    const state = project.isSample
      ? createSampleState({ id: project.stateId, startDate: project.startDate, endDate: project.endDate, closingDay: project.closingDay })
      : createEmptyState({ id: project.stateId, startDate: project.startDate, endDate: project.endDate, closingDay: project.closingDay });
    return saveState(state, project.id);
  }

  const BudgetDB = {
    getWorkspace,
    async listProjects() {
      const { projects } = await ensureWorkspace();
      return projects;
    },
    loadProject,
    createProject,
    setDefaultProject,
    renameProject,
    deleteProject,
    saveState,
    resetProject,
    async getState(projectId) {
      return projectId ? (await loadProject(projectId)).state : (await getWorkspace()).state;
    },
    async reset(projectId) {
      return resetProject(projectId);
    },
    createDefaultState,
    createEmptyState,
    createSampleState,
    monthsBetween
  };

  window.BudgetDB = Object.freeze(BudgetDB);
})();
