(function () {
  "use strict";

  const APP_NAME = "Budget Minus";
  const APP_VERSION = "0.5.17";
  const BACKUP_VERSION = 2;
  const PLAN_AMOUNT_STEP = 100;
  const PLAN_BAR_MEDIUM_STEP = 1000;
  const PLAN_BAR_LARGE_STEP = 10000;
  const PLAN_BAR_MEDIUM_SCALE = 10000;
  const PLAN_BAR_LARGE_SCALE = 100000;
  const DEFAULT_PLAN_SCALE_MAX = 100000;
  const MAX_PLAN_SCALE_MAX = 1000000000;
  const MILLISECONDS_PER_DAY = 86400000;
  const THEME_PRESETS = Object.freeze([
    { id: "forest", name: "フォレスト", primary: "#2f7554", strong: "#205c40", soft: "#dcebe1", page: "#f4f8f5", dark: "#101713" },
    { id: "ocean", name: "オーシャン", primary: "#2c7191", strong: "#1e5874", soft: "#daecf3", page: "#f1f7f9", dark: "#10171a" },
    { id: "sapphire", name: "サファイア", primary: "#3f63c5", strong: "#2f4d9d", soft: "#e0e7fb", page: "#f3f5fc", dark: "#111522" },
    { id: "violet", name: "バイオレット", primary: "#7657a8", strong: "#59407f", soft: "#ebe3f6", page: "#f7f4fb", dark: "#18131f" },
    { id: "plum", name: "プラム", primary: "#996080", strong: "#743f5e", soft: "#f4e1ea", page: "#faf5f7", dark: "#1d1218" },
    { id: "rose", name: "ローズ", primary: "#b65672", strong: "#8c3b55", soft: "#f8e0e8", page: "#fdf4f6", dark: "#211217" },
    { id: "coral", name: "コーラル", primary: "#c76547", strong: "#9a4630", soft: "#fae3db", page: "#fdf5f1", dark: "#21150f" },
    { id: "amber", name: "アンバー", primary: "#aa711e", strong: "#805316", soft: "#f8e9cc", page: "#fdf9ee", dark: "#20180c" },
    { id: "olive", name: "オリーブ", primary: "#6a7d37", strong: "#506026", soft: "#e8eddb", page: "#f7faef", dark: "#171c0d" },
    { id: "slate", name: "スレート", primary: "#566d7e", strong: "#405362", soft: "#e0e9ed", page: "#f4f8fa", dark: "#12191d" }
  ]);
  const VIEW_TITLES = {
    entry: "支出入力",
    overview: "状況確認",
    analysis: "分析",
    settings: "設定",
    data: "データ管理"
  };

  const viewHost = document.querySelector("#view-host");
  const screenTitle = document.querySelector("#screen-title");
  const activeProjectName = document.querySelector("#active-project-name");
  const networkStatus = document.querySelector("#network-status");
  const toast = document.querySelector("#toast");
  const importFile = document.querySelector("#import-file");
  const calculatorDialog = document.querySelector("#calculator-dialog");
  const memoDialog = document.querySelector("#memo-dialog");
  const transactionDialog = document.querySelector("#transaction-dialog");
  const categoryDialog = document.querySelector("#category-dialog");
  const planDialog = document.querySelector("#plan-dialog");
  const versionDialog = document.querySelector("#version-dialog");
  const resetDialog = document.querySelector("#reset-dialog");
  const monthlyPlanEditor = document.querySelector("#monthly-plan-editor");
  const themeColorLight = document.querySelector("#theme-color-light");
  const themeColorDark = document.querySelector("#theme-color-dark");

  let state;
  let currentProject = null;
  let projects = [];
  let defaultProjectId = "";
  let currentView = "entry";
  let currentPeriod = "";
  let analysisPeriod = "";
  let analysisMode = "expense";
  let cumulativeChartSelectedIndex = null;
  let settingsPane = "basic";
  let incomeExpanded = false;
  let allTransactionsShown = false;
  let pendingTransaction = null;
  let editingPlanCategoryId = null;
  let planDraft = null;
  let planRuleDraft = null;
  let planScaleDraft = DEFAULT_PLAN_SCALE_MAX;
  let planPointerGesture = null;
  let expenseReorderGesture = null;
  let expenseReorderSuppressClickUntil = 0;
  let selectedPlanMonth = null;
  let toastTimer = null;
  let calculatorContext = null;
  let calculator = createCalculatorState();
  let lastRenderedDate = "";

  const currencyFormatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  });
  const compactFormatter = new Intl.NumberFormat("ja-JP", {
    notation: "compact",
    maximumFractionDigits: 1
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function themePresetFor(themeId) {
    return THEME_PRESETS.find((preset) => preset.id === themeId) || THEME_PRESETS[0];
  }

  function applyThemePreset(preset) {
    document.documentElement.dataset.theme = preset.id;
    if (themeColorLight) themeColorLight.content = preset.page;
    if (themeColorDark) themeColorDark.content = preset.dark;
  }

  function applyTheme() {
    applyThemePreset(themePresetFor(state && state.settings && state.settings.themeId));
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function toInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  function roundAmountToStep(value, step) {
    const normalizedStep = Math.max(1, toInteger(step, 1));
    return Math.max(0, Math.round(toInteger(value) / normalizedStep) * normalizedStep);
  }

  function normalizePlanScaleMax(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_PLAN_SCALE_MAX;
    return clamp(Math.round(amount / PLAN_AMOUNT_STEP) * PLAN_AMOUNT_STEP, PLAN_AMOUNT_STEP, MAX_PLAN_SCALE_MAX);
  }

  function planBarStep(scaleMaximum = planScaleDraft) {
    const normalizedScale = normalizePlanScaleMax(scaleMaximum);
    if (normalizedScale >= PLAN_BAR_LARGE_SCALE) return PLAN_BAR_LARGE_STEP;
    if (normalizedScale >= PLAN_BAR_MEDIUM_SCALE) return PLAN_BAR_MEDIUM_STEP;
    return PLAN_AMOUNT_STEP;
  }

  function planBarPositionAmount(amount, scaleMaximum = planScaleDraft) {
    const maximum = Math.max(PLAN_AMOUNT_STEP, normalizePlanScaleMax(scaleMaximum));
    return clamp(roundAmountToStep(Math.max(0, toInteger(amount)), planBarStep(maximum)), 0, maximum);
  }

  function planBarHeight(amount, scaleMaximum = planScaleDraft) {
    const displayedAmount = planBarPositionAmount(amount, scaleMaximum);
    if (displayedAmount <= 0) return 0;
    return clamp((displayedAmount / Math.max(PLAN_AMOUNT_STEP, scaleMaximum)) * 100, 0, 100);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseLocalDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function utcDayNumber(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY);
  }

  function inclusiveDaysBetween(startDate, endDate) {
    return Math.max(1, utcDayNumber(endDate) - utcDayNumber(startDate) + 1);
  }

  function isValidDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = parseLocalDate(value);
    return !Number.isNaN(date.getTime()) && localDateKey(date) === value;
  }

  function isValidMonthKey(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})$/);
    return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
  }

  function monthParts(month) {
    const [year, value] = month.split("-").map(Number);
    return { year, month: value };
  }

  function monthLabel(month, includeYear = true) {
    const parts = monthParts(month);
    return includeYear ? `${parts.year}年${parts.month}月度` : `${parts.month}月度`;
  }

  function shortDate(value) {
    const date = parseLocalDate(value);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function dateTimeLabel(value) {
    const date = parseLocalDate(value);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function projectDateLabel(value) {
    if (!isValidDateKey(value)) return "未設定";
    const date = parseLocalDate(value);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function projectEndDateForStart(startDate) {
    if (!isValidDateKey(startDate)) return "";
    const end = parseLocalDate(startDate);
    end.setFullYear(end.getFullYear() + 3);
    end.setDate(end.getDate() - 1);
    return localDateKey(end);
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function addMonthsToKey(month, count) {
    const parts = monthParts(month);
    const date = new Date(parts.year, parts.month - 1 + count, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function monthDistance(fromMonth, toMonth) {
    const from = monthParts(fromMonth);
    const to = monthParts(toMonth);
    return (to.year - from.year) * 12 + (to.month - from.month);
  }

  function generatedPlanAmount(category, month) {
    const rule = category.planRule;
    if (!rule) return Math.max(0, toInteger(category.defaultAmount));
    const distance = monthDistance(rule.startMonth, month);
    return distance >= 0 && distance % Math.max(1, toInteger(rule.interval, 1)) === 0 ? Math.max(0, toInteger(rule.amount)) : 0;
  }

  function periodMonths() {
    const firstMonth = periodForDate(state.settings.startDate);
    const lastMonth = periodForDate(state.settings.endDate);
    const months = [];
    let cursor = firstMonth;
    while (cursor <= lastMonth && months.length < 121) {
      months.push(cursor);
      cursor = addMonthsToKey(cursor, 1);
    }
    return months;
  }

  function closingDateForMonth(month) {
    const parts = monthParts(month);
    const day = Math.min(Number(state.settings.closingDay), daysInMonth(parts.year, parts.month));
    return `${parts.year}-${pad(parts.month)}-${pad(day)}`;
  }

  function periodRange(month) {
    let end = closingDateForMonth(month);
    const previousEnd = parseLocalDate(closingDateForMonth(addMonthsToKey(month, -1)));
    previousEnd.setDate(previousEnd.getDate() + 1);
    let start = localDateKey(previousEnd);
    const months = periodMonths();
    if (month === months[0] && start < state.settings.startDate) start = state.settings.startDate;
    if (month === months[months.length - 1] && end > state.settings.endDate) end = state.settings.endDate;
    return { start, end };
  }

  function periodForDateWithClosingDay(dateValue, closingDay) {
    const date = parseLocalDate(dateValue);
    const month = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    const effectiveClosingDay = Math.min(Number(closingDay), daysInMonth(date.getFullYear(), date.getMonth() + 1));
    return date.getDate() > effectiveClosingDay ? addMonthsToKey(month, 1) : month;
  }

  function periodForDate(dateValue) {
    return periodForDateWithClosingDay(dateValue, state.settings.closingDay);
  }

  function periodCountForSettings(settings) {
    const firstMonth = periodForDateWithClosingDay(settings.startDate, settings.closingDay);
    const lastMonth = periodForDateWithClosingDay(settings.endDate, settings.closingDay);
    return monthDistance(firstMonth, lastMonth) + 1;
  }

  function currentPeriodForToday() {
    const months = periodMonths();
    if (!months.length) return "";
    const todayPeriod = periodForDate(localDateKey());
    if (todayPeriod < months[0]) return months[0];
    if (todayPeriod > months[months.length - 1]) return months[months.length - 1];
    return todayPeriod;
  }

  function categoryById(id) {
    return state.categories.find((category) => category.id === id);
  }

  function categoriesForGroup(group, includeArchived = false) {
    return state.categories
      .filter((category) => category.group === group && (includeArchived || category.active !== false))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function expenseCategoriesForReporting(month) {
    return state.categories
      .filter((category) => category.group !== "income" && (category.active !== false || actualAmount(category.id, month) > 0))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function incomeCategoriesForReporting(month) {
    return state.categories
      .filter((category) => category.group === "income" && (category.active !== false || planAmount(category.id, month) > 0 || actualAmount(category.id, month) > 0))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function isIncomeCategory(category) {
    return category && category.group === "income";
  }

  function directionForCategory(category) {
    return isIncomeCategory(category) ? "income" : "expense";
  }

  function planAmount(categoryId, month) {
    return Math.max(0, toInteger(state.plans[categoryId] && state.plans[categoryId][month], 0));
  }

  function periodPlanTotal(categoryId) {
    return periodMonths().reduce((sum, month) => sum + planAmount(categoryId, month), 0);
  }

  function activeExpensePlanAmount(category, month) {
    return category && category.group !== "income" && category.active !== false ? planAmount(category.id, month) : 0;
  }

  function transactionsForMonth(month, direction = null) {
    return state.transactions.filter((transaction) => {
      if (direction && transaction.direction !== direction) return false;
      if (transaction.date < state.settings.startDate || transaction.date > state.settings.endDate) return false;
      return periodForDate(transaction.date) === month;
    });
  }

  function actualAmount(categoryId, month) {
    return transactionsForMonth(month)
      .filter((transaction) => transaction.categoryId === categoryId)
      .reduce((sum, transaction) => sum + toInteger(transaction.amount), 0);
  }

  function carryAmount(categoryId, month) {
    const category = categoryById(categoryId);
    if (!category || isIncomeCategory(category)) return 0;
    const months = periodMonths();
    const endIndex = months.indexOf(month);
    if (endIndex <= 0) return 0;
    let carry = 0;
    for (let index = 0; index < endIndex; index += 1) {
      const period = months[index];
      carry += planAmount(categoryId, period) - actualAmount(categoryId, period);
    }
    return carry;
  }

  function categoryBudgetStats(categoryId, month) {
    const configuredPlan = planAmount(categoryId, month);
    const priorCarry = carryAmount(categoryId, month);
    const actual = actualAmount(categoryId, month);
    const debtAppliedToPlan = Math.min(configuredPlan, Math.max(0, -priorCarry));
    const plan = configuredPlan - debtAppliedToPlan;
    const carry = priorCarry + debtAppliedToPlan;
    const monthlyRemaining = plan - actual;
    const carryRemaining = carry - Math.max(0, actual - plan);
    return { configuredPlan, priorCarry, plan, carry, actual, monthlyRemaining, carryRemaining, remaining: monthlyRemaining + carry };
  }

  function dailyBudgetStats(category, month) {
    if (!category || category.group !== "variable" || category.dailyBudgetEnabled !== true) return null;
    const today = localDateKey();
    const range = periodRange(month);
    const stats = categoryBudgetStats(category.id, month);
    const daysRemaining = inclusiveDaysBetween(today, range.end);
    const spentToday = transactionsForMonth(month)
      .filter((transaction) => transaction.categoryId === category.id && transaction.enteredOn === today)
      .reduce((sum, transaction) => sum + toInteger(transaction.amount), 0);
    const dailyStartingBudget = Math.floor((stats.monthlyRemaining + spentToday) / daysRemaining);
    return {
      ...stats,
      daysRemaining,
      dailyRemaining: dailyStartingBudget - spentToday,
      dailyLabel: "今日の残り予算",
      daysLabel: `締日まで残り${daysRemaining}日`
    };
  }

  function aggregateMonth(month) {
    const expenseCategories = expenseCategoriesForReporting(month);
    const incomeCategories = incomeCategoriesForReporting(month);
    const expensePlan = expenseCategories.reduce((sum, category) => sum + activeExpensePlanAmount(category, month), 0);
    const incomePlan = incomeCategories.reduce((sum, category) => sum + planAmount(category.id, month), 0);
    const expenseActual = transactionsForMonth(month, "expense").reduce((sum, item) => sum + toInteger(item.amount), 0);
    const incomeActual = transactionsForMonth(month, "income").reduce((sum, item) => sum + toInteger(item.amount), 0);
    return {
      month,
      expensePlan,
      incomePlan,
      expenseActual,
      incomeActual,
      plannedNet: incomePlan - expensePlan,
      actualNet: incomeActual - expenseActual
    };
  }

  function formatCurrency(value) {
    return currencyFormatter.format(toInteger(value));
  }

  function formatSignedCurrency(value) {
    const amount = toInteger(value);
    if (amount === 0) return formatCurrency(0);
    return `${amount > 0 ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
  }

  function remainingAmountLabel(value) {
    const amount = toInteger(value);
    return amount < 0 ? `${formatCurrency(Math.abs(amount))} 超過` : formatCurrency(amount);
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function monthOptions(selected) {
    return periodMonths().map((month) => `<option value="${month}"${month === selected ? " selected" : ""}>${monthLabel(month)}</option>`).join("");
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    networkStatus.className = `network-pill ${online ? "online" : "offline"}`;
    networkStatus.querySelector("span:last-child").textContent = online ? "オンライン" : "オフライン";
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function syncCurrentProjectPeriod() {
    if (!currentProject) return;
    currentProject = {
      ...currentProject,
      startDate: state.settings.startDate,
      endDate: state.settings.endDate,
      closingDay: state.settings.closingDay
    };
    projects = projects.map((project) => project.id === currentProject.id ? currentProject : project);
  }

  function applyLoadedProject(loaded) {
    currentProject = loaded.project;
    projects = loaded.projects;
    defaultProjectId = loaded.workspace.defaultProjectId;
    state = loaded.state;
    applyTheme();
    currentPeriod = currentPeriodForToday();
    analysisPeriod = currentPeriod;
    incomeExpanded = false;
    allTransactionsShown = false;
  }

  async function loadSelectedProject() {
    const projectId = document.querySelector("#project-load-select").value;
    if (!projectId) return;
    const loaded = await window.BudgetDB.loadProject(projectId);
    applyLoadedProject(loaded);
    settingsPane = "projects";
    render();
    showToast(`${currentProject.name}を読み込みました`);
  }

  async function setCurrentProjectAsDefault() {
    if (!currentProject) return;
    const result = await window.BudgetDB.setDefaultProject(currentProject.id);
    projects = result.projects;
    defaultProjectId = result.workspace.defaultProjectId;
    render();
    showToast(`${currentProject.name}を既定のプロジェクトにしました`);
  }

  async function createAndLoadProject() {
    const name = document.querySelector("#project-name-input").value;
    const startDate = document.querySelector("#project-start-date").value;
    const endDate = document.querySelector("#project-end-date").value;
    const created = await window.BudgetDB.createProject({ name, startDate, endDate });
    applyLoadedProject(await window.BudgetDB.loadProject(created.project.id));
    settingsPane = "projects";
    render();
    showToast(`${currentProject.name}を作成して読み込みました`);
  }

  async function renameCurrentProject() {
    if (!currentProject || currentProject.isSample) return;
    const name = document.querySelector("#project-current-name").value;
    const result = await window.BudgetDB.renameProject(currentProject.id, name);
    currentProject = result.project;
    projects = result.projects;
    render();
    showToast("プロジェクト名を変更しました");
  }

  async function toggleExpenseCategoryActive(categoryId) {
    const category = categoryById(categoryId);
    if (!category || category.group === "income") return;
    const willEnable = category.active === false;
    category.active = willEnable;
    category.archivedAt = willEnable ? null : localDateKey();
    await persist(`${category.name}を${willEnable ? "有効" : "無効"}にしました`);
    render();
  }

  async function deleteCurrentProject() {
    if (!currentProject || currentProject.isSample) return;
    const project = currentProject;
    if (!window.confirm(`「${project.name}」と、その計画・実績をすべて削除します。元に戻せません。削除しますか？`)) return;
    const result = await window.BudgetDB.deleteProject(project.id);
    applyLoadedProject(await window.BudgetDB.loadProject(result.activeProjectId));
    settingsPane = "projects";
    render();
    showToast(`${project.name}を削除しました`);
  }

  async function persist(message = "保存しました") {
    state = await window.BudgetDB.saveState(state, currentProject && currentProject.id);
    syncCurrentProjectPeriod();
    showToast(message);
  }

  async function resetCurrentProject() {
    closeDialog(resetDialog);
    state = await window.BudgetDB.resetProject(currentProject && currentProject.id);
    syncCurrentProjectPeriod();
    currentPeriod = currentPeriodForToday();
    analysisPeriod = currentPeriod;
    render();
    showToast("初期データへ戻しました");
  }

  function render() {
    lastRenderedDate = localDateKey();
    screenTitle.textContent = VIEW_TITLES[currentView];
    if (activeProjectName) activeProjectName.textContent = currentProject ? currentProject.name : "プロジェクトを読み込み中";
    document.querySelectorAll(".nav-button").forEach((button) => {
      const active = button.dataset.view === currentView;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (currentView === "entry") renderEntry();
    else if (currentView === "overview") renderOverview();
    else if (currentView === "analysis") renderAnalysis();
    else if (currentView === "settings") renderSettings();
    else renderData();
  }

  function renderEntry() {
    const range = periodRange(currentPeriod);
    const monthStats = aggregateMonth(currentPeriod);
    const expenseCategories = [
      ...categoriesForGroup("variable"),
      ...categoriesForGroup("fixed")
    ];
    const available = expenseCategories.reduce((sum, category) => sum + categoryBudgetStats(category.id, currentPeriod).remaining, 0);
    const allTransactions = transactionsForMonth(currentPeriod).sort((a, b) => b.date.localeCompare(a.date) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const recent = allTransactionsShown ? allTransactions : allTransactions.slice(0, 8);

    viewHost.innerHTML = `<div class="view-stack">
      <section class="card period-card" aria-label="対象期間">
        <div>
          <p>${shortDate(range.start)}〜${shortDate(range.end)}・${state.settings.closingDay}日締め</p>
          <strong>${monthLabel(currentPeriod)}</strong>
        </div>
        <div class="period-total">
          <p>使える残予算</p>
          <strong class="${available < 0 ? "negative" : ""}">${formatCurrency(available)}</strong>
        </div>
      </section>

      <div class="month-switcher">
        <label class="field-label" for="entry-period">表示する月</label>
        <select id="entry-period">${monthOptions(currentPeriod)}</select>
      </div>

      <section class="section" aria-labelledby="variable-title">
        <div class="section-header"><div><p class="section-kicker">VARIABLE</p><h2 id="variable-title">変動支出</h2></div><p class="section-description">タップで入力・長押しで並べ替え</p></div>
        <div class="category-grid reorderable-category-grid" data-reorder-group="variable" aria-label="変動支出の並び順">${renderBudgetCards(categoriesForGroup("variable"), currentPeriod)}</div>
      </section>

      <section class="section" aria-labelledby="fixed-title">
        <div class="section-header"><div><p class="section-kicker">FIXED</p><h2 id="fixed-title">固定支出</h2></div><p class="section-description">タップで入力・長押しで並べ替え</p></div>
        <div class="category-grid reorderable-category-grid" data-reorder-group="fixed" aria-label="固定支出の並び順">${renderBudgetCards(categoriesForGroup("fixed"), currentPeriod)}</div>
      </section>

      <section class="income-entry-card">
        <div><strong>収入実績を記録</strong><p>給与・賞与などを状況グラフへ反映します。</p></div>
        <button type="button" class="button small primary" data-action="toggle-income">${incomeExpanded ? "閉じる" : "収入を入力"}</button>
      </section>
      ${incomeExpanded ? `<section class="section"><div class="category-grid">${renderIncomeCards(currentPeriod)}</div></section>` : ""}

      <section class="section" aria-labelledby="recent-title">
        <div class="section-header"><div><p class="section-kicker">HISTORY</p><h2 id="recent-title">この月の記録</h2></div>${allTransactions.length > 8 ? `<button type="button" class="text-button" data-action="toggle-history">${allTransactionsShown ? "8件に戻す" : `すべて表示（${allTransactions.length}件）`}</button>` : '<p class="section-description">タップして編集</p>'}</div>
        <div class="transaction-list">${recent.length ? recent.map(renderTransactionRow).join("") : '<div class="empty-state">この月の記録はまだありません。</div>'}</div>
      </section>

      <section class="summary-grid" aria-label="今月の集計">
        ${summaryCard("支出実績", monthStats.expenseActual, `予定 ${formatCurrency(monthStats.expensePlan)}`)}
        ${summaryCard("収入実績", monthStats.incomeActual, `予定 ${formatCurrency(monthStats.incomePlan)}`)}
      </section>
    </div>`;
  }

  function summaryCard(label, value, subvalue, tone = "") {
    return `<article class="summary-card"><span class="label">${escapeHtml(label)}</span><strong class="${tone}">${formatCurrency(value)}</strong><span class="subvalue">${escapeHtml(subvalue)}</span></article>`;
  }

  function renderBudgetCards(categories, month) {
    if (!categories.length) return '<div class="empty-state">設定画面から種別を追加してください。</div>';
    return categories.map((category) => {
      const stats = categoryBudgetStats(category.id, month);
      const dailyStats = dailyBudgetStats(category, month);
      const available = Math.max(1, stats.plan + Math.max(0, stats.carry));
      const progress = clamp((stats.actual / available) * 100, 0, 100);
      if (dailyStats) {
        return `<button type="button" class="budget-card daily-budget-card" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
          <span class="budget-card-name">${escapeHtml(category.name)}</span>
          <span class="daily-budget-main">
            <span class="daily-budget-value"><span>${dailyStats.dailyLabel}</span><strong class="${dailyStats.dailyRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(dailyStats.dailyRemaining)}</strong></span>
          </span>
          <span class="daily-budget-days">${dailyStats.daysLabel}</span>
          <span class="daily-budget-sub">
            <span><span>今月の残り予算</span><strong class="${stats.monthlyRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(stats.monthlyRemaining)}</strong></span>
            <span><span>これまでの持ち越し</span><strong class="${stats.carryRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(stats.carryRemaining)}</strong></span>
          </span>
          <span class="budget-progress" aria-label="予算消化率 ${Math.round(progress)}%"><span style="--progress:${progress}%"></span></span>
        </button>`;
      }
      return `<button type="button" class="budget-card" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
        <span class="budget-card-name">${escapeHtml(category.name)}</span>
        <span class="budget-card-label">今月の残り予算</span>
        <strong class="budget-card-amount ${stats.monthlyRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(stats.monthlyRemaining)}</strong>
        <span class="budget-card-carry"><span>これまでの持ち越し</span><strong class="${stats.carryRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(stats.carryRemaining)}</strong></span>
        <span class="budget-progress" aria-label="予算消化率 ${Math.round(progress)}%"><span style="--progress:${progress}%"></span></span>
      </button>`;
    }).join("");
  }

  function renderIncomeCards(month) {
    const categories = categoriesForGroup("income");
    if (!categories.length) return '<div class="empty-state">収入種別を設定画面で追加してください。</div>';
    return categories.map((category) => {
      const planned = planAmount(category.id, month);
      const actual = actualAmount(category.id, month);
      return `<button type="button" class="budget-card" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
        <span class="budget-card-name">${escapeHtml(category.name)}</span>
        <span class="budget-card-label">今月の収入実績</span>
        <strong class="budget-card-amount positive">${formatCurrency(actual)}</strong>
        <span class="budget-card-carry"><span>予定</span><strong>${formatCurrency(planned)}</strong></span>
      </button>`;
    }).join("");
  }

  function expenseCardsInGrid(grid) {
    return Array.from(grid.children).filter((card) => card.matches(".budget-card[data-category-id]"));
  }

  function expenseOrderNodesInGrid(grid) {
    return Array.from(grid.children).filter((card) => card.dataset.categoryId);
  }

  function expenseCardOrderInGrid(grid) {
    return expenseOrderNodesInGrid(grid).map((card) => card.dataset.categoryId);
  }

  function snapshotExpenseCardPositions(grid) {
    return new Map(expenseCardsInGrid(grid).map((card) => [card, card.getBoundingClientRect()]));
  }

  function animateExpenseCardReflow(grid, previousPositions) {
    expenseCardsInGrid(grid).forEach((card) => {
      const before = previousPositions.get(card);
      if (!before) return;
      const after = card.getBoundingClientRect();
      const x = before.left - after.left;
      const y = before.top - after.top;
      if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
      card.style.transition = "none";
      card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      window.requestAnimationFrame(() => {
        card.style.transition = "transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        card.style.transform = "";
      });
    });
  }

  function updateExpenseDragPreview(gesture, clientX, clientY) {
    gesture.card.style.transform = `translate3d(${clientX - gesture.pointerOffsetX}px, ${clientY - gesture.pointerOffsetY}px, 0) scale(1.035)`;
  }

  function expenseCardAtPoint(gesture, clientX, clientY) {
    const gridBounds = gesture.grid.getBoundingClientRect();
    if (clientX < gridBounds.left - 18 || clientX > gridBounds.right + 18 || clientY < gridBounds.top - 18 || clientY > gridBounds.bottom + 18) return null;
    const element = document.elementFromPoint(clientX, clientY);
    const card = element && element.closest(".budget-card[data-category-id]");
    return card && gesture.grid.contains(card) ? card : null;
  }

  function expenseInsertionPlacement(target, clientX, clientY) {
    const bounds = target.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    if (Math.abs(clientY - centerY) > bounds.height * 0.3) {
      if (clientY < centerY - bounds.height * 0.1) return "before";
      if (clientY > centerY + bounds.height * 0.1) return "after";
      return null;
    }
    if (clientX < centerX - bounds.width * 0.1) return "before";
    if (clientX > centerX + bounds.width * 0.1) return "after";
    return null;
  }

  function restoreExpenseCardOrder(grid, categoryIds) {
    const nodesById = new Map(expenseOrderNodesInGrid(grid).map((card) => [card.dataset.categoryId, card]));
    categoryIds.forEach((categoryId) => {
      const node = nodesById.get(categoryId);
      if (node) grid.append(node);
    });
  }

  function moveExpenseCardForPointer(gesture, clientX, clientY) {
    const target = expenseCardAtPoint(gesture, clientX, clientY);
    if (!target) return;
    const placement = expenseInsertionPlacement(target, clientX, clientY);
    if (!placement || (gesture.lastTargetId === target.dataset.categoryId && gesture.lastPlacement === placement)) return;
    const reference = placement === "after" ? target.nextElementSibling : target;
    if (reference === gesture.placeholder) return;
    const previousPositions = snapshotExpenseCardPositions(gesture.grid);
    gesture.grid.insertBefore(gesture.placeholder, reference);
    gesture.lastTargetId = target.dataset.categoryId;
    gesture.lastPlacement = placement;
    animateExpenseCardReflow(gesture.grid, previousPositions);
  }

  function addExpenseReorderTracking() {
    window.addEventListener("pointermove", handleExpenseReorderPointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handleExpenseReorderPointerUp, true);
    window.addEventListener("pointercancel", handleExpenseReorderPointerCancel, true);
  }

  function removeExpenseReorderTracking() {
    window.removeEventListener("pointermove", handleExpenseReorderPointerMove, true);
    window.removeEventListener("pointerup", handleExpenseReorderPointerUp, true);
    window.removeEventListener("pointercancel", handleExpenseReorderPointerCancel, true);
  }

  function clearExpenseReorderVisuals(gesture) {
    if (gesture.timer) window.clearTimeout(gesture.timer);
    if (gesture.placeholder && gesture.placeholder.isConnected) gesture.placeholder.replaceWith(gesture.card);
    else if (!gesture.grid.contains(gesture.card)) gesture.grid.append(gesture.card);
    gesture.card.classList.remove("expense-drag-preview");
    gesture.card.style.width = "";
    gesture.card.style.height = "";
    gesture.card.style.transform = "";
    gesture.grid.classList.remove("is-reordering");
    document.body.classList.remove("is-expense-reordering");
    expenseCardsInGrid(gesture.grid).forEach((card) => {
      card.style.transition = "";
      card.style.transform = "";
    });
    if (typeof gesture.card.hasPointerCapture === "function" && typeof gesture.card.releasePointerCapture === "function") {
      try {
        if (gesture.card.hasPointerCapture(gesture.pointerId)) gesture.card.releasePointerCapture(gesture.pointerId);
      } catch (error) {
        console.debug("Expense reorder pointer release unavailable", error);
      }
    }
  }

  function activateExpenseReorder(gesture) {
    if (gesture !== expenseReorderGesture) return;
    gesture.timer = null;
    gesture.active = true;
    const bounds = gesture.card.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = `expense-reorder-placeholder${gesture.card.classList.contains("daily-budget-card") ? " daily-budget-card" : ""}`;
    placeholder.dataset.categoryId = gesture.card.dataset.categoryId;
    placeholder.style.height = `${bounds.height}px`;
    gesture.placeholder = placeholder;
    gesture.grid.classList.add("is-reordering");
    document.body.classList.add("is-expense-reordering");
    if (typeof gesture.card.setPointerCapture === "function") {
      try { gesture.card.setPointerCapture(gesture.pointerId); }
      catch (error) { console.debug("Expense reorder pointer capture unavailable", error); }
    }
    gesture.card.replaceWith(placeholder);
    gesture.card.classList.add("expense-drag-preview");
    gesture.card.style.width = `${bounds.width}px`;
    gesture.card.style.height = `${bounds.height}px`;
    document.body.append(gesture.card);
    updateExpenseDragPreview(gesture, gesture.lastClientX, gesture.lastClientY);
  }

  function startExpenseReorder(event) {
    const card = event.target.closest(".reorderable-category-grid .budget-card[data-category-id]");
    if (!card || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0) || expenseReorderGesture) return;
    const grid = card.closest(".reorderable-category-grid");
    const group = grid && grid.dataset.reorderGroup;
    const category = categoryById(card.dataset.categoryId);
    if (!grid || !["variable", "fixed"].includes(group) || !category || category.group !== group) return;
    const bounds = card.getBoundingClientRect();
    const gesture = {
      pointerId: event.pointerId,
      card,
      grid,
      group,
      active: false,
      placeholder: null,
      initialOrder: expenseCardOrderInGrid(grid),
      initialCategoryOrders: new Map(state.categories.filter((item) => item.group === group).map((item) => [item.id, item.order])),
      pointerOffsetX: event.clientX - bounds.left,
      pointerOffsetY: event.clientY - bounds.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTargetId: "",
      lastPlacement: "",
      timer: null
    };
    gesture.timer = window.setTimeout(() => activateExpenseReorder(gesture), 420);
    expenseReorderGesture = gesture;
    addExpenseReorderTracking();
  }

  function handleExpenseReorderPointerMove(event) {
    const gesture = expenseReorderGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastClientX = event.clientX;
    gesture.lastClientY = event.clientY;
    if (!gesture.active) {
      if (Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY) > 14) {
        expenseReorderGesture = null;
        removeExpenseReorderTracking();
        if (gesture.timer) window.clearTimeout(gesture.timer);
      }
      return;
    }
    if (event.cancelable) event.preventDefault();
    updateExpenseDragPreview(gesture, event.clientX, event.clientY);
    moveExpenseCardForPointer(gesture, event.clientX, event.clientY);
  }

  function applyExpenseCategoryOrder(gesture) {
    const categoriesById = new Map(state.categories.map((category) => [category.id, category]));
    const activeCategories = expenseCardOrderInGrid(gesture.grid).map((categoryId) => categoriesById.get(categoryId)).filter(Boolean);
    const inactiveCategories = state.categories
      .filter((category) => category.group === gesture.group && category.active === false)
      .sort((left, right) => Number(left.order) - Number(right.order));
    [...activeCategories, ...inactiveCategories].forEach((category, index) => { category.order = (index + 1) * 10; });
  }

  async function finishExpenseReorder(event, cancelled = false) {
    const gesture = expenseReorderGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    expenseReorderGesture = null;
    removeExpenseReorderTracking();
    if (!gesture.active) {
      if (gesture.timer) window.clearTimeout(gesture.timer);
      return;
    }
    if (event.cancelable) event.preventDefault();
    expenseReorderSuppressClickUntil = Date.now() + 500;
    if (cancelled) restoreExpenseCardOrder(gesture.grid, gesture.initialOrder);
    const orderChanged = !cancelled && expenseCardOrderInGrid(gesture.grid).some((categoryId, index) => categoryId !== gesture.initialOrder[index]);
    clearExpenseReorderVisuals(gesture);
    if (!orderChanged) return;
    try {
      applyExpenseCategoryOrder(gesture);
      await persist(`${gesture.group === "variable" ? "変動支出" : "固定支出"}の並び順を保存しました`);
      render();
    } catch (error) {
      state.categories.forEach((category) => {
        if (gesture.initialCategoryOrders.has(category.id)) category.order = gesture.initialCategoryOrders.get(category.id);
      });
      render();
      throw error;
    }
  }

  function handleExpenseReorderPointerUp(event) {
    finishExpenseReorder(event).catch((error) => showToast(error instanceof Error ? error.message : "並び順を保存できませんでした"));
  }

  function handleExpenseReorderPointerCancel(event) {
    finishExpenseReorder(event, true).catch((error) => showToast(error instanceof Error ? error.message : "並び替えを中止しました"));
  }

  function renderTransactionRow(transaction) {
    const category = categoryById(transaction.categoryId);
    const categoryName = category ? category.name : "削除済み種別";
    const color = category ? category.color : "#777777";
    const prefix = transaction.direction === "income" ? "+" : "−";
    return `<button type="button" class="transaction-row" data-transaction-id="${escapeHtml(transaction.id)}" style="--category-color:${escapeHtml(color)}">
      <span class="transaction-dot" aria-hidden="true"></span>
      <span class="transaction-main"><strong>${escapeHtml(categoryName)}</strong><span>${dateTimeLabel(transaction.date)}${transaction.memo ? `・${escapeHtml(transaction.memo)}` : ""}</span></span>
      <strong class="transaction-amount ${transaction.direction === "income" ? "positive" : ""}">${prefix}${formatCurrency(transaction.amount)}</strong>
    </button>`;
  }

  function renderOverview() {
    const aggregates = periodMonths().map(aggregateMonth);
    const selected = aggregateMonth(currentPeriod);
    let plannedCumulative = 0;
    let actualCumulative = 0;
    aggregates.forEach((item) => {
      plannedCumulative += item.plannedNet;
      actualCumulative += item.actualNet;
      item.plannedCumulative = plannedCumulative;
      item.actualCumulative = actualCumulative;
    });

    const projectEnd = aggregates[aggregates.length - 1] || { plannedCumulative: 0, actualCumulative: 0 };
    const today = localDateKey();
    const activePeriodIndex = Math.max(0, aggregates.findIndex((item) => item.month === currentPeriodForToday()));
    const projectEndForecast = today > state.settings.endDate
      ? projectEnd.actualCumulative
      : aggregates.reduce((sum, item, index) => {
        if (index < activePeriodIndex) return sum + item.actualNet;
        if (index > activePeriodIndex) return sum + item.plannedNet;
        return sum + Math.max(item.incomeActual, item.incomePlan) - Math.max(item.expenseActual, item.expensePlan);
      }, 0);
    const projectEndForecastDescription = today > state.settings.endDate
      ? "プロジェクト終了時の実績です。"
      : today < state.settings.startDate
        ? "プロジェクト開始時の計画から算出した見込みです。"
        : "これまでの実績と、残りの計画から算出した見込みです。";
    const projectEndTone = projectEndForecast < 0 ? "negative" : projectEndForecast > 0 ? "positive" : "";
    const preferredCumulativeIndex = aggregates.findIndex((item) => item.month === currentPeriod);
    const cumulativeIndexMaximum = Math.max(0, aggregates.length - 1);
    const selectedCumulativeIndex = clamp(
      Number.isInteger(cumulativeChartSelectedIndex) ? cumulativeChartSelectedIndex : Math.max(0, preferredCumulativeIndex),
      0,
      cumulativeIndexMaximum
    );
    cumulativeChartSelectedIndex = selectedCumulativeIndex;

    const barMaximum = Math.max(1, ...aggregates.flatMap((item) => [item.expensePlan, item.expenseActual, item.incomePlan, item.incomeActual]));
    const lineMaximum = Math.max(1, ...aggregates.flatMap((item) => [Math.abs(item.plannedNet), Math.abs(item.actualNet)]));
    const width = aggregates.length * 100;
    const points = (field) => aggregates.map((item, index) => `${index * 100 + 50},${50 - (item[field] / lineMaximum) * 45}`).join(" ");

    viewHost.innerHTML = `<div class="view-stack">
      <section class="card overview-hero" aria-label="プロジェクト終了時の見込み収支">
        <div><p class="section-kicker">PROJECT END FORECAST</p><h2>プロジェクト終了時の見込み収支</h2><p>${projectDateLabel(state.settings.startDate)}〜${projectDateLabel(state.settings.endDate)}。${projectEndForecastDescription}</p></div>
        <div class="overview-hero-total"><strong class="${projectEndTone}">${formatSignedCurrency(projectEndForecast)}</strong><span>計画時 ${formatSignedCurrency(projectEnd.plannedCumulative)}</span></div>
      </section>
      <div class="month-switcher"><label class="field-label" for="overview-period">注目する月</label><select id="overview-period">${monthOptions(currentPeriod)}</select></div>
      <section class="summary-grid">
        ${summaryCard("予定収入", selected.incomePlan, `実績 ${formatCurrency(selected.incomeActual)}`)}
        ${summaryCard("予定支出", selected.expensePlan, `実績 ${formatCurrency(selected.expenseActual)}`)}
        ${summaryCard("予定収支", selected.plannedNet, `${monthLabel(currentPeriod)}の計画`, selected.plannedNet < 0 ? "negative" : "positive")}
        ${summaryCard("実績収支", selected.actualNet, `${monthLabel(currentPeriod)}の結果`, selected.actualNet < 0 ? "negative" : "positive")}
      </section>

      <section class="card chart-card" aria-labelledby="cashflow-chart-title">
        <div class="section-copy"><p class="section-kicker">${aggregates.length} MONTHS</p><h2 id="cashflow-chart-title">計画と実績の推移</h2><p>横にスクロールして全期間を確認できます。線は月次収支です。</p></div>
        <div class="chart-legend">
          ${legend("#e8b59b", "支出予定")}${legend("#d66735", "支出実績")}${legend("#a8ceba", "収入予定")}${legend("#2f8057", "収入実績")}${legend("#7f9dc2", "月次予定収支")}${legend("#3c69a1", "月次実績収支")}
        </div>
        <div class="chart-scroll">
          <div class="chart-canvas" style="--month-count:${aggregates.length}">
            <div class="chart-gridline" style="top:10%"><span>${compactFormatter.format(barMaximum)}</span></div>
            <div class="chart-gridline" style="top:50%"><span>${compactFormatter.format(Math.round(barMaximum / 2))}</span></div>
            <div class="chart-gridline" style="top:90%"><span>0</span></div>
            <div class="bar-chart">${aggregates.map((item) => renderMonthBars(item, barMaximum)).join("")}</div>
            <svg class="line-overlay" viewBox="0 0 ${width} 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline class="chart-line monthly-net planned" points="${points("plannedNet")}"></polyline>
              <polyline class="chart-line monthly-net actual" points="${points("actualNet")}"></polyline>
            </svg>
          </div>
        </div>
        <p class="chart-note">棒グラフと折れ線は別スケールです。正確な金額は下表で確認できます。</p>
      </section>

      ${renderCumulativeNetChart(aggregates, selectedCumulativeIndex)}

      <section class="card" aria-labelledby="monthly-table-title">
        <div class="section-copy"><h2 id="monthly-table-title">月別の数値</h2><p>グラフと同じ内容を表形式で確認できます。</p></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>月</th><th>収入予定</th><th>収入実績</th><th>支出予定</th><th>支出実績</th><th>予定収支</th><th>実績収支</th><th>累積予定</th><th>累積実績</th></tr></thead><tbody>
          ${aggregates.map((item) => `<tr><td>${monthLabel(item.month)}</td><td>${formatCurrency(item.incomePlan)}</td><td>${formatCurrency(item.incomeActual)}</td><td>${formatCurrency(item.expensePlan)}</td><td>${formatCurrency(item.expenseActual)}</td><td>${formatSignedCurrency(item.plannedNet)}</td><td>${formatSignedCurrency(item.actualNet)}</td><td>${formatSignedCurrency(item.plannedCumulative)}</td><td>${formatSignedCurrency(item.actualCumulative)}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
    </div>`;
  }

  function legend(color, label) {
    return `<span class="legend-item"><span class="legend-swatch" style="--legend-color:${color}"></span>${label}</span>`;
  }

  function renderCumulativeNetChart(aggregates, selectedIndex) {
    const maximum = Math.max(1, ...aggregates.flatMap((item) => [Math.abs(item.plannedCumulative), Math.abs(item.actualCumulative)]));
    const width = aggregates.length * 100;
    const points = (field) => aggregates.map((item, index) => `${index * 100 + 50},${50 - (item[field] / maximum) * 45}`).join(" ");
    const pointMarkers = (field, tone) => aggregates.map((item, index) => {
      const x = index * 100 + 50;
      const y = 50 - (item[field] / maximum) * 45;
      return `<circle class="cumulative-chart-point ${tone}${index === selectedIndex ? " is-selected" : ""}" cx="${x}" cy="${y}" r="${index === selectedIndex ? 4.8 : 2.5}"></circle>`;
    }).join("");
    const selected = aggregates[selectedIndex] || aggregates[0] || { month: currentPeriod, plannedCumulative: 0, actualCumulative: 0, plannedNet: 0, actualNet: 0 };
    const selectionLeft = 2.8 + selectedIndex * 3.1 + 1.55;
    const maximumLabel = compactFormatter.format(maximum);
    return `<section class="card chart-card cumulative-chart-card" aria-labelledby="cumulative-chart-title">
      <div class="section-copy"><p class="section-kicker">CUMULATIVE NET</p><h2 id="cumulative-chart-title">累積予定収支と累積実績収支</h2><p>予定は青の破線、実績は橙の実線です。各月をタップすると、その月の内容をグラフ上に表示します。</p></div>
      <div class="chart-legend">${legend("#3c78b4", "累積予定収支（破線）")}${legend("#c45e43", "累積実績収支（実線）")}</div>
      <div class="chart-scroll">
        <div class="chart-canvas cumulative-chart-canvas" style="--month-count:${aggregates.length};--selection-left:${selectionLeft}rem">
          <div class="chart-gridline" style="top:10%"><span>+${maximumLabel}</span></div>
          <div class="chart-gridline" style="top:50%"><span>0</span></div>
          <div class="chart-gridline" style="top:90%"><span>−${maximumLabel}</span></div>
          <svg class="line-overlay" viewBox="0 0 ${width} 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline class="chart-line cumulative-net planned" points="${points("plannedCumulative")}"></polyline>
            <polyline class="chart-line cumulative-net actual" points="${points("actualCumulative")}"></polyline>
            ${pointMarkers("plannedCumulative", "planned")}${pointMarkers("actualCumulative", "actual")}
          </svg>
          <span class="cumulative-chart-selection-guide" aria-hidden="true"></span>
          <aside class="cumulative-chart-tooltip" aria-live="polite">
            <strong>${monthLabel(selected.month)}</strong>
            <span class="planned"><i aria-hidden="true"></i>予定累積 ${formatSignedCurrency(selected.plannedCumulative)}</span>
            <span class="actual"><i aria-hidden="true"></i>実績累積 ${formatSignedCurrency(selected.actualCumulative)}</span>
            <small>月次：予定 ${formatSignedCurrency(selected.plannedNet)} ／ 実績 ${formatSignedCurrency(selected.actualNet)}</small>
          </aside>
          <div class="cumulative-chart-tap-targets">${aggregates.map((item, index) => `<button type="button" class="cumulative-chart-tap-target${index === selectedIndex ? " is-selected" : ""}" data-cumulative-chart-index="${index}" aria-label="${monthLabel(item.month)}を表示。累積予定収支 ${formatSignedCurrency(item.plannedCumulative)}、累積実績収支 ${formatSignedCurrency(item.actualCumulative)}"></button>`).join("")}</div>
          <div class="cumulative-chart-months" aria-hidden="true">${aggregates.map((item) => `<span>${monthParts(item.month).month}月度</span>`).join("")}</div>
        </div>
      </div>
    </section>`;
  }

  function renderMonthBars(item, maximum) {
    const height = (value) => Math.max(value > 0 ? 1 : 0, (value / maximum) * 100);
    return `<div class="month-bars" title="${monthLabel(item.month)}">
      <span class="chart-bar expense-plan" style="height:${height(item.expensePlan)}%"></span>
      <span class="chart-bar expense-actual" style="height:${height(item.expenseActual)}%"></span>
      <span class="chart-bar income-plan" style="height:${height(item.incomePlan)}%"></span>
      <span class="chart-bar income-actual" style="height:${height(item.incomeActual)}%"></span>
      <span class="chart-month-label">${monthParts(item.month).month}月度</span>
    </div>`;
  }

  function renderAnalysis() {
    if (!analysisPeriod) analysisPeriod = currentPeriod;
    const incomeMode = analysisMode === "income";
    const categories = incomeMode ? incomeCategoriesForReporting(analysisPeriod) : expenseCategoriesForReporting(analysisPeriod);
    const rows = categories.map((category) => {
      const plan = incomeMode ? planAmount(category.id, analysisPeriod) : activeExpensePlanAmount(category, analysisPeriod);
      const actual = actualAmount(category.id, analysisPeriod);
      return { category, plan, actual, variance: plan - actual, ratio: plan > 0 ? actual / plan : actual > 0 ? 2 : 0 };
    }).sort((a, b) => b.actual - a.actual);
    const totalPlan = rows.reduce((sum, row) => sum + row.plan, 0);
    const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
    const composition = makeDonut(rows, totalActual);
    const range = periodRange(analysisPeriod);
    const today = parseLocalDate(localDateKey());
    const start = parseLocalDate(range.start);
    const end = parseLocalDate(range.end);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const elapsedDays = today < start ? 0 : today > end ? totalDays : Math.round((today - start) / 86400000) + 1;
    const projected = elapsedDays > 0 ? Math.round((totalActual / elapsedDays) * totalDays) : 0;
    const insights = incomeMode ? createIncomeInsights(rows, totalPlan, totalActual, projected, analysisPeriod) : createInsights(rows, totalPlan, totalActual, projected, analysisPeriod);
    let heroStatus = "計画どおり";
    let heroTone = "positive";
    if (incomeMode && totalActual < totalPlan) { heroStatus = `${formatCurrency(totalPlan - totalActual)} 未達`; heroTone = "negative"; }
    else if (incomeMode && totalActual > totalPlan) heroStatus = `${formatCurrency(totalActual - totalPlan)} 上振れ`;
    else if (!incomeMode && totalActual > totalPlan) { heroStatus = `${formatCurrency(totalActual - totalPlan)} 超過`; heroTone = "negative"; }
    else if (!incomeMode && totalActual < totalPlan) heroStatus = `${formatCurrency(totalPlan - totalActual)} 残り`;
    const projectedBehind = incomeMode ? projected < totalPlan : projected > totalPlan;

    viewHost.innerHTML = `<div class="view-stack">
      <div class="segmented" style="--segments:2" aria-label="分析対象">
        <button type="button" class="segment-button ${incomeMode ? "" : "active"}" data-analysis-mode="expense">支出</button>
        <button type="button" class="segment-button ${incomeMode ? "active" : ""}" data-analysis-mode="income">収入</button>
      </div>
      <div class="month-switcher"><label class="field-label" for="analysis-period">分析する月</label><select id="analysis-period">${monthOptions(analysisPeriod)}</select></div>
      <section class="card analysis-hero">
        <div><p class="section-kicker">${incomeMode ? "INCOME MIX" : "SPENDING MIX"}</p><h2>${monthLabel(analysisPeriod)}の${incomeMode ? "収入" : "支出"}構成</h2><p>計画 ${formatCurrency(totalPlan)} に対して ${formatCurrency(totalActual)} を記録しています。</p><strong class="${heroTone}">${heroStatus}</strong></div>
        <div class="donut" style="--donut:${composition.gradient}"><div class="donut-label"><strong>${totalPlan ? Math.round((totalActual / totalPlan) * 100) : 0}%</strong><span>計画進捗</span></div></div>
      </section>
      <section class="summary-grid">
        ${summaryCard(incomeMode ? "現在の収入" : "現在の支出", totalActual, `${elapsedDays}/${totalDays}日経過`)}
        ${summaryCard("着地予測", projected, incomeMode ? (projectedBehind ? "収入計画を下回るペース" : "収入計画以上のペース") : (projectedBehind ? "予算超過ペース" : "予算内ペース"), projectedBehind ? "negative" : "positive")}
      </section>
      <section class="card"><div class="section-copy"><p class="section-kicker">BY CATEGORY</p><h2>種別ごとの計画差</h2><p>実績が多い順に表示しています。</p></div><div class="analysis-list">
        ${rows.map((row) => renderAnalysisRow(row, incomeMode)).join("") || `<div class="empty-state">${incomeMode ? "収入" : "支出"}種別がありません。</div>`}
      </div></section>
      <section class="card"><div class="section-copy"><p class="section-kicker">INSIGHTS</p><h2>今月の気づき</h2></div><ul class="insight-list">${insights.map((item) => `<li class="insight-item"><span class="insight-icon" aria-hidden="true">${item.icon}</span><span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></span></li>`).join("")}</ul></section>
    </div>`;
  }

  function renderAnalysisRow(row, incomeMode) {
    let difference = "計画どおり";
    let tone = "";
    if (incomeMode && row.variance > 0) { difference = `${formatCurrency(row.variance)}未達`; tone = "negative"; }
    else if (incomeMode && row.variance < 0) { difference = `${formatCurrency(Math.abs(row.variance))}上振れ`; tone = "positive"; }
    else if (!incomeMode && row.variance < 0) { difference = `${formatCurrency(Math.abs(row.variance))}超過`; tone = "negative"; }
    else if (!incomeMode && row.variance > 0) difference = `${formatCurrency(row.variance)}残り`;
    return `<div class="analysis-row"><div class="analysis-row-head"><span><strong>${escapeHtml(row.category.name)}</strong>・実績 ${formatCurrency(row.actual)}</span><strong class="${tone}">${difference}</strong></div><div class="analysis-track"><span style="--category-color:${escapeHtml(row.category.color)};--progress:${clamp(row.ratio * 100, 0, 100)}%"></span></div></div>`;
  }

  function makeDonut(rows, total) {
    if (total <= 0) return { gradient: "var(--surface-2) 0 100%" };
    let cursor = 0;
    const stops = rows.filter((row) => row.actual > 0).map((row) => {
      const start = cursor;
      cursor += (row.actual / total) * 100;
      return `${row.category.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    return { gradient: `conic-gradient(${stops.join(",")})` };
  }

  function createInsights(rows, totalPlan, totalActual, projected, month) {
    if (month > periodForDate(localDateKey())) {
      return [{ icon: "→", title: "未来月の計画です", body: "実績がまだないため、予算計画だけを表示しています。月が始まると着地予測や未記録項目を分析します。" }];
    }
    const insights = [];
    const overspent = rows.filter((row) => row.actual > row.plan && row.actual > 0).sort((a, b) => a.variance - b.variance);
    if (overspent[0]) insights.push({ icon: "!", title: `${overspent[0].category.name}が予算を超えています`, body: `${formatCurrency(Math.abs(overspent[0].variance))}の超過です。記録を確認し、必要なら翌月計画を調整しましょう。` });
    if (projected > totalPlan && totalPlan > 0) insights.push({ icon: "↗", title: "今のペースでは予算超過の見込み", body: `月末の着地予測は${formatCurrency(projected)}です。残り期間で${formatCurrency(projected - totalPlan)}の調整が目安です。` });
    const fixedMissing = categoriesForGroup("fixed").filter((category) => planAmount(category.id, month) > 0 && actualAmount(category.id, month) === 0);
    if (fixedMissing.length) insights.push({ icon: "✓", title: "未記録の固定支出があります", body: `${fixedMissing.map((category) => category.name).join("、")}は予定がありますが実績が未入力です。` });
    const unplanned = rows.find((row) => row.plan === 0 && row.actual > 0);
    if (unplanned) insights.push({ icon: "＋", title: `${unplanned.category.name}に予算外支出`, body: `${formatCurrency(unplanned.actual)}の実績があります。今後も発生する場合は計画へ追加できます。` });
    if (!insights.length) insights.push({ icon: "○", title: "計画どおりに進んでいます", body: totalActual ? "目立った予算超過や未入力はありません。" : "まだ支出記録がありません。使ったら入力画面から記録しましょう。" });
    return insights;
  }

  function createIncomeInsights(rows, totalPlan, totalActual, projected, month) {
    if (month > periodForDate(localDateKey())) {
      return [{ icon: "→", title: "未来月の収入計画です", body: "実績がまだないため、収入予定だけを表示しています。月が始まると未達や着地予測を分析します。" }];
    }
    const insights = [];
    const shortfalls = rows.filter((row) => row.plan > row.actual).sort((a, b) => b.variance - a.variance);
    if (shortfalls[0]) insights.push({ icon: "!", title: `${shortfalls[0].category.name}が計画未達です`, body: `${formatCurrency(shortfalls[0].variance)}がまだ記録されていません。入金済みなら収入実績を追加してください。` });
    if (projected < totalPlan && totalPlan > 0 && totalActual > 0) insights.push({ icon: "↘", title: "収入が計画を下回る見込み", body: `月末の着地予測は${formatCurrency(projected)}です。計画との差は${formatCurrency(totalPlan - projected)}です。` });
    const unplanned = rows.find((row) => row.plan === 0 && row.actual > 0);
    if (unplanned) insights.push({ icon: "＋", title: `${unplanned.category.name}に予定外収入`, body: `${formatCurrency(unplanned.actual)}の実績があります。継続する場合は今後の収入計画へ追加できます。` });
    if (!insights.length) insights.push({ icon: "○", title: "収入は計画どおりです", body: totalActual ? "目立った未達はありません。" : "まだ収入実績がありません。入金されたら入力画面から記録しましょう。" });
    return insights;
  }

  function renderSettings() {
    const paneButtons = [
      ["basic", "基本"], ["expense", "支出"], ["income", "収入"], ["projects", "プロジェクト"]
    ].map(([id, label]) => `<button type="button" class="segment-button ${settingsPane === id ? "active" : ""}" data-settings-pane="${id}">${label}</button>`).join("");
    let content;
    if (settingsPane === "basic") content = renderBasicSettings();
    else if (settingsPane === "expense") content = renderCategorySettings("expense");
    else if (settingsPane === "income") content = renderCategorySettings("income");
    else content = renderProjectSettings();
    viewHost.innerHTML = `<div class="view-stack"><div class="segmented" style="--segments:4">${paneButtons}</div>${content}</div>`;
  }

  function renderBasicSettings() {
    const selectedTheme = themePresetFor(state.settings.themeId);
    return `<form id="basic-settings-form" class="card settings-form">
      <div class="section-copy"><p class="section-kicker">PERIOD</p><h2>家計簿の期間</h2><p>締日を超えた支出は翌月分として集計します。存在しない締日は月末に丸めます。</p></div>
      <label><span class="field-label">締日</span><select id="closing-day">${Array.from({ length: 31 }, (_, index) => index + 1).map((day) => `<option value="${day}"${Number(state.settings.closingDay) === day ? " selected" : ""}>${day === 31 ? "月末（31日）" : `${day}日`}</option>`).join("")}</select></label>
      <div class="form-grid two-columns">
        <label><span class="field-label">開始日</span><input id="start-date" type="date" value="${state.settings.startDate}" required></label>
        <label><span class="field-label">終了日</span><input id="end-date" type="date" value="${state.settings.endDate}" required></label>
      </div>
      <p class="help-text">現在は${periodMonths().length}ヶ月分を管理しています。初期設定は開始月から36ヶ月です。</p>
      <section class="theme-settings" aria-labelledby="theme-settings-title">
        <div class="section-copy"><p class="section-kicker">THEME</p><h3 id="theme-settings-title">テーマカラー</h3><p>アプリ全体のアクセントカラーを選べます。</p></div>
        <div class="theme-preset-grid" role="radiogroup" aria-label="テーマカラー">
          ${THEME_PRESETS.map((preset) => `<label class="theme-preset${preset.id === selectedTheme.id ? " selected" : ""}" style="--preset-color:${preset.primary};--preset-strong:${preset.strong};--preset-soft:${preset.soft}">
            <input type="radio" name="theme-id" value="${preset.id}"${preset.id === selectedTheme.id ? " checked" : ""}>
            <span class="theme-preset-swatch" aria-hidden="true"></span><span class="theme-preset-name">${preset.name}</span>
          </label>`).join("")}
        </div>
      </section>
      <button type="submit" class="button primary">基本設定を保存</button>
    </form>`;
  }

  function renderProjectSettings() {
    const project = currentProject;
    if (!project) return '<div class="empty-state">プロジェクトを読み込んでいます。</div>';
    const defaultStart = localDateKey();
    const defaultEnd = projectEndDateForStart(defaultStart);
    const projectOptions = projects.map((item) => {
      const label = `${item.name}${item.isSample ? "（サンプル）" : ""}`;
      return `<option value="${escapeHtml(item.id)}"${item.id === project.id ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
    const isDefault = project.id === defaultProjectId;
    const isSample = project.isSample === true;
    return `<div class="view-stack">
      <section class="card project-current-card">
        <div class="section-copy"><p class="section-kicker">CURRENT PROJECT</p><h2>${escapeHtml(project.name)}${project.isSample ? "（サンプル）" : ""}</h2><p>${projectDateLabel(project.startDate)}〜${projectDateLabel(project.endDate)}・${project.closingDay}日締め</p></div>
        <label><span class="field-label">プロジェクトを読み込む</span><select id="project-load-select">${projectOptions}</select></label>
        <div class="dialog-actions">
          <button type="button" class="button secondary" data-action="load-project">読み込む</button>
          <button type="button" class="button primary" data-action="set-default-project"${isDefault ? " disabled" : ""}>${isDefault ? "既定のプロジェクト" : "既定にする"}</button>
        </div>
        <p class="help-text">既定にすると、次回アプリを開いたときにこのプロジェクトを自動で読み込みます。</p>
      </section>
      ${isSample ? `<section class="card"><p class="help-text">サンプルプロジェクトはいつでも操作を試せるよう、名前の変更と削除はできません。</p></section>` : `<form id="project-rename-form" class="card settings-form">
        <div class="section-copy"><p class="section-kicker">PROJECT NAME</p><h2>プロジェクト名を変更</h2></div>
        <label><span class="field-label">プロジェクト名</span><input id="project-current-name" type="text" maxlength="40" value="${escapeHtml(project.name)}" required></label>
        <div class="dialog-actions">
          <button type="submit" class="button primary">名前を保存</button>
          <button type="button" class="button danger" data-action="delete-project">このプロジェクトを削除</button>
        </div>
        <p class="help-text">削除すると、このプロジェクトの計画・実績も端末から削除されます。</p>
      </form>`}
      <form id="project-create-form" class="card settings-form">
        <div class="section-copy"><p class="section-kicker">NEW PROJECT</p><h2>新しいプロジェクトを作成</h2><p>現在のプロジェクトとは別に、将来の家計簿期間をあらかじめ作成できます。</p></div>
        <label><span class="field-label">プロジェクト名</span><input id="project-name-input" type="text" maxlength="40" placeholder="例：2026年度の家計簿" required></label>
        <div class="form-grid two-columns">
          <label><span class="field-label">開始日</span><input id="project-start-date" type="date" value="${defaultStart}" required></label>
          <label><span class="field-label">終了日</span><input id="project-end-date" type="date" value="${defaultEnd}" required></label>
        </div>
        <p class="help-text">開始日を変えると、終了日は3年後の前日に自動調整されます。作成後は新しいプロジェクトを読み込みます。</p>
        <button type="submit" class="button primary">プロジェクトを作成して読み込む</button>
      </form>
      <section class="card sample-project-note"><p class="section-kicker">TRY IT</p><h2>サンプルプロジェクト</h2><p>プロジェクト一覧に、操作感を試せるサンプルデータを用意しています。読み込んで自由に操作できます。</p></section>
    </div>`;
  }

  function renderCategorySettings(direction) {
    if (direction === "income") {
      return `<section class="section"><div class="section-header"><div><p class="section-kicker">INCOME</p><h2>収入種別と月別予定</h2></div><button type="button" class="button small primary" data-add-category="income">＋ 追加</button></div><div class="category-settings-list">${renderCategoryRows(categoriesForGroup("income", true))}</div></section>`;
    }
    return `<div class="view-stack">
      <section class="section"><div class="section-header"><div><p class="section-kicker">VARIABLE</p><h2>変動支出</h2></div><button type="button" class="button small primary" data-add-category="variable">＋ 追加</button></div><div class="category-settings-list">${renderCategoryRows(categoriesForGroup("variable", true))}</div></section>
      <section class="section"><div class="section-header"><div><p class="section-kicker">FIXED</p><h2>固定支出</h2></div><button type="button" class="button small primary" data-add-category="fixed">＋ 追加</button></div><div class="category-settings-list">${renderCategoryRows(categoriesForGroup("fixed", true))}</div></section>
    </div>`;
  }

  function renderCategoryRows(categories) {
    if (!categories.length) return '<div class="empty-state">種別がありません。</div>';
    return categories.map((category) => {
      const dailyToggle = category.group === "variable" ? `<label class="category-daily-toggle">
        <span class="category-daily-copy"><strong>日毎に予算管理</strong><span>当月の残予算を締日までの日数で割って表示</span></span>
        <input class="daily-budget-toggle-input" type="checkbox" role="switch" data-daily-budget-category="${escapeHtml(category.id)}"${category.dailyBudgetEnabled === true ? " checked" : ""}${category.active === false ? " disabled" : ""}>
        <span class="daily-budget-switch" aria-hidden="true"></span>
      </label>` : "";
      return `<article class="category-setting-row" style="--category-color:${escapeHtml(category.color)}">
        <span class="color-dot" aria-hidden="true"></span>
        <span class="category-meta"><strong>${escapeHtml(category.name)}${category.active === false ? "（無効）" : ""}</strong><span>${monthLabel(currentPeriod)} ${formatCurrency(planAmount(category.id, currentPeriod))}</span><span>計画合計 ${formatCurrency(periodPlanTotal(category.id))}</span></span>
        <button type="button" class="row-action" data-plan-category="${escapeHtml(category.id)}">${periodMonths().length}ヶ月</button>
        <button type="button" class="row-action" data-edit-category="${escapeHtml(category.id)}">編集</button>
        ${category.group !== "income" ? `<button type="button" class="row-action category-active-toggle ${category.active === false ? "is-inactive" : ""}" data-toggle-category-active="${escapeHtml(category.id)}">${category.active === false ? "有効にする" : "無効にする"}</button>` : ""}
        ${dailyToggle}
      </article>`;
    }).join("");
  }

  function renderData() {
    const updated = state.updatedAt ? new Date(state.updatedAt).toLocaleString("ja-JP") : "未保存";
    const outsideTransactions = state.transactions.filter((transaction) => transaction.date < state.settings.startDate || transaction.date > state.settings.endDate);
    viewHost.innerHTML = `<div class="view-stack">
      <section class="card"><p class="section-kicker">LOCAL FIRST</p><h2>データはこの端末内に保存</h2><p>外部サーバーには送信しません。機種変更や万一に備えて定期的にバックアップしてください。</p><div class="privacy-banner">${state.categories.length}種別・${state.transactions.length}件の実績・${periodMonths().length}ヶ月の計画<br>最終更新：${escapeHtml(updated)}</div></section>
      <section class="data-action-list">
        ${dataAction("表", "Excel互換CSVを出力", "設定・種別・月別計画・全実績を1つのCSVへ保存", "export-csv")}
        ${dataAction("読", "CSVをインポート", "本アプリが出力したCSVでデータを全置換", "import-csv")}
        ${dataAction("{ }", "JSON完全バックアップ", "編集せず保管する復元用ファイル", "export-json")}
        ${dataAction("戻", "JSONから復元", "完全バックアップを読み込んで全置換", "import-json")}
      </section>
      ${outsideTransactions.length ? `<section class="section"><div class="section-header"><div><p class="section-kicker">OUTSIDE PERIOD</p><h2>管理期間外の実績</h2></div><p class="section-description">${outsideTransactions.length}件</p></div><p class="help-text">期間を短くしたため集計対象外になった実績です。タップして日付を修正または削除できます。</p><div class="transaction-list">${outsideTransactions.sort((a, b) => b.date.localeCompare(a.date)).map(renderTransactionRow).join("")}</div></section>` : ""}
      <section class="card"><div class="section-copy"><p class="section-kicker">RESET</p><h2>初期データへ戻す</h2><p>種別・月別計画・実績を削除し、空の状態に戻します。プロジェクト名と期間は残ります。</p></div><button type="button" class="button danger" data-action="reset-data">すべて初期化</button></section>
    </div>`;
  }

  function dataAction(icon, title, description, action) {
    return `<article class="data-action"><span class="data-action-icon" aria-hidden="true">${icon}</span><span class="data-action-copy"><strong>${title}</strong><span>${description}</span></span><button type="button" class="button small secondary" data-action="${action}">実行</button></article>`;
  }

  function createCalculatorState() {
    return { current: "0", accumulator: null, operation: null, waitingForOperand: false, expression: "" };
  }

  function openCalculator(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    calculatorContext = { categoryId, direction: directionForCategory(category) };
    calculator = createCalculatorState();
    document.querySelector("#calculator-category").textContent = category.name;
    document.querySelector("#calculator-kind").textContent = calculatorContext.direction === "income" ? "収入を入力" : "支出を入力";
    updateCalculatorDisplay();
    openDialog(calculatorDialog);
  }

  function updateCalculatorDisplay() {
    const value = Math.max(0, toInteger(Number(calculator.current)));
    document.querySelector("#calculator-display").textContent = formatCurrency(value);
    document.querySelector("#calculator-expression").textContent = calculator.expression;
    document.querySelector("#calculator-ok").disabled = value <= 0;
  }

  function calculatorInputDigit(digit) {
    if (calculator.waitingForOperand) {
      calculator.current = digit === "00" ? "0" : digit;
      calculator.waitingForOperand = false;
    } else if (calculator.current === "0") {
      calculator.current = digit === "00" ? "0" : digit;
    } else if (calculator.current.length < 10) {
      calculator.current += digit;
    }
  }

  function performCalculation(left, right, operation) {
    if (operation === "add") return left + right;
    if (operation === "subtract") return left - right;
    if (operation === "multiply") return left * right;
    if (operation === "divide") return right === 0 ? left : left / right;
    return right;
  }

  function calculatorOperation(nextOperation) {
    const inputValue = Number(calculator.current);
    const symbols = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
    if (calculator.operation && !calculator.waitingForOperand) {
      const result = performCalculation(calculator.accumulator, inputValue, calculator.operation);
      calculator.current = String(Math.max(0, Math.round(result)));
      calculator.accumulator = Math.max(0, Math.round(result));
    } else if (calculator.accumulator === null) {
      calculator.accumulator = inputValue;
    }
    calculator.operation = nextOperation;
    calculator.waitingForOperand = true;
    calculator.expression = `${formatCurrency(calculator.accumulator)} ${symbols[nextOperation]}`;
  }

  function calculatorEquals() {
    if (!calculator.operation || calculator.waitingForOperand) return;
    const result = performCalculation(calculator.accumulator, Number(calculator.current), calculator.operation);
    calculator.current = String(Math.max(0, Math.round(result)));
    calculator.expression = "";
    calculator.accumulator = null;
    calculator.operation = null;
    calculator.waitingForOperand = true;
  }

  function handleCalculatorKey(key) {
    if (/^\d+$/.test(key)) calculatorInputDigit(key);
    else if (["add", "subtract", "multiply", "divide"].includes(key)) calculatorOperation(key);
    else if (key === "equals") calculatorEquals();
    else if (key === "clear") calculator = createCalculatorState();
    else if (key === "backspace") {
      if (!calculator.waitingForOperand) calculator.current = calculator.current.length > 1 ? calculator.current.slice(0, -1) : "0";
    }
    updateCalculatorDisplay();
  }

  async function acceptCalculator() {
    calculatorEquals();
    const amount = Math.max(0, toInteger(calculator.current));
    if (!calculatorContext || amount <= 0) return;
    const category = categoryById(calculatorContext.categoryId);
    const transaction = {
      id: makeId("tx"),
      direction: calculatorContext.direction,
      categoryId: calculatorContext.categoryId,
      date: periodMonths().includes(periodForDate(localDateKey())) && currentPeriod === periodForDate(localDateKey()) ? localDateKey() : periodRange(currentPeriod).end,
      enteredOn: localDateKey(),
      amount,
      memo: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    pendingTransaction = transaction;
    state.transactions.push(transaction);
    closeDialog(calculatorDialog);
    try {
      state = await window.BudgetDB.saveState(state, currentProject && currentProject.id);
      syncCurrentProjectPeriod();
    } catch (error) {
      state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
      pendingTransaction = null;
      showToast(error instanceof Error ? error.message : "記録を保存できませんでした");
      return;
    }
    render();
    document.querySelector("#memo-summary").textContent = `${category.name}・${formatCurrency(amount)}・${dateTimeLabel(transaction.date)}`;
    document.querySelector("#memo-input").value = "";
    openDialog(memoDialog);
  }

  async function savePendingTransaction(memo) {
    if (!pendingTransaction) return;
    const stored = state.transactions.find((transaction) => transaction.id === pendingTransaction.id);
    if (stored) {
      stored.memo = String(memo || "").trim();
      stored.updatedAt = new Date().toISOString();
    }
    const category = categoryById(pendingTransaction.categoryId);
    const amount = pendingTransaction.amount;
    pendingTransaction = null;
    closeDialog(memoDialog);
    await persist(`${category ? category.name : "記録"} ${formatCurrency(amount)}を保存しました`);
    render();
  }

  function openTransactionEditor(id) {
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction) return;
    const categories = state.categories.filter((category) => directionForCategory(category) === transaction.direction);
    document.querySelector("#transaction-id").value = transaction.id;
    document.querySelector("#transaction-category").innerHTML = categories.map((category) => `<option value="${escapeHtml(category.id)}"${category.id === transaction.categoryId ? " selected" : ""}>${escapeHtml(category.name)}${category.active === false ? "（非表示）" : ""}</option>`).join("");
    document.querySelector("#transaction-amount").value = transaction.amount;
    const dateInput = document.querySelector("#transaction-date");
    dateInput.min = state.settings.startDate;
    dateInput.max = state.settings.endDate;
    dateInput.value = transaction.date;
    document.querySelector("#transaction-memo").value = transaction.memo || "";
    openDialog(transactionDialog);
  }

  function openCategoryEditor(id = null, group = "variable") {
    const category = id ? categoryById(id) : null;
    document.querySelector("#category-dialog-title").textContent = category ? "種別を編集" : "種別を追加";
    document.querySelector("#category-id").value = category ? category.id : "";
    document.querySelector("#category-name").value = category ? category.name : "";
    document.querySelector("#category-group").value = category ? category.group : group;
    document.querySelector("#category-color").value = category ? category.color : (group === "income" ? "#2b8a63" : "#3f7d5b");
    document.querySelector("#category-delete").hidden = !category;
    openDialog(categoryDialog);
  }

  function openPlanEditor(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    cancelPlanPointerTracking();
    editingPlanCategoryId = categoryId;
    planDraft = {};
    planRuleDraft = category.planRule ? { ...category.planRule, amount: Math.max(0, toInteger(category.planRule.amount)) } : null;
    planScaleDraft = normalizePlanScaleMax(category.planScaleMax);
    selectedPlanMonth = null;
    periodMonths().forEach((month) => { planDraft[month] = Math.max(0, toInteger(planAmount(categoryId, month))); });
    document.querySelector("#plan-category-name").textContent = category.name;
    const planLength = periodMonths().length;
    document.querySelector("#plan-kind").textContent = category.group === "income" ? `収入予定・${planLength}ヶ月` : category.group === "fixed" ? `固定支出・${planLength}ヶ月` : `変動支出・${planLength}ヶ月`;
    document.querySelector("#plan-start-month").innerHTML = monthOptions(planRuleDraft && periodMonths().includes(planRuleDraft.startMonth) ? planRuleDraft.startMonth : periodMonths()[0]);
    document.querySelector("#plan-interval").value = String(planRuleDraft ? planRuleDraft.interval : 1);
    document.querySelector("#plan-bulk-amount").value = planRuleDraft ? planRuleDraft.amount : (planDraft[currentPeriod] ?? category.defaultAmount ?? 0);
    document.querySelector("#plan-scale-max").value = String(planScaleDraft);
    renderPlanEditor();
    openDialog(planDialog);
  }

  function renderPlanEditor() {
    const category = categoryById(editingPlanCategoryId);
    if (!category || !planDraft) return;
    updatePlanScaleSummary();
    monthlyPlanEditor.innerHTML = periodMonths().map((month) => {
      const amount = Math.max(0, toInteger(planDraft[month]));
      const height = planBarHeight(amount);
      const overScale = amount > planScaleDraft;
      const sliderValue = planBarPositionAmount(amount);
      const valueText = `${formatCurrency(amount)}${overScale ? `（棒の上限 ${formatCurrency(planScaleDraft)}を超過）` : ""}`;
      const selected = month === selectedPlanMonth;
      return `<article class="month-plan-column ${selected ? "selected" : ""} ${overScale ? "over-scale" : ""}" data-plan-column="${month}" style="--category-color:${escapeHtml(category.color)}">
        <span class="month-plan-label">${monthLabel(month, false)}<br>${monthParts(month).year}<span class="month-plan-selected-indicator"${selected ? "" : " hidden"}>選択中</span></span>
        <div class="month-plan-bar-area" data-plan-slider="${month}" role="slider" tabindex="0" aria-label="${monthLabel(month)}の計画金額" aria-describedby="plan-scale-step" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="${planScaleDraft}" aria-valuenow="${sliderValue}" aria-valuetext="${escapeHtml(valueText)}"${selected ? ' aria-current="true"' : ""}>
          <span class="month-plan-overflow"${overScale ? "" : " hidden"}>上限超過</span>
          <span class="month-plan-bar" style="--bar-height:${height}%"></span>
        </div>
        <input class="month-plan-input" data-plan-month="${month}" type="number" min="0" step="any" inputmode="numeric" value="${amount}" aria-label="${monthLabel(month)}の計画金額">
      </article>`;
    }).join("");
    updatePlanSelectionUi();
  }

  function updatePlanSelectionUi() {
    const months = periodMonths();
    const selectedIndex = months.indexOf(selectedPlanMonth);
    monthlyPlanEditor.querySelectorAll("[data-plan-column]").forEach((column) => {
      const selected = column.dataset.planColumn === selectedPlanMonth;
      column.classList.toggle("selected", selected);
      const indicator = column.querySelector(".month-plan-selected-indicator");
      if (indicator) indicator.hidden = !selected;
      const barArea = column.querySelector(".month-plan-bar-area");
      if (selected) barArea.setAttribute("aria-current", "true");
      else barArea.removeAttribute("aria-current");
    });
    const copyButton = document.querySelector("#copy-next-plan");
    const canCopy = selectedIndex >= 0 && selectedIndex < months.length - 1;
    copyButton.disabled = !canCopy;
    if (selectedIndex < 0) copyButton.title = "棒または金額欄で月を選択してください";
    else if (!canCopy) copyButton.title = "最後の月から先にはコピーできません";
    else copyButton.title = `${monthLabel(months[selectedIndex])}を${monthLabel(months[selectedIndex + 1])}へコピー`;
  }

  function selectPlanMonth(month, scrollIntoView = false) {
    if (!periodMonths().includes(month)) return;
    selectedPlanMonth = month;
    updatePlanSelectionUi();
    if (!scrollIntoView) return;
    const column = monthlyPlanEditor.querySelector(`[data-plan-column="${month}"]`);
    if (column) column.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function updatePlanScaleSummary() {
    document.querySelector("#plan-scale-summary").textContent = `上端 ${formatCurrency(planScaleDraft)}`;
    document.querySelector("#plan-scale-step").textContent = `棒は${formatCurrency(planBarStep())}刻み`;
  }

  function updatePlanColumn(month, amount, syncInput = true) {
    if (!planDraft || !Object.prototype.hasOwnProperty.call(planDraft, month)) return;
    const normalizedAmount = Math.max(0, toInteger(amount));
    planDraft[month] = normalizedAmount;
    const column = monthlyPlanEditor.querySelector(`[data-plan-column="${month}"]`);
    if (!column) return;
    const barArea = column.querySelector(".month-plan-bar-area");
    const bar = column.querySelector(".month-plan-bar");
    const input = column.querySelector(".month-plan-input");
    const overflow = column.querySelector(".month-plan-overflow");
    const overScale = normalizedAmount > planScaleDraft;
    bar.style.setProperty("--bar-height", `${planBarHeight(normalizedAmount)}%`);
    barArea.setAttribute("aria-valuemax", String(planScaleDraft));
    barArea.setAttribute("aria-valuenow", String(planBarPositionAmount(normalizedAmount)));
    barArea.setAttribute("aria-valuetext", `${formatCurrency(normalizedAmount)}${overScale ? `（棒の上限 ${formatCurrency(planScaleDraft)}を超過）` : ""}`);
    column.classList.toggle("over-scale", overScale);
    overflow.hidden = !overScale;
    if (syncInput) input.value = String(normalizedAmount);
  }

  function refreshPlanColumns() {
    updatePlanScaleSummary();
    Object.entries(planDraft || {}).forEach(([month, amount]) => updatePlanColumn(month, amount, false));
  }

  function amountForPlanPointer(barArea, clientY) {
    const bounds = barArea.getBoundingClientRect();
    if (!bounds.height) return 0;
    const ratio = clamp((bounds.bottom - clientY) / bounds.height, 0, 1);
    const step = planBarStep();
    const rawAmount = ratio * planScaleDraft;
    if (rawAmount >= planScaleDraft - (step / 2)) return planScaleDraft;
    return clamp(roundAmountToStep(rawAmount, step), 0, planScaleDraft);
  }

  function setPlanAmountFromPointer(barArea, clientY) {
    updatePlanColumn(barArea.dataset.planSlider, amountForPlanPointer(barArea, clientY));
  }

  function capturePlanPointer(barArea, pointerId) {
    if (typeof barArea.setPointerCapture !== "function") return false;
    try {
      barArea.setPointerCapture(pointerId);
      return true;
    } catch (error) {
      console.debug("Pointer capture unavailable", error);
      return false;
    }
  }

  function focusPlanBar(barArea) {
    try { barArea.focus({ preventScroll: true }); }
    catch (error) { barArea.focus(); }
  }

  function releasePlanPointer(gesture) {
    gesture.barArea.classList.remove("is-dragging", "is-pointer-active");
    if (typeof gesture.barArea.hasPointerCapture !== "function" || typeof gesture.barArea.releasePointerCapture !== "function") return;
    try {
      if (gesture.barArea.hasPointerCapture(gesture.pointerId)) gesture.barArea.releasePointerCapture(gesture.pointerId);
    } catch (error) {
      console.debug("Pointer release unavailable", error);
    }
  }

  function addPlanPointerTracking() {
    window.addEventListener("pointermove", handlePlanPointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handlePlanPointerUp, true);
    window.addEventListener("pointercancel", handlePlanPointerCancel, true);
  }

  function removePlanPointerTracking() {
    window.removeEventListener("pointermove", handlePlanPointerMove, true);
    window.removeEventListener("pointerup", handlePlanPointerUp, true);
    window.removeEventListener("pointercancel", handlePlanPointerCancel, true);
  }

  function handlePlanPointerMove(event) {
    const gesture = planPointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    setPlanAmountFromPointer(gesture.barArea, event.clientY);
  }

  function handlePlanPointerUp(event) {
    finishPlanPointer(event);
  }

  function handlePlanPointerCancel(event) {
    finishPlanPointer(event, true);
  }

  function finishPlanPointer(event, cancelled = false) {
    const gesture = planPointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!cancelled) setPlanAmountFromPointer(gesture.barArea, event.clientY);
    if (event.cancelable) event.preventDefault();
    planPointerGesture = null;
    removePlanPointerTracking();
    releasePlanPointer(gesture);
  }

  function cancelPlanPointerTracking() {
    const gesture = planPointerGesture;
    if (!gesture) return;
    planPointerGesture = null;
    removePlanPointerTracking();
    releasePlanPointer(gesture);
  }

  function commitPlanInput(event) {
    if (!event.target.dataset.planMonth) return;
    updatePlanColumn(event.target.dataset.planMonth, Math.max(0, toInteger(event.target.value)));
  }

  function applyPlanPattern() {
    const months = periodMonths();
    const startMonth = document.querySelector("#plan-start-month").value;
    const startIndex = months.indexOf(startMonth);
    const interval = clamp(toInteger(document.querySelector("#plan-interval").value, 1), 1, 36);
    const amount = Math.max(0, toInteger(document.querySelector("#plan-bulk-amount").value));
    document.querySelector("#plan-bulk-amount").value = String(amount);
    planRuleDraft = { startMonth, interval, amount };
    months.forEach((month, index) => {
      planDraft[month] = index >= startIndex && (index - startIndex) % interval === 0 ? amount : 0;
    });
    selectedPlanMonth = startMonth;
    renderPlanEditor();
    showToast("一括パターンを反映しました。保存すると確定します");
  }

  function copyPlanToNextMonth() {
    const months = periodMonths();
    const selectedIndex = months.indexOf(selectedPlanMonth);
    if (selectedIndex < 0 || selectedIndex >= months.length - 1) return;
    const sourceMonth = months[selectedIndex];
    const nextMonth = months[selectedIndex + 1];
    updatePlanColumn(nextMonth, planDraft[sourceMonth]);
    planRuleDraft = null;
    selectPlanMonth(nextMonth, true);
    showToast(`${monthLabel(sourceMonth)}の金額を${monthLabel(nextMonth)}へコピーしました`);
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function csvEscape(value, protectFormula = false) {
    let text = String(value ?? "");
    if (protectFormula && /^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const headers = ["recordType", "id", "categoryId", "name", "group", "date", "month", "amount", "memo", "closingDay", "startDate", "endDate", "color", "order", "active", "createdAt", "updatedAt", "planScaleMax", "dailyBudgetEnabled"];
    const rows = [headers];
    rows.push(["settings", "main", "", APP_NAME, "", "", "", "", "", state.settings.closingDay, state.settings.startDate, state.settings.endDate, "", "", "", state.createdAt || "", state.updatedAt || "", "", ""]);
    state.categories.forEach((category) => {
      rows.push(["category", category.id, "", category.name, category.group, "", "", category.defaultAmount || 0, "", "", "", "", category.color, category.order, category.active !== false, "", "", normalizePlanScaleMax(category.planScaleMax), category.dailyBudgetEnabled === true]);
      if (category.planRule) rows.push(["rule", `${category.id}|rule`, category.id, "", "", "", category.planRule.startMonth, category.planRule.amount, "", "", "", "", "", category.planRule.interval, "", "", "", "", ""]);
    });
    periodMonths().forEach((month) => state.categories.forEach((category) => rows.push(["plan", `${category.id}|${month}`, category.id, "", "", "", month, planAmount(category.id, month), "", "", "", "", "", "", "", "", "", "", ""])));
    state.transactions.forEach((transaction) => rows.push(["transaction", transaction.id, transaction.categoryId, "", transaction.direction, transaction.date, "", transaction.amount, transaction.memo || "", "", "", "", "", "", "", transaction.createdAt || "", transaction.updatedAt || "", "", ""]));
    const content = `\uFEFF${rows.map((row, rowIndex) => row.map((value) => csvEscape(value, rowIndex > 0 && typeof value === "string")).join(",")).join("\r\n")}`;
    downloadBlob(content, "text/csv;charset=utf-8", `budget-minus-${localDateKey()}.csv`);
    showToast("Excel互換CSVを書き出しました");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = text.replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === ",") { row.push(field); field = ""; }
      else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
      else field += character;
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
    return rows;
  }

  function cleanImportedText(value) {
    return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
  }

  function isSafeImportedId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._|:-]*$/.test(String(value));
  }

  function normalizeImportedDate(value) {
    const match = cleanImportedText(String(value || "").trim()).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!match) return "";
    const normalized = `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    return isValidDateKey(normalized) ? normalized : "";
  }

  function normalizeImportedMonth(value) {
    const match = cleanImportedText(String(value || "").trim()).match(/^(\d{4})[\/-](\d{1,2})$/);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return "";
    return `${match[1]}-${pad(match[2])}`;
  }

  function stateFromCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSVにデータがありません。");
    const headers = rows[0];
    const required = ["recordType", "id", "categoryId", "name", "group", "date", "month", "amount", "memo", "closingDay", "startDate", "endDate", "color", "order", "active"];
    if (required.some((header) => !headers.includes(header))) throw new Error("本アプリが出力したCSV形式ではありません。");
    const records = rows.slice(1).filter((row) => row.some((field) => field !== "")).map((row, index) => {
      const record = {};
      headers.forEach((header, column) => { record[header] = row[column] ?? ""; });
      record.rowNumber = index + 2;
      return record;
    });
    const settings = records.find((record) => record.recordType === "settings");
    if (!settings) throw new Error("基本設定の行がありません。");
    const importedStartDate = normalizeImportedDate(settings.startDate);
    const importedEndDate = normalizeImportedDate(settings.endDate);
    if (!importedStartDate || !importedEndDate) throw new Error("基本設定の日付が不正です。");
    if (parseLocalDate(importedEndDate) < parseLocalDate(importedStartDate)) throw new Error("CSVの終了日が開始日より前です。");
    const importedClosingDay = toInteger(settings.closingDay, 0);
    if (importedClosingDay < 1 || importedClosingDay > 31) throw new Error("CSVの締日が不正です。");
    const imported = {
      id: "main",
      schemaVersion: 4,
      settings: { closingDay: importedClosingDay, startDate: importedStartDate, endDate: importedEndDate, currency: "JPY" },
      categories: [],
      plans: {},
      transactions: [],
      createdAt: settings.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    records.filter((record) => record.recordType === "category").forEach((record) => {
      if (!isSafeImportedId(record.id) || !["variable", "fixed", "income"].includes(record.group)) throw new Error(`CSV ${record.rowNumber}行目の種別が不正です。`);
      if (imported.categories.some((category) => category.id === record.id)) throw new Error(`CSV ${record.rowNumber}行目の種別IDが重複しています。`);
      const importedDailySetting = String(record.dailyBudgetEnabled || "").trim().toLowerCase();
      if (importedDailySetting && !["true", "false"].includes(importedDailySetting)) throw new Error(`CSV ${record.rowNumber}行目の日毎予算設定が不正です。`);
      const dailyBudgetEnabled = record.group === "variable" && (importedDailySetting ? importedDailySetting === "true" : record.id === "expense-food");
      imported.categories.push({ id: record.id, name: cleanImportedText(record.name).trim() || "名称未設定", group: record.group, color: /^#[0-9a-f]{6}$/i.test(record.color) ? record.color : "#3f7d5b", order: toInteger(record.order), active: record.active !== "false", defaultAmount: Math.max(0, toInteger(record.amount)), planScaleMax: normalizePlanScaleMax(record.planScaleMax), dailyBudgetEnabled });
      imported.plans[record.id] = {};
    });
    const categoryIds = new Set(imported.categories.map((category) => category.id));
    records.filter((record) => record.recordType === "rule").forEach((record) => {
      const category = imported.categories.find((item) => item.id === record.categoryId);
      const interval = toInteger(record.order, 0);
      const ruleMonth = normalizeImportedMonth(record.month);
      if (!category || !ruleMonth || interval < 1 || interval > 36 || toInteger(record.amount, -1) < 0) throw new Error(`CSV ${record.rowNumber}行目の一括設定ルールが不正です。`);
      category.planRule = { startMonth: ruleMonth, interval, amount: toInteger(record.amount) };
    });
    records.filter((record) => record.recordType === "plan").forEach((record) => {
      const planMonth = normalizeImportedMonth(record.month);
      if (!categoryIds.has(record.categoryId) || !planMonth || toInteger(record.amount, -1) < 0) throw new Error(`CSV ${record.rowNumber}行目の月別計画が不正です。`);
      imported.plans[record.categoryId][planMonth] = toInteger(record.amount);
    });
    const transactionIds = new Set();
    records.filter((record) => record.recordType === "transaction").forEach((record) => {
      const transactionDate = normalizeImportedDate(record.date);
      if (!isSafeImportedId(record.id) || !categoryIds.has(record.categoryId) || !["expense", "income"].includes(record.group) || !transactionDate || toInteger(record.amount) <= 0) throw new Error(`CSV ${record.rowNumber}行目の実績が不正です。`);
      if (transactionIds.has(record.id)) throw new Error(`CSV ${record.rowNumber}行目の実績IDが重複しています。`);
      transactionIds.add(record.id);
      const category = imported.categories.find((item) => item.id === record.categoryId);
      if (directionForImportedCategory(category) !== record.group) throw new Error(`CSV ${record.rowNumber}行目の実績区分と種別が一致しません。`);
      imported.transactions.push({ id: record.id, categoryId: record.categoryId, direction: record.group, date: transactionDate, amount: toInteger(record.amount), memo: cleanImportedText(record.memo), createdAt: record.createdAt || new Date().toISOString(), updatedAt: record.updatedAt || new Date().toISOString() });
    });
    if (!imported.categories.length) throw new Error("CSVに種別がありません。");
    return imported;
  }

  function directionForImportedCategory(category) {
    return category && category.group === "income" ? "income" : "expense";
  }

  function exportJson() {
    const payload = { app: APP_NAME, backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), state };
    downloadBlob(JSON.stringify(payload, null, 2), "application/json", `budget-minus-backup-${localDateKey()}.json`);
    showToast("JSONバックアップを書き出しました");
  }

  function validateImportedState(imported) {
    if (!imported || typeof imported !== "object" || !imported.settings || !Array.isArray(imported.categories) || !Array.isArray(imported.transactions) || !imported.plans || typeof imported.plans !== "object") {
      throw new Error("バックアップのデータ構造が不正です。");
    }
    const { startDate, endDate, closingDay } = imported.settings;
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || parseLocalDate(endDate) < parseLocalDate(startDate) || toInteger(closingDay) < 1 || toInteger(closingDay) > 31) {
      throw new Error("バックアップの基本設定が不正です。");
    }
    if (periodCountForSettings({ startDate, endDate, closingDay: toInteger(closingDay) }) > 120) {
      throw new Error("バックアップの管理期間は最大120ヶ月にしてください。");
    }
    const ids = new Set();
    imported.categories.forEach((category) => {
      if (!category || !isSafeImportedId(category.id) || ids.has(String(category.id)) || !["variable", "fixed", "income"].includes(category.group)) throw new Error("バックアップの種別データが不正です。");
      if (category.planScaleMax !== undefined && (!Number.isFinite(Number(category.planScaleMax)) || Number(category.planScaleMax) <= 0 || Number(category.planScaleMax) > MAX_PLAN_SCALE_MAX)) throw new Error(`${category.name || "種別"}の棒上限額が不正です。`);
      if (category.dailyBudgetEnabled !== undefined && typeof category.dailyBudgetEnabled !== "boolean") throw new Error(`${category.name || "種別"}の日毎予算設定が不正です。`);
      ids.add(String(category.id));
      const categoryPlans = imported.plans[category.id] || {};
      Object.entries(categoryPlans).forEach(([month, amount]) => {
        if (!isValidMonthKey(month) || toInteger(amount, -1) < 0) throw new Error(`${category.name || "種別"}の月別計画が不正です。`);
      });
      if (category.planRule && (!isValidMonthKey(category.planRule.startMonth) || toInteger(category.planRule.interval) < 1 || toInteger(category.planRule.interval) > 36 || toInteger(category.planRule.amount, -1) < 0)) throw new Error(`${category.name || "種別"}の一括設定ルールが不正です。`);
    });
    const transactionIds = new Set();
    imported.transactions.forEach((transaction) => {
      if (!transaction || !isSafeImportedId(transaction.id) || transactionIds.has(String(transaction.id)) || !ids.has(String(transaction.categoryId)) || !["expense", "income"].includes(transaction.direction) || !isValidDateKey(transaction.date) || toInteger(transaction.amount) <= 0) throw new Error("バックアップの実績データが不正です。");
      const category = imported.categories.find((item) => String(item.id) === String(transaction.categoryId));
      if (directionForImportedCategory(category) !== transaction.direction) throw new Error("バックアップの実績区分と種別が一致しません。");
      transactionIds.add(String(transaction.id));
    });
  }

  async function importDataFile(file, type) {
    const text = await file.text();
    let imported;
    if (type === "csv") imported = stateFromCsv(text);
    else {
      const payload = JSON.parse(text);
      if (!payload || payload.app !== APP_NAME || payload.backupVersion !== BACKUP_VERSION || !payload.state) throw new Error("有効なBudget Minusバックアップではありません。");
      imported = payload.state;
    }
    validateImportedState(imported);
    const description = `${imported.categories.length}種別、${imported.transactions.length}件の実績を読み込みます。現在のデータは置き換わります。`;
    if (!window.confirm(description)) return;
    state = await window.BudgetDB.saveState(imported, currentProject && currentProject.id);
    syncCurrentProjectPeriod();
    currentPeriod = currentPeriodForToday();
    analysisPeriod = currentPeriod;
    render();
    showToast("データをインポートしました");
  }

  async function handleViewClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.categoryId && Date.now() < expenseReorderSuppressClickUntil) return;
    if (target.dataset.categoryId) openCalculator(target.dataset.categoryId);
    else if (target.dataset.transactionId) openTransactionEditor(target.dataset.transactionId);
    else if (target.dataset.analysisMode) { analysisMode = target.dataset.analysisMode === "income" ? "income" : "expense"; render(); }
    else if (target.dataset.settingsPane) { settingsPane = target.dataset.settingsPane; render(); }
    else if (target.dataset.addCategory) openCategoryEditor(null, target.dataset.addCategory);
    else if (target.dataset.editCategory) openCategoryEditor(target.dataset.editCategory);
    else if (target.dataset.planCategory) openPlanEditor(target.dataset.planCategory);
    else if (target.dataset.cumulativeChartIndex !== undefined) { cumulativeChartSelectedIndex = clamp(toInteger(target.dataset.cumulativeChartIndex), 0, Math.max(0, periodMonths().length - 1)); render(); }
    else if (target.dataset.toggleCategoryActive) await toggleExpenseCategoryActive(target.dataset.toggleCategoryActive);
    else if (target.dataset.action === "toggle-income") { incomeExpanded = !incomeExpanded; render(); }
    else if (target.dataset.action === "toggle-history") { allTransactionsShown = !allTransactionsShown; render(); }
    else if (target.dataset.action === "export-csv") exportCsv();
    else if (target.dataset.action === "export-json") exportJson();
    else if (target.dataset.action === "import-csv") { importFile.dataset.importType = "csv"; importFile.accept = "text/csv,.csv"; importFile.value = ""; importFile.click(); }
    else if (target.dataset.action === "import-json") { importFile.dataset.importType = "json"; importFile.accept = "application/json,.json"; importFile.value = ""; importFile.click(); }
    else if (target.dataset.action === "load-project") await loadSelectedProject();
    else if (target.dataset.action === "set-default-project") await setCurrentProjectAsDefault();
    else if (target.dataset.action === "delete-project") await deleteCurrentProject();
    else if (target.dataset.action === "reset-data") openDialog(resetDialog);
  }

  async function handleViewChange(event) {
    const dailyBudgetCategoryId = event.target.dataset.dailyBudgetCategory;
    if (dailyBudgetCategoryId) {
      const category = categoryById(dailyBudgetCategoryId);
      if (!category || category.group !== "variable") return;
      const previousValue = category.dailyBudgetEnabled === true;
      category.dailyBudgetEnabled = event.target.checked;
      try {
        await persist(`${category.name}の日毎予算管理を${event.target.checked ? "有効" : "無効"}にしました`);
      } catch (error) {
        category.dailyBudgetEnabled = previousValue;
        event.target.checked = previousValue;
        throw error;
      }
    } else if (event.target.id === "entry-period" || event.target.id === "overview-period") {
      currentPeriod = event.target.value;
      if (event.target.id === "overview-period") cumulativeChartSelectedIndex = periodMonths().indexOf(currentPeriod);
      allTransactionsShown = false;
      render();
    } else if (event.target.id === "analysis-period") {
      analysisPeriod = event.target.value;
      render();
    } else if (event.target.id === "project-start-date") {
      const suggestedEndDate = projectEndDateForStart(event.target.value);
      if (suggestedEndDate) document.querySelector("#project-end-date").value = suggestedEndDate;
    } else if (event.target.name === "theme-id") {
      const selectedPreset = themePresetFor(event.target.value);
      applyThemePreset(selectedPreset);
      document.querySelectorAll(".theme-preset").forEach((item) => item.classList.toggle("selected", item.contains(event.target)));
    }
  }

  async function handleViewSubmit(event) {
    if (event.target.id === "project-rename-form") {
      event.preventDefault();
      await renameCurrentProject();
      return;
    }
    if (event.target.id === "project-create-form") {
      event.preventDefault();
      await createAndLoadProject();
      return;
    }
    if (event.target.id !== "basic-settings-form") return;
    event.preventDefault();
    const closingDay = clamp(toInteger(document.querySelector("#closing-day").value, 31), 1, 31);
    const startDate = document.querySelector("#start-date").value;
    const endDate = document.querySelector("#end-date").value;
    const themeId = themePresetFor(document.querySelector('input[name="theme-id"]:checked')?.value).id;
    if (!startDate || !endDate || parseLocalDate(endDate) < parseLocalDate(startDate)) {
      showToast("終了日は開始日以降にしてください");
      return;
    }
    if (closingDay !== Number(state.settings.closingDay) && state.transactions.length && !window.confirm("締日を変えると、入力済み実績が所属する月も再計算されます。変更しますか？")) return;
    const previousSettings = state.settings;
    state.settings = { ...state.settings, closingDay, startDate, endDate, themeId };
    const months = periodMonths();
    if (months.length > 120) {
      state.settings = previousSettings;
      showToast("管理期間は最大120ヶ月にしてください");
      return;
    }
    state.categories.forEach((category) => {
      if (!state.plans[category.id]) state.plans[category.id] = {};
      months.forEach((month) => {
        if (state.plans[category.id][month] === undefined) state.plans[category.id][month] = category.active === false ? 0 : generatedPlanAmount(category, month);
      });
    });
    currentPeriod = currentPeriodForToday();
    analysisPeriod = currentPeriod;
    applyTheme();
    await persist("基本設定を保存しました");
    render();
  }

  document.querySelector(".bottom-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    currentView = button.dataset.view;
    render();
    viewHost.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  viewHost.addEventListener("pointerdown", startExpenseReorder);
  viewHost.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".reorderable-category-grid .budget-card")) event.preventDefault();
  });
  viewHost.addEventListener("click", (event) => handleViewClick(event).catch((error) => showToast(error instanceof Error ? error.message : "操作を完了できませんでした")));
  viewHost.addEventListener("change", (event) => handleViewChange(event).catch((error) => showToast(error instanceof Error ? error.message : "設定を保存できませんでした")));
  viewHost.addEventListener("submit", (event) => handleViewSubmit(event).catch((error) => showToast(error instanceof Error ? error.message : "保存できませんでした")));

  document.querySelector("#calculator-keys").addEventListener("click", (event) => {
    const key = event.target.closest("[data-calc]");
    if (key) handleCalculatorKey(key.dataset.calc);
  });
  document.querySelector("#calculator-ok").addEventListener("click", () => acceptCalculator().catch((error) => showToast(error.message)));

  document.querySelector("#app-version-button").addEventListener("click", () => {
    document.querySelector("#app-version-name").textContent = `v${APP_VERSION}`;
    openDialog(versionDialog);
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.querySelector(`#${button.dataset.close}`)));
  });
  planDialog.addEventListener("cancel", cancelPlanPointerTracking);
  planDialog.addEventListener("close", cancelPlanPointerTracking);

  document.querySelector("#memo-form").addEventListener("submit", (event) => {
    event.preventDefault();
    savePendingTransaction(document.querySelector("#memo-input").value).catch((error) => showToast(error.message));
  });
  document.querySelector("#memo-skip").addEventListener("click", () => savePendingTransaction("").catch((error) => showToast(error.message)));
  memoDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    savePendingTransaction("").catch((error) => showToast(error.message));
  });

  document.querySelector("#reset-form").addEventListener("submit", (event) => {
    event.preventDefault();
    resetCurrentProject().catch((error) => showToast(error instanceof Error ? error.message : "初期化できませんでした"));
  });

  document.querySelector("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.querySelector("#transaction-id").value;
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction) return;
    const categoryId = document.querySelector("#transaction-category").value;
    const amount = Math.max(1, toInteger(document.querySelector("#transaction-amount").value, 1));
    const date = document.querySelector("#transaction-date").value;
    if (date < state.settings.startDate || date > state.settings.endDate) {
      showToast("日付は管理期間内にしてください");
      return;
    }
    transaction.categoryId = categoryId;
    transaction.amount = amount;
    transaction.date = date;
    transaction.memo = document.querySelector("#transaction-memo").value.trim();
    transaction.updatedAt = new Date().toISOString();
    closeDialog(transactionDialog);
    await persist("明細を更新しました");
    render();
  });

  document.querySelector("#transaction-delete").addEventListener("click", async () => {
    const id = document.querySelector("#transaction-id").value;
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction || !window.confirm(`${formatCurrency(transaction.amount)}の記録を削除しますか？`)) return;
    state.transactions = state.transactions.filter((item) => item.id !== id);
    closeDialog(transactionDialog);
    await persist("明細を削除しました");
    render();
  });

  document.querySelector("#category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.querySelector("#category-id").value;
    const name = document.querySelector("#category-name").value.trim();
    const group = document.querySelector("#category-group").value;
    const color = document.querySelector("#category-color").value;
    if (!name) return;
    if (id) {
      const category = categoryById(id);
      if (!category) return;
      const hasTransactions = state.transactions.some((item) => item.categoryId === id);
      if (hasTransactions && directionForCategory(category) !== directionForImportedCategory({ group })) {
        showToast("実績がある種別は支出・収入の区分を変更できません");
        return;
      }
      category.name = name;
      category.group = group;
      category.color = color;
      category.active = true;
      category.archivedAt = null;
      if (group !== "variable") category.dailyBudgetEnabled = false;
    } else {
      const categoryId = makeId("category");
      const order = Math.max(0, ...state.categories.map((category) => toInteger(category.order))) + 10;
      state.categories.push({ id: categoryId, name, group, color, order, active: true, defaultAmount: 0, planScaleMax: DEFAULT_PLAN_SCALE_MAX, dailyBudgetEnabled: false });
      state.plans[categoryId] = {};
      periodMonths().forEach((month) => { state.plans[categoryId][month] = 0; });
    }
    closeDialog(categoryDialog);
    await persist("種別を保存しました");
    render();
  });

  document.querySelector("#category-delete").addEventListener("click", async () => {
    const id = document.querySelector("#category-id").value;
    const category = categoryById(id);
    if (!category || !window.confirm(`${category.name}を非表示にしますか？入力済み実績は残ります。`)) return;
    const hasTransactions = state.transactions.some((item) => item.categoryId === id);
    if (hasTransactions) {
      category.active = false;
      category.archivedAt = localDateKey();
      const archiveIndex = Math.max(0, periodMonths().indexOf(currentPeriod));
      periodMonths().forEach((month, index) => {
        if (index >= archiveIndex) state.plans[id][month] = 0;
      });
    }
    else {
      state.categories = state.categories.filter((item) => item.id !== id);
      delete state.plans[id];
    }
    closeDialog(categoryDialog);
    await persist(hasTransactions ? "種別を非表示にしました" : "種別を削除しました");
    render();
  });

  document.querySelector("#apply-plan-pattern").addEventListener("click", applyPlanPattern);
  document.querySelector("#copy-next-plan").addEventListener("click", copyPlanToNextMonth);
  document.querySelector("#plan-scale-max").addEventListener("input", (event) => {
    if (!Number.isFinite(Number(event.target.value)) || Number(event.target.value) <= 0) return;
    planScaleDraft = normalizePlanScaleMax(event.target.value);
    refreshPlanColumns();
  });
  document.querySelector("#plan-scale-max").addEventListener("change", (event) => {
    planScaleDraft = normalizePlanScaleMax(event.target.value);
    event.target.value = String(planScaleDraft);
    refreshPlanColumns();
  });
  monthlyPlanEditor.addEventListener("input", (event) => {
    if (!event.target.dataset.planMonth) return;
    selectPlanMonth(event.target.dataset.planMonth);
    updatePlanColumn(event.target.dataset.planMonth, Math.max(0, toInteger(event.target.value)), false);
  });
  monthlyPlanEditor.addEventListener("focusin", (event) => {
    if (event.target.dataset.planMonth) selectPlanMonth(event.target.dataset.planMonth);
  });
  monthlyPlanEditor.addEventListener("change", commitPlanInput);
  monthlyPlanEditor.addEventListener("focusout", commitPlanInput);
  monthlyPlanEditor.addEventListener("pointerdown", (event) => {
    const barArea = event.target.closest(".month-plan-bar-area");
    if (!barArea || planPointerGesture || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    const month = barArea.dataset.planSlider;
    planPointerGesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      barArea,
      month
    };
    if (event.cancelable) event.preventDefault();
    selectPlanMonth(month);
    barArea.classList.add("is-pointer-active", "is-dragging");
    addPlanPointerTracking();
    capturePlanPointer(barArea, event.pointerId);
    setPlanAmountFromPointer(barArea, event.clientY);
    if (event.pointerType !== "touch") focusPlanBar(barArea);
  });
  monthlyPlanEditor.addEventListener("lostpointercapture", (event) => {
    const gesture = planPointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.captureLost = true;
  });
  monthlyPlanEditor.addEventListener("keydown", (event) => {
    const barArea = event.target.closest(".month-plan-bar-area");
    if (!barArea) return;
    const month = barArea.dataset.planSlider;
    const currentAmount = Math.max(0, toInteger(planDraft[month]));
    const barStep = planBarStep();
    const pageStep = Math.max(barStep, roundAmountToStep(planScaleDraft / 10, barStep));
    let nextAmount;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") nextAmount = currentAmount + barStep;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") nextAmount = currentAmount - barStep;
    else if (event.key === "PageUp") nextAmount = currentAmount + pageStep;
    else if (event.key === "PageDown") nextAmount = currentAmount - pageStep;
    else if (event.key === "Home") nextAmount = 0;
    else if (event.key === "End") nextAmount = planScaleDraft;
    else return;
    event.preventDefault();
    selectPlanMonth(month);
    const maximum = currentAmount > planScaleDraft ? MAX_PLAN_SCALE_MAX : planScaleDraft;
    updatePlanColumn(month, clamp(roundAmountToStep(nextAmount, barStep), 0, maximum));
  });
  document.querySelector("#plan-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = categoryById(editingPlanCategoryId);
    if (!category || !planDraft) return;
    planScaleDraft = normalizePlanScaleMax(document.querySelector("#plan-scale-max").value);
    const normalizedPlanDraft = {};
    Object.entries(planDraft).forEach(([month, amount]) => { normalizedPlanDraft[month] = Math.max(0, toInteger(amount)); });
    state.plans[editingPlanCategoryId] = { ...(state.plans[editingPlanCategoryId] || {}), ...normalizedPlanDraft };
    category.defaultAmount = Math.max(0, toInteger(normalizedPlanDraft[currentPeriod] ?? Object.values(normalizedPlanDraft)[0]));
    category.planRule = planRuleDraft ? { ...planRuleDraft, amount: Math.max(0, toInteger(planRuleDraft.amount)) } : null;
    category.planScaleMax = planScaleDraft;
    cancelPlanPointerTracking();
    closeDialog(planDialog);
    await persist(`${category.name}の計画を保存しました`);
    render();
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try { await importDataFile(file, importFile.dataset.importType); }
    catch (error) { showToast(error instanceof Error ? error.message : "ファイルを読み込めませんでした"); }
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("focus", refreshForCurrentDeviceDate);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshForCurrentDeviceDate();
  });

  function refreshForCurrentDeviceDate() {
    if (!state || localDateKey() === lastRenderedDate) return;
    render();
  }

  async function initialize() {
    try {
      applyLoadedProject(await window.BudgetDB.getWorkspace());
      updateNetworkStatus();
      render();
    } catch (error) {
      viewHost.innerHTML = `<div class="card"><h2>データを開けませんでした</h2><p>${escapeHtml(error instanceof Error ? error.message : "時間をおいて再度お試しください。")}</p></div>`;
    }

    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register(new URL("sw.js?v=27", document.baseURI), {
          scope: "./",
          updateViaCache: "none"
        });
      } catch (error) {
        console.error("Service Workerの登録に失敗しました。", error);
      }
    }
  }

  initialize();
})();
