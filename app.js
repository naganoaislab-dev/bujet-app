(function () {
  "use strict";

  const APP_NAME = "Budget Minus";
  const APP_VERSION = "0.5.56";
  const BACKUP_VERSION = 2;
  const SIGNED_INCOME_GROUP = "income-signed";
  const UNEXPECTED_EXPENSE_CATEGORY_ID = "expense-unplanned";
  const UNEXPECTED_INCOME_CATEGORY_ID = "income-unplanned";
  const ANALYSIS_PAGE_COUNT = 3;
  const EXPENSE_CATEGORY_GROUPS = Object.freeze(["variable", "fixed"]);
  const INCOME_CATEGORY_GROUPS = Object.freeze(["income", SIGNED_INCOME_GROUP]);
  const CATEGORY_GROUP_LABELS = Object.freeze({
    variable: "変動支出",
    fixed: "固定支出",
    income: "収入",
    [SIGNED_INCOME_GROUP]: "収入（マイナス込み）"
  });
  const REMINDER_SCHEDULE_DAY = "day";
  const REMINDER_SCHEDULE_WEEKDAY = "weekday";
  const REMINDER_WEEKDAY_LABELS = Object.freeze(["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"]);
  const PLAN_AMOUNT_STEP = 100;
  const MIN_PLAN_SCALE_MAX = 100;
  const PLAN_BAR_STEPS = Object.freeze([
    { maximum: 1000, step: 10 },
    { maximum: 10000, step: 100 },
    { maximum: 50000, step: 500 },
    { maximum: 100000, step: 1000 },
    { maximum: 500000, step: 5000 },
    { maximum: 1000000, step: 10000 },
    { maximum: 5000000, step: 50000 },
    { maximum: 10000000, step: 100000 },
    { maximum: 50000000, step: 500000 },
    { maximum: 100000000, step: 1000000 }
  ]);
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
    entry: "入力",
    overview: "全体状況",
    analysis: "月次状況",
    settings: "設計/計画",
    data: "データ"
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
  const developerClockDialog = document.querySelector("#developer-clock-dialog");
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
  let analysisDetailPage = 0;
  let analysisSelectedDate = "";
  let analysisPageSwipe = null;
  let analysisPageTransitionTimer = null;
  let cumulativeChartSelectedIndex = null;
  let cumulativeAutoScaleEnabled = false;
  let cumulativeScaleWindow = null;
  let overviewChartScrollSyncing = false;
  let overviewChartScaleTimer = null;
  let settingsPane = "basic";
  let incomeExpanded = false;
  let unexpectedEntriesExpanded = false;
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
  let nextDayRenderTimer = null;
  let serviceWorkerRegistration = null;
  let serviceWorkerUpdateRequested = false;

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

  function roundSignedAmountToStep(value, step) {
    const normalizedStep = Math.max(1, toInteger(step, 1));
    return Math.round(toInteger(value) / normalizedStep) * normalizedStep;
  }

  function normalizePlanScaleMax(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_PLAN_SCALE_MAX;
    return clamp(Math.round(amount), MIN_PLAN_SCALE_MAX, MAX_PLAN_SCALE_MAX);
  }

  function planBarStep(scaleMaximum = planScaleDraft) {
    const normalizedScale = normalizePlanScaleMax(scaleMaximum);
    return (PLAN_BAR_STEPS.find((range) => normalizedScale <= range.maximum) || PLAN_BAR_STEPS[PLAN_BAR_STEPS.length - 1]).step;
  }

  function planBarPositionAmount(amount, scaleMaximum = planScaleDraft, allowNegative = false) {
    const maximum = Math.max(MIN_PLAN_SCALE_MAX, normalizePlanScaleMax(scaleMaximum));
    const normalizedAmount = allowNegative ? toInteger(amount) : Math.max(0, toInteger(amount));
    const magnitude = Math.abs(normalizedAmount);
    if (magnitude >= maximum) return allowNegative && normalizedAmount < 0 ? -maximum : maximum;
    const roundedMagnitude = clamp(roundAmountToStep(magnitude, planBarStep(maximum)), 0, maximum);
    return allowNegative && normalizedAmount < 0 ? -roundedMagnitude : roundedMagnitude;
  }

  function planBarHeight(amount, scaleMaximum = planScaleDraft, allowNegative = false) {
    const displayedAmount = planBarPositionAmount(amount, scaleMaximum, allowNegative);
    if (displayedAmount <= 0) return 0;
    return clamp((displayedAmount / Math.max(MIN_PLAN_SCALE_MAX, scaleMaximum)) * 100, 0, 100);
  }

  function planSignedBarHeight(amount, scaleMaximum = planScaleDraft) {
    const displayedAmount = Math.abs(planBarPositionAmount(amount, scaleMaximum, true));
    if (displayedAmount <= 0) return 0;
    return clamp((displayedAmount / Math.max(MIN_PLAN_SCALE_MAX, scaleMaximum)) * 50, 0, 50);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parseDeveloperDateTime(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, year, month, day, hour, minute] = match.map(Number);
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
    return date;
  }

  function developerModeIsEnabled() {
    return state?.settings?.developerModeEnabled === true && Boolean(parseDeveloperDateTime(state.settings.developerDateTime));
  }

  function appNow() {
    const configured = developerModeIsEnabled() ? parseDeveloperDateTime(state.settings.developerDateTime) : null;
    return configured ? new Date(configured.getTime()) : new Date();
  }

  function appTimestamp() {
    return appNow().toISOString();
  }

  function normalizeDateRolloverTime(value) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return "00:00";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "00:00";
    return `${pad(hour)}:${pad(minute)}`;
  }

  function dateRolloverMinutes() {
    const [hour, minute] = normalizeDateRolloverTime(state?.settings?.dateRolloverTime).split(":").map(Number);
    return hour * 60 + minute;
  }

  function appDateForNow(date = appNow()) {
    const target = new Date(date.getTime());
    const rollover = dateRolloverMinutes();
    const currentMinutes = target.getHours() * 60 + target.getMinutes();
    if (rollover >= 12 * 60 && currentMinutes >= rollover) target.setDate(target.getDate() + 1);
    if (rollover < 12 * 60 && currentMinutes < rollover) target.setDate(target.getDate() - 1);
    return target;
  }

  function nextDateRollover(date = new Date()) {
    const rollover = dateRolloverMinutes();
    const next = new Date(date.getTime());
    next.setHours(Math.floor(rollover / 60), rollover % 60, 0, 0);
    if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  function dateTimeInputValue(date = appNow()) {
    return `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function localDateKey(date) {
    const target = date instanceof Date ? date : appDateForNow();
    return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
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
      .filter((category) => category.group === group && !isUnexpectedExpenseCategory(category) && (includeArchived || category.active !== false))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function incomeCategories(includeArchived = false) {
    return state.categories
      .filter((category) => isIncomeCategory(category) && !isUnexpectedIncomeCategory(category) && (includeArchived || category.active !== false))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function expenseCategoriesForReporting(month) {
    return state.categories
      .filter((category) => !isIncomeCategory(category) && (category.active !== false || actualAmount(category.id, month) !== 0))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function incomeCategoriesForReporting(month) {
    return state.categories
      .filter((category) => isIncomeCategory(category) && (category.active !== false || actualAmount(category.id, month) !== 0))
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  function isIncomeCategory(category) {
    return category && ["income", SIGNED_INCOME_GROUP].includes(category.group);
  }

  function isSignedIncomeCategory(category) {
    return category && category.group === SIGNED_INCOME_GROUP;
  }

  function isUnexpectedExpenseCategory(category) {
    return Boolean(category) && (category.id === UNEXPECTED_EXPENSE_CATEGORY_ID || category.isUnexpectedExpense === true);
  }

  function isUnexpectedIncomeCategory(category) {
    return Boolean(category) && (category.id === UNEXPECTED_INCOME_CATEGORY_ID || category.isUnexpectedIncome === true);
  }

  function unexpectedExpenseCategory() {
    return state.categories.find((category) => isUnexpectedExpenseCategory(category) && category.active !== false) || null;
  }

  function unexpectedIncomeCategory() {
    return state.categories.find((category) => isUnexpectedIncomeCategory(category) && category.active !== false) || null;
  }

  function isSignedIncomeGroup(group) {
    return group === SIGNED_INCOME_GROUP;
  }

  function planAllowsNegative(category) {
    return isSignedIncomeCategory(category);
  }

  function normalizePlanAmount(category, amount) {
    const normalized = toInteger(amount);
    return planAllowsNegative(category) ? normalized : Math.max(0, normalized);
  }

  function directionForCategory(category) {
    return isIncomeCategory(category) ? "income" : "expense";
  }

  function planAmount(categoryId, month) {
    return toInteger(state.plans[categoryId] && state.plans[categoryId][month], 0);
  }

  function periodPlanTotal(categoryId) {
    return periodMonths().reduce((sum, month) => sum + planAmount(categoryId, month), 0);
  }

  function activeExpensePlanAmount(category, month) {
    return category && !isIncomeCategory(category) && !isUnexpectedExpenseCategory(category) && category.active !== false ? planAmount(category.id, month) : 0;
  }

  function activeIncomePlanAmount(category, month) {
    return category && isIncomeCategory(category) && !isUnexpectedIncomeCategory(category) && category.active !== false ? planAmount(category.id, month) : 0;
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

  function normalizeReminderConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      enabled: source.enabled === true,
      schedule: source.schedule === REMINDER_SCHEDULE_WEEKDAY ? REMINDER_SCHEDULE_WEEKDAY : REMINDER_SCHEDULE_DAY,
      dayOfMonth: clamp(toInteger(source.dayOfMonth, 1), 1, 31),
      weekOfMonth: clamp(toInteger(source.weekOfMonth, 1), 1, 5),
      weekday: clamp(toInteger(source.weekday, 1), 0, 6)
    };
  }

  function latestCategoryEntryDate(categoryId, month) {
    return transactionsForMonth(month)
      .filter((transaction) => transaction.categoryId === categoryId)
      .reduce((latest, transaction) => {
        const enteredOn = isValidDateKey(transaction.enteredOn) ? transaction.enteredOn : transaction.date;
        return enteredOn > latest ? enteredOn : latest;
      }, "");
  }

  function clampReminderDateToPeriod(date, range) {
    if (date < range.start) return range.start;
    if (date > range.end) return range.end;
    return date;
  }

  function weekdayOnOrAfter(date, weekday) {
    const candidate = parseLocalDate(date);
    candidate.setDate(candidate.getDate() + ((weekday - candidate.getDay() + 7) % 7));
    return localDateKey(candidate);
  }

  function weekdayOnOrBefore(date, weekday) {
    const candidate = parseLocalDate(date);
    candidate.setDate(candidate.getDate() - ((candidate.getDay() - weekday + 7) % 7));
    return localDateKey(candidate);
  }

  function nthWeekdayOfCalendarMonth(year, month, reminder) {
    const days = daysInMonth(year, month);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const firstOccurrence = 1 + ((reminder.weekday - firstDay + 7) % 7);
    let day = firstOccurrence + (reminder.weekOfMonth - 1) * 7;
    if (day > days) {
      const lastDay = new Date(year, month, 0).getDay();
      day = days - ((lastDay - reminder.weekday + 7) % 7);
    }
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function reminderDueDate(periodMonth, reminder) {
    const config = normalizeReminderConfig(reminder);
    const range = periodRange(periodMonth);
    const { year, month } = monthParts(periodMonth);
    if (config.schedule === REMINDER_SCHEDULE_DAY) {
      const configuredClosingDay = clamp(toInteger(state.settings.closingDay, 31), 1, 31);
      const targetMonth = config.dayOfMonth > configuredClosingDay ? addMonthsToKey(periodMonth, -1) : periodMonth;
      const targetParts = monthParts(targetMonth);
      const day = Math.min(config.dayOfMonth, daysInMonth(targetParts.year, targetParts.month));
      return clampReminderDateToPeriod(`${targetParts.year}-${pad(targetParts.month)}-${pad(day)}`, range);
    }
    const dueDate = nthWeekdayOfCalendarMonth(year, month, config);
    if (dueDate < range.start) return clampReminderDateToPeriod(weekdayOnOrAfter(range.start, config.weekday), range);
    if (dueDate > range.end) return clampReminderDateToPeriod(weekdayOnOrBefore(range.end, config.weekday), range);
    return dueDate;
  }

  function needsEntryReminder(category, month, today = localDateKey()) {
    const reminder = normalizeReminderConfig(category && category.reminder);
    if (!category || category.active === false || !reminder.enabled || latestCategoryEntryDate(category.id, month)) return false;
    if (today < state.settings.startDate || today > state.settings.endDate || periodForDate(today) !== month) return false;
    return today >= reminderDueDate(month, reminder);
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
    const carryRemaining = carry > 0
      ? Math.max(0, carry - Math.max(0, actual - plan))
      : carry;
    return { configuredPlan, priorCarry, plan, carry, actual, monthlyRemaining, carryRemaining };
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
    const incomePlan = incomeCategories.reduce((sum, category) => sum + activeIncomePlanAmount(category, month), 0);
    const incomeForecast = incomeCategories.reduce((sum, category) => {
      const planned = activeIncomePlanAmount(category, month);
      const actual = actualAmount(category.id, month);
      return sum + (isSignedIncomeCategory(category) ? (actual !== 0 ? actual : planned) : Math.max(actual, planned));
    }, 0);
    const expenseTransactions = transactionsForMonth(month, "expense");
    const expenseActual = expenseTransactions.reduce((sum, item) => sum + toInteger(item.amount), 0);
    const unexpectedExpenseActual = expenseTransactions.reduce((sum, item) => {
      return sum + (isUnexpectedExpenseCategory(categoryById(item.categoryId)) ? toInteger(item.amount) : 0);
    }, 0);
    const incomeTransactions = transactionsForMonth(month, "income");
    const incomeActual = incomeTransactions.reduce((sum, item) => sum + toInteger(item.amount), 0);
    const unexpectedIncomeActual = incomeTransactions.reduce((sum, item) => {
      return sum + (isUnexpectedIncomeCategory(categoryById(item.categoryId)) ? toInteger(item.amount) : 0);
    }, 0);
    return {
      month,
      expensePlan,
      incomePlan,
      incomeForecast,
      expenseActual,
      unexpectedExpenseActual,
      incomeActual,
      unexpectedIncomeActual,
      plannedNet: incomePlan - expensePlan,
      actualNet: incomeActual - expenseActual
    };
  }

  function projectEndForecastFromAggregates(aggregates, today = localDateKey()) {
    if (!aggregates.length) return 0;
    if (today > state.settings.endDate) return aggregates.reduce((sum, item) => sum + item.actualNet, 0);
    const activePeriodIndex = Math.max(0, aggregates.findIndex((item) => item.month === currentPeriodForToday()));
    return aggregates.reduce((sum, item, index) => {
      if (index < activePeriodIndex) return sum + item.actualNet;
      if (index > activePeriodIndex) return sum + item.plannedNet - item.unexpectedExpenseActual + item.unexpectedIncomeActual;
      const budgetedExpenseActual = Math.max(0, item.expenseActual - item.unexpectedExpenseActual);
      return sum + item.incomeForecast - Math.max(budgetedExpenseActual, item.expensePlan) - item.unexpectedExpenseActual;
    }, 0);
  }

  function projectEndForecastAfterBudgetReturn(month, amount) {
    const aggregates = periodMonths().map(aggregateMonth);
    const target = aggregates.find((item) => item.month === month);
    if (target) {
      target.expensePlan = Math.max(0, target.expensePlan - amount);
      target.plannedNet = target.incomePlan - target.expensePlan;
    }
    return projectEndForecastFromAggregates(aggregates);
  }

  function projectEndForecastAfterBudgetAddition(month, amount) {
    const aggregates = periodMonths().map(aggregateMonth);
    const target = aggregates.find((item) => item.month === month);
    if (target) {
      target.expensePlan += Math.max(0, toInteger(amount));
      target.plannedNet = target.incomePlan - target.expensePlan;
    }
    return projectEndForecastFromAggregates(aggregates);
  }

  function projectEndForecastAfterBudgetPlanChanges(planChanges) {
    const aggregates = periodMonths().map(aggregateMonth);
    planChanges.forEach((change, month) => {
      const target = aggregates.find((item) => item.month === month);
      if (!target) return;
      target.expensePlan = Math.max(0, target.expensePlan + toInteger(change));
      target.plannedNet = target.incomePlan - target.expensePlan;
    });
    return projectEndForecastFromAggregates(aggregates);
  }

  function projectEndForecastAfterUnexpectedExpense(month, amount) {
    const aggregates = periodMonths().map(aggregateMonth);
    const target = aggregates.find((item) => item.month === month);
    if (target) {
      target.expenseActual += amount;
      target.unexpectedExpenseActual += amount;
      target.actualNet -= amount;
    }
    return projectEndForecastFromAggregates(aggregates);
  }

  function projectEndForecastAfterUnexpectedIncome(month, amount) {
    const aggregates = periodMonths().map(aggregateMonth);
    const target = aggregates.find((item) => item.month === month);
    if (target) {
      target.incomeActual += amount;
      target.incomeForecast += amount;
      target.unexpectedIncomeActual += amount;
      target.actualNet += amount;
    }
    return projectEndForecastFromAggregates(aggregates);
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
    return `${prefix}-${appNow().getTime()}-${Math.random().toString(16).slice(2)}`;
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

  function setAppUpdateStatus(message, available = false) {
    const status = document.querySelector("#app-update-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-available", available);
  }

  function refreshAppUpdateUi() {
    const button = document.querySelector("#app-update-check");
    if (!("serviceWorker" in navigator)) {
      button.disabled = true;
      setAppUpdateStatus("このブラウザではアプリ更新を確認できません。");
      return;
    }
    if (serviceWorkerRegistration?.waiting && navigator.serviceWorker.controller) {
      setAppUpdateStatus("新しいバージョンを入手できます。更新確認ボタンから適用してください。", true);
      return;
    }
    setAppUpdateStatus(`現在のバージョンは v${APP_VERSION} です。`);
  }

  function announceAppUpdateAvailable(registration) {
    if (!registration.waiting || !navigator.serviceWorker.controller) return;
    refreshAppUpdateUi();
    showToast("新しいバージョンを入手できます");
  }

  function trackServiceWorkerInstallation(registration, worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") announceAppUpdateAvailable(registration);
    });
  }

  function waitForServiceWorkerInstallation(registration) {
    const worker = registration.installing;
    if (!worker || worker.state === "installed" || worker.state === "redundant") return Promise.resolve();
    return new Promise((resolve) => {
      const handleStateChange = () => {
        if (worker.state !== "installed" && worker.state !== "redundant") return;
        worker.removeEventListener("statechange", handleStateChange);
        resolve();
      };
      worker.addEventListener("statechange", handleStateChange);
    });
  }

  async function applyWaitingServiceWorker(registration) {
    if (!registration.waiting) return false;
    if (!window.confirm("新しいバージョンがあります。今すぐ更新しますか？")) {
      setAppUpdateStatus("新しいバージョンは次回以降に更新できます。", true);
      return false;
    }
    serviceWorkerUpdateRequested = true;
    document.querySelector("#app-update-check").disabled = true;
    setAppUpdateStatus("更新を適用しています。まもなく再読み込みします。", true);
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  }

  async function checkForAppUpdate() {
    if (!("serviceWorker" in navigator)) {
      refreshAppUpdateUi();
      return;
    }
    const button = document.querySelector("#app-update-check");
    button.disabled = true;
    setAppUpdateStatus("最新バージョンを確認しています…");
    try {
      const registration = serviceWorkerRegistration || await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setAppUpdateStatus("更新機能を準備しています。画面を開き直してからもう一度お試しください。");
        return;
      }
      serviceWorkerRegistration = registration;
      if (registration.waiting && navigator.serviceWorker.controller) {
        await applyWaitingServiceWorker(registration);
        return;
      }
      await registration.update();
      if (registration.installing) {
        setAppUpdateStatus("新しいバージョンをダウンロードしています…");
        await waitForServiceWorkerInstallation(registration);
      }
      if (registration.waiting && navigator.serviceWorker.controller) {
        await applyWaitingServiceWorker(registration);
        return;
      }
      setAppUpdateStatus(`すでに最新バージョン（v${APP_VERSION}）です。`);
      showToast("最新バージョンです");
    } catch (error) {
      setAppUpdateStatus("更新を確認できませんでした。通信状況を確認して再試行してください。");
      showToast(error instanceof Error ? error.message : "更新を確認できませんでした");
    } finally {
      if (!serviceWorkerUpdateRequested) button.disabled = false;
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.register(new URL("sw.js", document.baseURI), {
      scope: "./",
      updateViaCache: "none"
    });
    serviceWorkerRegistration = registration;
    registration.addEventListener("updatefound", () => trackServiceWorkerInstallation(registration, registration.installing));
    trackServiceWorkerInstallation(registration, registration.installing);
    announceAppUpdateAvailable(registration);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!serviceWorkerUpdateRequested) return;
      window.location.reload();
    });
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
    unexpectedEntriesExpanded = false;
    allTransactionsShown = false;
    cumulativeChartSelectedIndex = null;
    cumulativeScaleWindow = null;
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
    showToast(`${currentProject.name}を規定のプロジェクトに設定しました`);
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

  async function toggleCategoryActive(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
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

  async function setDeveloperMode(enabled) {
    const previousSettings = { ...state.settings };
    const previousPeriod = currentPeriod;
    const previousAnalysisPeriod = analysisPeriod;
    const existingDate = parseDeveloperDateTime(state.settings.developerDateTime);
    state.settings = {
      ...state.settings,
      developerModeEnabled: enabled === true,
      developerDateTime: existingDate ? state.settings.developerDateTime : dateTimeInputValue(new Date())
    };
    currentPeriod = currentPeriodForToday();
    analysisPeriod = currentPeriod;
    analysisSelectedDate = "";
    try {
      await persist(enabled ? "開発者モードを有効にしました" : "開発者モードを無効にしました。iPhoneの日時へ戻ります");
    } catch (error) {
      state.settings = previousSettings;
      currentPeriod = previousPeriod;
      analysisPeriod = previousAnalysisPeriod;
      throw error;
    }
    render();
  }

  function openDeveloperClockDialog() {
    if (!developerModeIsEnabled()) return;
    document.querySelector("#developer-clock-input").value = dateTimeInputValue(appNow());
    openDialog(developerClockDialog);
  }

  async function saveDeveloperClock() {
    const value = document.querySelector("#developer-clock-input").value;
    const configured = parseDeveloperDateTime(value);
    if (!configured) {
      showToast("有効な日時を設定してください");
      return;
    }
    const previousSettings = { ...state.settings };
    const previousPeriod = currentPeriod;
    const previousAnalysisPeriod = analysisPeriod;
    state.settings = { ...state.settings, developerModeEnabled: true, developerDateTime: value };
    currentPeriod = currentPeriodForToday();
    analysisPeriod = currentPeriod;
    analysisSelectedDate = "";
    try {
      await persist(`アプリ内時刻を${developerClockLabel(configured)}に設定しました`);
    } catch (error) {
      state.settings = previousSettings;
      currentPeriod = previousPeriod;
      analysisPeriod = previousAnalysisPeriod;
      throw error;
    }
    closeDialog(developerClockDialog);
    render();
  }

  function render() {
    const chartScrollPositions = currentView === "overview"
      ? Array.from(viewHost.querySelectorAll("[data-chart-scroll-key]")).map((element) => ({
        key: element.dataset.chartScrollKey,
        left: element.scrollLeft
      }))
      : [];
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

    chartScrollPositions.forEach(({ key, left }) => {
      const element = viewHost.querySelector(`[data-chart-scroll-key="${key}"]`);
      if (element) element.scrollLeft = left;
    });
    if (currentView === "overview") configureOverviewChartInteractions();
    scheduleNextDateRefresh();
  }

  function visibleCumulativeChartWindow() {
    const scroll = viewHost.querySelector('[data-chart-scroll-key="cumulative-net"]');
    if (!scroll) return null;
    const viewport = scroll.getBoundingClientRect();
    const monthCells = Array.from(scroll.querySelectorAll(".cumulative-chart-months span"));
    const visibleIndexes = monthCells.reduce((indexes, cell, index) => {
      const bounds = cell.getBoundingClientRect();
      if (bounds.right > viewport.left + 1 && bounds.left < viewport.right - 1) indexes.push(index);
      return indexes;
    }, []);
    if (!visibleIndexes.length) return null;
    return { start: visibleIndexes[0], end: visibleIndexes[visibleIndexes.length - 1] };
  }

  function refreshCumulativeScaleForVisibleWindow() {
    if (currentView !== "overview" || !cumulativeAutoScaleEnabled) return;
    const nextWindow = visibleCumulativeChartWindow();
    if (!nextWindow || (cumulativeScaleWindow && cumulativeScaleWindow.start === nextWindow.start && cumulativeScaleWindow.end === nextWindow.end)) return;
    cumulativeScaleWindow = nextWindow;
    render();
  }

  function scheduleCumulativeScaleRefresh() {
    if (!cumulativeAutoScaleEnabled || currentView !== "overview") return;
    if (overviewChartScaleTimer) window.clearTimeout(overviewChartScaleTimer);
    overviewChartScaleTimer = window.setTimeout(() => {
      overviewChartScaleTimer = null;
      refreshCumulativeScaleForVisibleWindow();
    }, 120);
  }

  function synchronizeOverviewChartScroll(source) {
    if (overviewChartScrollSyncing || currentView !== "overview") return;
    overviewChartScrollSyncing = true;
    const left = source.scrollLeft;
    viewHost.querySelectorAll("[data-chart-scroll-key]").forEach((element) => {
      if (element !== source && Math.abs(element.scrollLeft - left) > 0.5) element.scrollLeft = left;
    });
    overviewChartScrollSyncing = false;
    scheduleCumulativeScaleRefresh();
  }

  function configureOverviewChartInteractions() {
    const scrolls = Array.from(viewHost.querySelectorAll("[data-chart-scroll-key]"));
    if (!scrolls.length) return;
    const left = scrolls[0].scrollLeft;
    scrolls.forEach((scroll) => {
      if (Math.abs(scroll.scrollLeft - left) > 0.5) scroll.scrollLeft = left;
      scroll.addEventListener("scroll", () => synchronizeOverviewChartScroll(scroll), { passive: true });
    });
    if (cumulativeAutoScaleEnabled) window.requestAnimationFrame(refreshCumulativeScaleForVisibleWindow);
  }

  function renderEntry() {
    const range = periodRange(currentPeriod);
    const monthStats = aggregateMonth(currentPeriod);
    const expenseCategories = [
      ...categoriesForGroup("variable"),
      ...categoriesForGroup("fixed")
    ];
    const incomeReminderDue = incomeCategories().some((category) => needsEntryReminder(category, currentPeriod));
    const unexpectedCategory = unexpectedExpenseCategory();
    const unexpectedIncome = unexpectedIncomeCategory();
    const available = expenseCategories.reduce((sum, category) => sum + categoryBudgetStats(category.id, currentPeriod).monthlyRemaining, 0);
    const availableCarry = expenseCategories.reduce((sum, category) => sum + categoryBudgetStats(category.id, currentPeriod).carryRemaining, 0);
    const allTransactions = transactionsForMonth(currentPeriod).sort((a, b) => b.date.localeCompare(a.date) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const recent = allTransactionsShown ? allTransactions : allTransactions.slice(0, 5);

    viewHost.innerHTML = `<div class="view-stack">
      <section class="card period-card" aria-label="対象期間">
        <div>
          <p>${shortDate(range.start)}〜${shortDate(range.end)}・${state.settings.closingDay}日締め</p>
          <strong>${monthLabel(currentPeriod)}</strong>
        </div>
        <div class="period-total">
          <p>使える残予算</p>
          <strong class="${available < 0 ? "negative" : ""}">${formatCurrency(available)}</strong>
          ${availableCarry !== 0 ? `<span class="period-carry${availableCarry < 0 ? " negative" : ""}">＋これまでの持ち越し${formatCurrency(availableCarry)}</span>` : ""}
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

      <section class="income-entry-card${incomeReminderDue ? " needs-entry-reminder" : ""}">
        <div><strong>収入実績を記録</strong><p>給与・賞与などを状況グラフへ反映します。</p></div>
        <button type="button" class="button small primary" data-action="toggle-income">${incomeExpanded ? "閉じる" : "収入を入力"}</button>
      </section>
      ${incomeExpanded ? `<section class="section"><div class="category-grid">${renderIncomeCards(currentPeriod)}</div></section>` : ""}

      ${(unexpectedCategory || unexpectedIncome) ? `<section class="income-entry-card unexpected-entry-toggle-card">
        <div><strong>想定外の支出と収入</strong><p>計画外の収支を、プロジェクト終了時の見込み収支へ直接反映します。</p></div>
        <button type="button" class="button small secondary" data-action="toggle-unexpected-entries">${unexpectedEntriesExpanded ? "閉じる" : "開く"}</button>
      </section>
      ${unexpectedEntriesExpanded ? `<section class="section unexpected-expense-section"><div class="category-grid">${unexpectedCategory ? renderUnexpectedExpenseCard(unexpectedCategory, currentPeriod) : ""}${unexpectedIncome ? renderUnexpectedIncomeCard(unexpectedIncome, currentPeriod) : ""}</div></section>` : ""}` : ""}

      <section class="section" aria-labelledby="recent-title">
        <div class="section-header"><div><p class="section-kicker">HISTORY</p><h2 id="recent-title">この月の記録</h2></div>${allTransactions.length > 5 ? `<button type="button" class="text-button" data-action="toggle-history">${allTransactionsShown ? "5件に戻す" : `すべて表示（${allTransactions.length}件）`}</button>` : '<p class="section-description">タップして編集</p>'}</div>
        <div class="transaction-list">${recent.length ? recent.map(renderTransactionRow).join("") : '<div class="empty-state">この月の記録はまだありません。</div>'}</div>
      </section>

      <section class="summary-grid" aria-label="今月の集計">
        ${summaryCard("支出実績", monthStats.expenseActual, `予定 ${formatCurrency(monthStats.expensePlan)}`)}
        ${summaryCard("収入実績", monthStats.incomeActual, `予定 ${formatSignedCurrency(monthStats.incomePlan)}`, monthStats.incomeActual < 0 ? "negative" : "", true)}
      </section>
    </div>`;
  }

  function summaryCard(label, value, subvalue, tone = "", signed = false) {
    return `<article class="summary-card"><span class="label">${escapeHtml(label)}</span><strong class="${tone}">${signed ? formatSignedCurrency(value) : formatCurrency(value)}</strong><span class="subvalue">${escapeHtml(subvalue)}</span></article>`;
  }

  function renderBudgetCards(categories, month) {
    if (!categories.length) return '<div class="empty-state">設定画面から種別を追加してください。</div>';
    return categories.map((category) => {
      const stats = categoryBudgetStats(category.id, month);
      const dailyStats = dailyBudgetStats(category, month);
      const latestEntryDate = latestCategoryEntryDate(category.id, month);
      const reminderDue = needsEntryReminder(category, month);
      const fixedExpenseStatus = category.group === "fixed" && planAmount(category.id, month) > 0
        ? latestEntryDate
          ? { label: `${shortDate(latestEntryDate)}入力済み`, tone: "complete" }
          : { label: "未入力", tone: "missing" }
        : null;
      const hasUnresolvedCarryover = stats.carry < 0;
      const carryBudgetAvailable = !hasUnresolvedCarryover && stats.monthlyRemaining <= 0 && stats.carryRemaining > 0;
      const carryBudgetExhausted = !hasUnresolvedCarryover && stats.carry > 0 && stats.monthlyRemaining < 0 && stats.carryRemaining === 0;
      const remainingOverage = hasUnresolvedCarryover
        ? Math.abs(stats.carry + Math.min(0, stats.monthlyRemaining))
        : carryBudgetExhausted
          ? Math.max(0, Math.abs(stats.monthlyRemaining) - stats.carry)
          : Math.max(0, -stats.monthlyRemaining);
      const remainingBudget = carryBudgetAvailable
        ? stats.carryRemaining
        : remainingOverage > 0
          ? -remainingOverage
          : carryBudgetExhausted
            ? 0
            : stats.monthlyRemaining;
      const remainingBudgetLabel = carryBudgetAvailable ? "持ち越し予算" : "今月の残予算";
      const hasNoPlan = stats.configuredPlan <= 0 && stats.priorCarry === 0 && stats.actual === 0;
      const progress = remainingBudget < 0
        ? 100
        : stats.configuredPlan > 0
          ? clamp((stats.actual / stats.configuredPlan) * 100, 0, 100)
          : 0;
      const progressBar = !hasNoPlan && (stats.configuredPlan > 0 || remainingBudget < 0)
        ? `<span class="budget-progress" aria-label="予算消化率 ${Math.round(progress)}%"><span style="--progress:${progress}%"></span></span>`
        : "";
      const carryLabel = carryBudgetAvailable
        ? `<span class="budget-card-carry"><span>今月の予算</span><strong>${formatCurrency(0)}</strong></span>`
        : !hasUnresolvedCarryover && stats.carryRemaining !== 0
        ? `<span class="budget-card-carry"><span>＋これまでの持ち越し</span><strong class="${stats.carryRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(stats.carryRemaining)}</strong></span>`
        : "";
      const budgetSummary = hasNoPlan
        ? '<span class="budget-card-unplanned">計画なし</span>'
        : `<span class="budget-card-main"><span class="budget-card-label">${remainingBudgetLabel}</span><strong class="budget-card-amount ${remainingBudget < 0 ? "negative" : ""}">${remainingAmountLabel(remainingBudget)}</strong></span>`;
      const cardFooter = carryLabel || progressBar
        ? `<span class="budget-card-footer">${carryLabel}${progressBar}</span>`
        : "";
      if (dailyStats) {
        return `<button type="button" class="budget-card daily-budget-card${reminderDue ? " needs-entry-reminder" : ""}" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
          <span class="budget-card-name">${escapeHtml(category.name)}</span>
          <span class="daily-budget-main">
            <span class="daily-budget-value"><span>${dailyStats.dailyLabel}</span><strong class="${dailyStats.dailyRemaining < 0 ? "negative" : ""}">${remainingAmountLabel(dailyStats.dailyRemaining)}</strong></span>
          </span>
          <span class="daily-budget-days">${dailyStats.daysLabel}</span>
          <span class="daily-budget-sub">
            ${budgetSummary}
            ${carryLabel}
          </span>
          ${progressBar}
        </button>`;
      }
      return `<button type="button" class="budget-card${reminderDue ? " needs-entry-reminder" : ""}" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
        <span class="budget-card-name">${escapeHtml(category.name)}${fixedExpenseStatus ? `<em class="budget-card-status ${fixedExpenseStatus.tone}">${fixedExpenseStatus.label}</em>` : ""}</span>
        ${budgetSummary}
        ${cardFooter}
      </button>`;
    }).join("");
  }

  function renderIncomeCards(month) {
    const categories = incomeCategories();
    if (!categories.length) return '<div class="empty-state">収入種別を設定画面で追加してください。</div>';
    return categories.map((category) => {
      const planned = planAmount(category.id, month);
      const actual = actualAmount(category.id, month);
      const reminderDue = needsEntryReminder(category, month);
      return `<button type="button" class="budget-card${reminderDue ? " needs-entry-reminder" : ""}" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
        <span class="budget-card-name">${escapeHtml(category.name)}</span>
        <span class="budget-card-label">今月の収入実績</span>
        <strong class="budget-card-amount ${actual < 0 ? "negative" : "positive"}">${formatSignedCurrency(actual)}</strong>
        <span class="budget-card-carry"><span>予定</span><strong class="${planned < 0 ? "negative" : ""}">${formatSignedCurrency(planned)}</strong></span>
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
    window.addEventListener("touchmove", handleExpenseReorderTouchMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handleExpenseReorderPointerUp, true);
    window.addEventListener("pointercancel", handleExpenseReorderPointerCancel, true);
  }

  function renderUnexpectedExpenseCard(category, month) {
    const actual = actualAmount(category.id, month);
    return `<button type="button" class="budget-card unexpected-expense-card" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
      <span class="budget-card-name">${escapeHtml(category.name)}</span>
      <span class="unexpected-expense-copy">予算外の支出として、プロジェクト終了時の見込み収支から直接差し引きます。</span>
      <span class="unexpected-expense-total"><span>今月の入力額</span><strong class="${actual > 0 ? "negative" : ""}">${formatCurrency(actual)}</strong></span>
    </button>`;
  }

  function renderUnexpectedIncomeCard(category, month) {
    const actual = actualAmount(category.id, month);
    return `<button type="button" class="budget-card unexpected-income-card" data-category-id="${escapeHtml(category.id)}" style="--category-color:${escapeHtml(category.color)}">
      <span class="budget-card-name">${escapeHtml(category.name)}</span>
      <span class="unexpected-expense-copy">計画外の収入として、プロジェクト終了時の見込み収支へ直接加算します。</span>
      <span class="unexpected-expense-total"><span>今月の入力額</span><strong class="${actual < 0 ? "negative" : "positive"}">${formatSignedCurrency(actual)}</strong></span>
    </button>`;
  }

  function removeExpenseReorderTracking() {
    window.removeEventListener("pointermove", handleExpenseReorderPointerMove, true);
    window.removeEventListener("touchmove", handleExpenseReorderTouchMove, true);
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
      pointerType: event.pointerType,
      timer: null
    };
    gesture.timer = window.setTimeout(() => activateExpenseReorder(gesture), 420);
    expenseReorderGesture = gesture;
    addExpenseReorderTracking();
  }

  function cancelPendingExpenseReorder(gesture) {
    if (expenseReorderGesture !== gesture) return;
    expenseReorderGesture = null;
    removeExpenseReorderTracking();
    if (gesture.timer) window.clearTimeout(gesture.timer);
  }

  function handleExpenseReorderPointerMove(event) {
    const gesture = expenseReorderGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastClientX = event.clientX;
    gesture.lastClientY = event.clientY;
    if (!gesture.active) {
      const horizontalDistance = Math.abs(event.clientX - gesture.startClientX);
      const verticalDistance = Math.abs(event.clientY - gesture.startClientY);
      if (verticalDistance > 6 || Math.hypot(horizontalDistance, verticalDistance) > 14) cancelPendingExpenseReorder(gesture);
      return;
    }
    if (event.cancelable) event.preventDefault();
    updateExpenseDragPreview(gesture, event.clientX, event.clientY);
    moveExpenseCardForPointer(gesture, event.clientX, event.clientY);
  }

  function handleExpenseReorderTouchMove(event) {
    const gesture = expenseReorderGesture;
    if (!gesture || !gesture.active || gesture.pointerType !== "touch" || event.touches.length !== 1) return;
    if (event.cancelable) event.preventDefault();
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

  function startAnalysisPageSwipe(event) {
    const viewport = event.target.closest(".analysis-pages-viewport");
    if (!viewport || currentView !== "analysis" || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    analysisPageSwipe = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
  }

  function selectAnalysisPage(page, animate = false) {
    const nextPage = clamp(toInteger(page), 0, ANALYSIS_PAGE_COUNT - 1);
    if (nextPage === analysisDetailPage) return;
    if (analysisPageTransitionTimer) window.clearTimeout(analysisPageTransitionTimer);
    analysisPageTransitionTimer = null;
    analysisDetailPage = nextPage;
    const track = viewHost.querySelector(".analysis-pages-track");
    if (!animate || !track) {
      render();
      return;
    }
    track.style.setProperty("--analysis-page-offset", `${nextPage * -(100 / ANALYSIS_PAGE_COUNT)}%`);
    analysisPageTransitionTimer = window.setTimeout(() => {
      analysisPageTransitionTimer = null;
      render();
    }, 230);
  }

  function finishAnalysisPageSwipe(event) {
    const swipe = analysisPageSwipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    analysisPageSwipe = null;
    const horizontalDistance = event.clientX - swipe.startX;
    const verticalDistance = event.clientY - swipe.startY;
    if (Math.abs(horizontalDistance) < 48 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.2) return;
    const nextPage = clamp(analysisDetailPage + (horizontalDistance < 0 ? 1 : -1), 0, ANALYSIS_PAGE_COUNT - 1);
    selectAnalysisPage(nextPage, true);
  }

  function cancelAnalysisPageSwipe(event) {
    if (analysisPageSwipe && analysisPageSwipe.pointerId === event.pointerId) analysisPageSwipe = null;
  }

  function renderTransactionRow(transaction) {
    const category = categoryById(transaction.categoryId);
    const categoryName = category ? category.name : "削除済み種別";
    const color = category ? category.color : "#777777";
    const signedAmount = transaction.direction === "income" ? transaction.amount : -transaction.amount;
    return `<button type="button" class="transaction-row" data-transaction-id="${escapeHtml(transaction.id)}" style="--category-color:${escapeHtml(color)}">
      <span class="transaction-dot" aria-hidden="true"></span>
      <span class="transaction-main"><strong>${escapeHtml(categoryName)}</strong><span>${dateTimeLabel(transaction.date)}${transaction.memo ? `・${escapeHtml(transaction.memo)}` : ""}</span></span>
      <strong class="transaction-amount ${signedAmount < 0 ? "negative" : "positive"}">${formatSignedCurrency(signedAmount)}</strong>
    </button>`;
  }

  function renderOverview() {
    const aggregates = periodMonths().map(aggregateMonth);
    let plannedCumulative = 0;
    let actualCumulative = 0;
    aggregates.forEach((item) => {
      plannedCumulative += item.plannedNet;
      actualCumulative += item.actualNet;
      item.plannedCumulative = plannedCumulative;
      item.actualCumulative = actualCumulative;
    });

    const projectEnd = aggregates[aggregates.length - 1] || { plannedCumulative: 0, actualCumulative: 0 };
    const projectEndForecast = projectEndForecastFromAggregates(aggregates);
    const projectEndTone = projectEndForecast < 0 ? "negative" : projectEndForecast > 0 ? "positive" : "";
    const preferredCumulativeIndex = aggregates.findIndex((item) => item.month === currentPeriod);
    const cumulativeIndexMaximum = Math.max(0, aggregates.length - 1);
    const activeCumulativeIndex = clamp(Math.max(0, aggregates.findIndex((item) => item.month === currentPeriodForToday())), 0, cumulativeIndexMaximum);
    let actualForecastCumulative = aggregates[activeCumulativeIndex]?.actualCumulative || 0;
    aggregates.forEach((item, index) => {
      if (index <= activeCumulativeIndex) {
        item.actualForecastCumulative = item.actualCumulative;
      } else {
        actualForecastCumulative += item.plannedNet;
        item.actualForecastCumulative = actualForecastCumulative;
      }
    });
    const selectedCumulativeIndex = clamp(
      Number.isInteger(cumulativeChartSelectedIndex) ? cumulativeChartSelectedIndex : Math.max(0, preferredCumulativeIndex),
      0,
      cumulativeIndexMaximum
    );
    cumulativeChartSelectedIndex = selectedCumulativeIndex;

    viewHost.innerHTML = `<div class="view-stack">
      <section class="card overview-hero" aria-label="${projectDateLabel(state.settings.endDate)}時点の見込み収支">
        <div><p class="section-kicker">PROJECT END FORECAST</p><h2>${projectDateLabel(state.settings.endDate)}時点の見込み収支</h2><p>これまでの実績と、残りの計画から算出した見込み収支。</p></div>
        <div class="overview-hero-total"><strong class="${projectEndTone}">${formatSignedCurrency(projectEndForecast)}</strong><span>計画時 ${formatSignedCurrency(projectEnd.plannedCumulative)}</span></div>
      </section>

      ${renderInteractiveOverviewBarChart({
        id: "expense",
        title: "支出予定と支出実績",
        description: "各月をタップすると、予定と実績をグラフ上に表示します。",
        aggregates,
        selectedIndex: selectedCumulativeIndex,
        series: [
          { field: "expensePlan", label: "支出予定", tone: "expense-plan", color: "#e8b59b" },
          { field: "expenseActual", label: "支出実績", tone: "expense-actual", color: "#d66735" }
        ]
      })}
      ${renderInteractiveOverviewBarChart({
        id: "income",
        title: "収入予定と収入実績",
        description: "各月をタップすると、予定と実績をグラフ上に表示します。",
        aggregates,
        selectedIndex: selectedCumulativeIndex,
        series: [
          { field: "incomePlan", label: "収入予定", tone: "income-plan", color: "#a8ceba" },
          { field: "incomeActual", label: "収入実績", tone: "income-actual", color: "#2f8057" }
        ]
      })}
      ${renderInteractiveOverviewBarChart({
        id: "monthly-net",
        title: "月次予定収支と月次実績収支",
        description: "プラス・マイナスをゼロ基準で表示します。各月をタップすると詳細を確認できます。",
        aggregates,
        selectedIndex: selectedCumulativeIndex,
        series: [
          { field: "plannedNet", label: "月次予定収支", tone: "monthly-net-planned", color: "#7f9dc2" },
          { field: "actualNet", label: "月次実績収支", tone: "monthly-net-actual", color: "#3c69a1" }
        ]
      })}

      ${renderCumulativeNetChart(aggregates, selectedCumulativeIndex, activeCumulativeIndex)}

      <section class="card" aria-labelledby="monthly-table-title">
        <div class="section-copy"><h2 id="monthly-table-title">月別の数値</h2><p>グラフと同じ内容を表形式で確認できます。</p></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>月</th><th>収入予定</th><th>収入実績</th><th>支出予定</th><th>支出実績</th><th>予定収支</th><th>実績収支</th><th>累積予定</th><th>累積実績</th></tr></thead><tbody>
          ${aggregates.map((item) => `<tr><td>${monthLabel(item.month)}</td><td>${formatSignedCurrency(item.incomePlan)}</td><td>${formatSignedCurrency(item.incomeActual)}</td><td>${formatCurrency(item.expensePlan)}</td><td>${formatCurrency(item.expenseActual)}</td><td>${formatSignedCurrency(item.plannedNet)}</td><td>${formatSignedCurrency(item.actualNet)}</td><td>${formatSignedCurrency(item.plannedCumulative)}</td><td>${formatSignedCurrency(item.actualCumulative)}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
    </div>`;
  }

  function legend(color, label) {
    return `<span class="legend-item"><span class="legend-swatch" style="--legend-color:${color}"></span>${label}</span>`;
  }

  function niceChartStep(range, targetIntervals = 3) {
    const rawStep = Math.max(1, Math.abs(range) / Math.max(1, targetIntervals));
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const factor = [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) || 10;
    return factor * magnitude;
  }

  function chartValueScale(values) {
    let minimum = Math.min(0, ...values);
    let maximum = Math.max(0, ...values);
    if (minimum === maximum) maximum = minimum + 1;
    const padding = Math.max(1, (maximum - minimum) * 0.08);
    if (minimum < 0) minimum -= padding;
    if (maximum > 0) maximum += padding;
    if (minimum < 0) {
      const negativeStep = niceChartStep(Math.abs(minimum));
      minimum = -Math.ceil(Math.abs(minimum) / negativeStep) * negativeStep;
    }
    if (maximum > 0) {
      const positiveStep = niceChartStep(maximum);
      maximum = Math.ceil(maximum / positiveStep) * positiveStep;
    }
    return { minimum, maximum, range: maximum - minimum };
  }

  function chartYPercent(value, scale) {
    return clamp(((scale.maximum - value) / scale.range) * 100, 0, 100);
  }

  function formatChartAxisValue(value) {
    const rounded = Math.round(value);
    if (rounded === 0) return "0";
    return `${rounded < 0 ? "−" : ""}${compactFormatter.format(Math.abs(rounded))}`;
  }

  function chartAxisValues(scale) {
    const values = [];
    const add = (value) => {
      if (!values.some((other) => Math.abs(other - value) < 0.001)) values.push(value);
    };
    if (scale.maximum > 0) {
      const step = niceChartStep(scale.maximum);
      for (let value = 0; value < scale.maximum - 0.001; value += step) add(value);
      add(scale.maximum);
    } else {
      add(0);
    }
    if (scale.minimum < 0) {
      const step = niceChartStep(Math.abs(scale.minimum));
      for (let value = -step; value > scale.minimum + 0.001; value -= step) add(value);
      add(scale.minimum);
    }
    return values.sort((left, right) => right - left);
  }

  function renderChartGridlines(scale) {
    return chartAxisValues(scale).map((value) => `<div class="chart-gridline" style="top:${chartYPercent(value, scale)}%"></div>`).join("");
  }

  function renderChartAxisLabels(scale) {
    return `<div class="chart-axis-labels" aria-hidden="true"><div class="chart-axis-label-plot">${chartAxisValues(scale).map((value) => `<span style="top:${chartYPercent(value, scale)}%">${formatChartAxisValue(value)}</span>`).join("")}</div></div>`;
  }

  function chartBarGeometry(value, scale) {
    const zero = chartYPercent(0, scale);
    const position = chartYPercent(value, scale);
    return {
      top: Math.min(zero, position),
      height: value === 0 ? 0 : Math.max(0.85, Math.abs(zero - position))
    };
  }

  function renderInteractiveOverviewBarChart({ id, title, description, aggregates, selectedIndex, series }) {
    const scale = chartValueScale(aggregates.flatMap((item) => series.map((itemSeries) => item[itemSeries.field])));
    const selected = aggregates[selectedIndex] || aggregates[0] || { month: currentPeriod };
    const selectionLeft = selectedIndex * 3.1 + 1.55;
    return `<section class="card chart-card interactive-bar-chart-card" aria-labelledby="${id}-chart-title">
      <div class="section-copy"><p class="section-kicker">${aggregates.length} MONTHS</p><h2 id="${id}-chart-title">${title}</h2><p>${description}</p></div>
      <div class="chart-legend">${series.map((item) => legend(item.color, item.label)).join("")}</div>
      <div class="chart-scroll" data-chart-scroll-key="${id}">
        ${renderChartAxisLabels(scale)}
        <div class="chart-canvas interactive-chart-canvas" style="--month-count:${aggregates.length};--selection-left:${selectionLeft}rem">
          <div class="chart-plot">
            ${renderChartGridlines(scale)}
            <div class="interactive-bar-series">${aggregates.map((item, index) => renderInteractiveMonthBars(item, index, series, scale, selectedIndex)).join("")}</div>
            <span class="interactive-chart-selection-guide" aria-hidden="true"></span>
            <aside class="interactive-chart-tooltip" aria-live="polite">
              <strong>${monthLabel(selected.month)}</strong>
              ${series.map((item) => `<span class="${item.tone}"><i aria-hidden="true"></i>${item.label} ${formatSignedCurrency(selected[item.field] || 0)}</span>`).join("")}
            </aside>
            <div class="interactive-chart-tap-targets">${aggregates.map((item, index) => `<button type="button" class="interactive-chart-tap-target${index === selectedIndex ? " is-selected" : ""}" data-overview-chart-index="${index}" aria-label="${monthLabel(item.month)}を表示。${series.map((itemSeries) => `${itemSeries.label} ${formatSignedCurrency(item[itemSeries.field])}`).join("、")}"></button>`).join("")}</div>
          </div>
          <div class="cumulative-chart-months" aria-hidden="true">${aggregates.map((item) => `<span>${monthParts(item.month).month}月度</span>`).join("")}</div>
        </div>
      </div>
    </section>`;
  }

  function renderInteractiveMonthBars(item, index, series, scale, selectedIndex) {
    return `<div class="interactive-month-bars${index === selectedIndex ? " is-selected" : ""}">${series.map((itemSeries) => {
      const value = item[itemSeries.field];
      const geometry = chartBarGeometry(value, scale);
      const isCurrentActual = item.month === currentPeriodForToday() && itemSeries.tone.endsWith("-actual");
      return `<span class="interactive-chart-bar ${itemSeries.tone}${value < 0 ? " is-negative" : ""}${isCurrentActual ? " is-current-actual" : ""}" style="--bar-top:${geometry.top}%;--bar-height:${geometry.height}%"></span>`;
    }).join("")}</div>`;
  }

  function renderCumulativeNetChart(aggregates, selectedIndex, activeIndex) {
    const scaleStart = cumulativeAutoScaleEnabled && cumulativeScaleWindow ? clamp(cumulativeScaleWindow.start, 0, Math.max(0, aggregates.length - 1)) : 0;
    const scaleEnd = cumulativeAutoScaleEnabled && cumulativeScaleWindow ? clamp(cumulativeScaleWindow.end, scaleStart, Math.max(0, aggregates.length - 1)) : Math.max(0, aggregates.length - 1);
    const scaleValues = aggregates.slice(scaleStart, scaleEnd + 1).flatMap((item) => [item.plannedCumulative, item.actualCumulative, item.actualForecastCumulative]);
    const scale = chartValueScale(scaleValues.length ? scaleValues : [0]);
    const width = aggregates.length * 100;
    const points = (field, start = 0, end = aggregates.length - 1) => aggregates.slice(start, end + 1).map((item, offset) => {
      const index = start + offset;
      return `${index * 100 + 50},${chartYPercent(item[field], scale)}`;
    }).join(" ");
    const pointMarkers = (field, tone, start = 0, end = aggregates.length - 1) => aggregates.slice(start, end + 1).map((item, offset) => {
      const index = start + offset;
      const y = chartYPercent(item[field], scale);
      const left = ((index + 0.5) / Math.max(1, aggregates.length)) * 100;
      const isCurrentActual = tone === "actual" && index === activeIndex;
      return `<span class="cumulative-chart-point ${tone}${index === selectedIndex ? " is-selected" : ""}${isCurrentActual ? " is-current-actual" : ""}" style="left:${left}%;top:${y}%"></span>`;
    }).join("");
    const selected = aggregates[selectedIndex] || aggregates[0] || { month: currentPeriod, plannedCumulative: 0, actualCumulative: 0, actualForecastCumulative: 0, plannedNet: 0, actualNet: 0 };
    const selectedUsesForecast = selectedIndex > activeIndex;
    const selectedActualValue = selectedUsesForecast ? selected.actualForecastCumulative : selected.actualCumulative;
    const selectionLeft = selectedIndex * 3.1 + 1.55;
    return `<section class="card chart-card cumulative-chart-card" aria-labelledby="cumulative-chart-title">
      <div class="cumulative-chart-heading"><div class="section-copy"><p class="section-kicker">CUMULATIVE NET</p><h2 id="cumulative-chart-title">累積予定収支と累積実績収支</h2><p>予定は青の破線、実績は橙の実線です。実績の次月以降は、月次予定収支を積み上げた点線で表示します。</p></div><button type="button" class="button small secondary cumulative-scale-toggle${cumulativeAutoScaleEnabled ? " is-active" : ""}" data-action="toggle-cumulative-auto-scale" aria-pressed="${cumulativeAutoScaleEnabled}">自動スケール ${cumulativeAutoScaleEnabled ? "ON" : "OFF"}</button></div>
      <div class="chart-legend">${legend("#3c78b4", "累積予定収支（破線）")}${legend("#c45e43", "累積実績収支（実線）")}${legend("#c45e43", "実績予測（点線）")}</div>
      <div class="chart-scroll" data-chart-scroll-key="cumulative-net">
        ${renderChartAxisLabels(scale)}
        <div class="chart-canvas cumulative-chart-canvas" style="--month-count:${aggregates.length};--selection-left:${selectionLeft}rem">
          <div class="chart-plot">
            ${renderChartGridlines(scale)}
            <svg class="line-overlay" viewBox="0 0 ${width} 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline class="chart-line cumulative-net planned" points="${points("plannedCumulative")}"></polyline>
              <polyline class="chart-line cumulative-net actual" points="${points("actualCumulative", 0, activeIndex)}"></polyline>
              <polyline class="chart-line cumulative-net forecast" points="${points("actualForecastCumulative", activeIndex, aggregates.length - 1)}"></polyline>
            </svg>
            <div class="cumulative-chart-points" aria-hidden="true">${pointMarkers("plannedCumulative", "planned")}${pointMarkers("actualCumulative", "actual", 0, activeIndex)}${pointMarkers("actualForecastCumulative", "forecast", activeIndex + 1, aggregates.length - 1)}</div>
            <span class="cumulative-chart-selection-guide" aria-hidden="true"></span>
            <aside class="cumulative-chart-tooltip" aria-live="polite">
              <strong>${monthLabel(selected.month)}</strong>
              <span class="planned"><i aria-hidden="true"></i>予定累積 ${formatSignedCurrency(selected.plannedCumulative)}</span>
              <span class="actual"><i aria-hidden="true"></i>${selectedUsesForecast ? "実績予測" : "実績累積"} ${formatSignedCurrency(selectedActualValue)}</span>
              <small>月次：予定 ${formatSignedCurrency(selected.plannedNet)} ／ 実績 ${formatSignedCurrency(selected.actualNet)}</small>
              <small class="cumulative-scale-window">${cumulativeAutoScaleEnabled ? `表示範囲：${monthLabel(aggregates[scaleStart]?.month || currentPeriod)}〜${monthLabel(aggregates[scaleEnd]?.month || currentPeriod)}` : "全期間スケール"}</small>
            </aside>
            <div class="cumulative-chart-tap-targets">${aggregates.map((item, index) => `<button type="button" class="cumulative-chart-tap-target${index === selectedIndex ? " is-selected" : ""}" data-overview-chart-index="${index}" aria-label="${monthLabel(item.month)}を表示。累積予定収支 ${formatSignedCurrency(item.plannedCumulative)}、${index > activeIndex ? "実績予測" : "累積実績収支"} ${formatSignedCurrency(index > activeIndex ? item.actualForecastCumulative : item.actualCumulative)}"></button>`).join("")}</div>
          </div>
          <div class="cumulative-chart-months" aria-hidden="true">${aggregates.map((item) => `<span>${monthParts(item.month).month}月度</span>`).join("")}</div>
        </div>
      </div>
    </section>`;
  }

  function analysisTransactionsForMode(month, incomeMode) {
    return transactionsForMonth(month, incomeMode ? "income" : "expense")
      .sort((left, right) => right.date.localeCompare(left.date) || String(right.enteredOn || "").localeCompare(String(left.enteredOn || "")));
  }

  function analysisDayTotals(date, incomeMode) {
    const transactions = state.transactions.filter((transaction) => transaction.date === date && transaction.direction === (incomeMode ? "income" : "expense"));
    if (incomeMode) {
      return transactions.reduce((totals, transaction) => {
        const amount = toInteger(transaction.amount);
        totals.income += amount;
        if (isUnexpectedIncomeCategory(categoryById(transaction.categoryId))) totals.unexpectedIncome += amount;
        return totals;
      }, { income: 0, unexpectedIncome: 0 });
    }
    return transactions.reduce((totals, transaction) => {
      const category = categoryById(transaction.categoryId);
      const amount = toInteger(transaction.amount);
      if (isUnexpectedExpenseCategory(category)) totals.unexpected += amount;
      else if (category && category.group === "fixed") totals.fixed += amount;
      else totals.variable += amount;
      totals.total += amount;
      return totals;
    }, { variable: 0, fixed: 0, unexpected: 0, total: 0 });
  }

  function calendarAmountLabel(value, signed = false) {
    const amount = toInteger(value);
    const prefix = signed && amount < 0 ? "−" : "";
    return `${prefix}￥${compactFormatter.format(Math.abs(amount))}`;
  }

  function calendarDatesForRange(range) {
    const dates = [];
    const cursor = parseLocalDate(range.start);
    const end = parseLocalDate(range.end);
    while (cursor <= end) {
      dates.push(localDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  function renderAnalysisCalendar(range, incomeMode, selectedDate) {
    const dates = calendarDatesForRange(range);
    const firstDay = parseLocalDate(range.start).getDay();
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const dayCells = dates.map((date, index) => {
      const totals = analysisDayTotals(date, incomeMode);
      const dateParts = parseLocalDate(date);
      const showMonth = index === 0 || dateParts.getDate() === 1;
      const dateLabel = showMonth ? shortDate(date) : String(dateParts.getDate());
      const hasEntries = state.transactions.some((transaction) => transaction.date === date && transaction.direction === (incomeMode ? "income" : "expense"));
      const amountLabels = !hasEntries ? "" : incomeMode
        ? `<span class="analysis-calendar-income">収入:<strong>${calendarAmountLabel(totals.income, true)}</strong></span>${totals.unexpectedIncome !== 0 ? `<span class="analysis-calendar-breakdown unexpected-income">想定外収入 ${calendarAmountLabel(totals.unexpectedIncome, true)}</span>` : ""}`
        : `<span class="analysis-calendar-total">計:<strong>${calendarAmountLabel(totals.total)}</strong></span><span class="analysis-calendar-breakdown">変動支出 ${calendarAmountLabel(totals.variable)}</span><span class="analysis-calendar-breakdown">固定支出 ${calendarAmountLabel(totals.fixed)}</span>${totals.unexpected !== 0 ? `<span class="analysis-calendar-breakdown unexpected-expense">想定外支出 ${calendarAmountLabel(totals.unexpected)}</span>` : ""}`;
      const ariaLabel = incomeMode
        ? `${projectDateLabel(date)}、収入 ${formatSignedCurrency(totals.income)}${totals.unexpectedIncome !== 0 ? `、想定外収入 ${formatSignedCurrency(totals.unexpectedIncome)}` : ""}`
        : `${projectDateLabel(date)}、変動支出 ${formatCurrency(totals.variable)}、固定支出 ${formatCurrency(totals.fixed)}${totals.unexpected !== 0 ? `、想定外支出 ${formatCurrency(totals.unexpected)}` : ""}、合計 ${formatCurrency(totals.total)}`;
      return `<button type="button" class="analysis-calendar-day${date === selectedDate ? " selected" : ""}" data-analysis-date="${date}" aria-pressed="${date === selectedDate}" aria-label="${ariaLabel}"><span class="analysis-calendar-date">${dateLabel}</span>${amountLabels}</button>`;
    }).join("");
    return `<section class="card analysis-calendar-card" aria-labelledby="analysis-calendar-title">
      <div class="section-copy"><p class="section-kicker">DAILY CALENDAR</p><h2 id="analysis-calendar-title">${dateTimeLabel(range.start)}〜${dateTimeLabel(range.end)}</h2><p>${incomeMode ? "各日の収入実績です。" : "各日の変動支出・固定支出・合計です。"}</p></div>
      <div class="analysis-calendar-weekdays" aria-hidden="true">${weekdays.map((weekday, index) => `<span class="${index === 0 ? "sunday" : index === 6 ? "saturday" : ""}">${weekday}</span>`).join("")}</div>
      <div class="analysis-calendar-grid">${"<span class=\"analysis-calendar-blank\"></span>".repeat(firstDay)}${dayCells}</div>
    </section>`;
  }

  function renderAnalysisDailyPage(range, incomeMode, selectedDate) {
    const transactions = analysisTransactionsForMode(analysisPeriod, incomeMode).filter((transaction) => !selectedDate || transaction.date === selectedDate);
    const filterLabel = selectedDate ? dateTimeLabel(selectedDate) : "すべての日付";
    return `<section class="analysis-page analysis-daily-page">
      ${renderAnalysisCalendar(range, incomeMode, selectedDate)}
      <section class="section analysis-daily-transactions" aria-labelledby="analysis-daily-transactions-title">
        <div class="section-header"><div><p class="section-kicker">DAILY RECORDS</p><h2 id="analysis-daily-transactions-title">${filterLabel}の入力</h2></div>${selectedDate ? '<button type="button" class="text-button" data-action="clear-analysis-date">すべて表示</button>' : '<p class="section-description">タップして確認・編集</p>'}</div>
        <p class="help-text">入力項目をタップすると、内容の確認・編集・削除ができます。</p>
        <div class="transaction-list">${transactions.length ? transactions.map(renderTransactionRow).join("") : `<div class="empty-state">${selectedDate ? "この日の入力はありません。" : "この月の入力はまだありません。"}</div>`}</div>
      </section>
    </section>`;
  }

  function piePoint(centerX, centerY, radius, angle) {
    const radians = (angle - 90) * Math.PI / 180;
    return { x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
  }

  function pieSlicePath(centerX, centerY, radius, startAngle, endAngle) {
    const start = piePoint(centerX, centerY, radius, startAngle);
    const end = piePoint(centerX, centerY, radius, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${centerX} ${centerY} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
  }

  function ratioSegmentsFromRows(rows, signed = false) {
    return rows
      .filter((row) => row.actual !== 0)
      .map((row) => ({
        label: row.category.name,
        value: Math.abs(row.actual),
        displayValue: row.actual,
        color: row.category.color,
        signed
      }));
  }

  function renderRatioPieCard(kicker, title, description, segments) {
    const visibleSegments = segments.filter((segment) => segment.value > 0);
    if (!visibleSegments.length) {
      return `<section class="card ratio-chart-card"><div class="section-copy"><p class="section-kicker">${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><div class="empty-state">この月の入力実績はまだありません。</div></section>`;
    }
    const total = visibleSegments.reduce((sum, segment) => sum + segment.value, 0);
    const centerX = 180;
    const centerY = 136;
    const radius = 68;
    let cursor = 0;
    const slices = visibleSegments.map((segment) => {
      const span = segment.value / total * 360;
      const startAngle = cursor;
      const endAngle = cursor + span;
      const middleAngle = startAngle + span / 2;
      cursor = endAngle;
      const middlePoint = piePoint(centerX, centerY, radius + 8, middleAngle);
      const outerPoint = piePoint(centerX, centerY, radius + 24, middleAngle);
      return { ...segment, span, startAngle, endAngle, middleAngle, middlePoint, outerPoint, side: Math.cos((middleAngle - 90) * Math.PI / 180) >= 0 ? "right" : "left" };
    });
    ["left", "right"].forEach((side) => {
      const sideSlices = slices.filter((slice) => slice.side === side).sort((left, right) => left.outerPoint.y - right.outerPoint.y);
      const firstY = sideSlices.length <= 1 ? centerY : 27;
      const step = sideSlices.length <= 1 ? 0 : (218 / Math.max(1, sideSlices.length - 1));
      sideSlices.forEach((slice, index) => { slice.labelY = firstY + step * index; });
    });
    const sliceMarkup = slices.map((slice) => {
      if (slice.span >= 359.99) return `<circle class="ratio-pie-slice" cx="${centerX}" cy="${centerY}" r="${radius}" fill="${escapeHtml(slice.color)}"></circle>`;
      return `<path class="ratio-pie-slice" d="${pieSlicePath(centerX, centerY, radius, slice.startAngle, slice.endAngle)}" fill="${escapeHtml(slice.color)}"></path>`;
    }).join("");
    const labelMarkup = slices.map((slice) => {
      const textX = slice.side === "right" ? 346 : 14;
      const lineEndX = slice.side === "right" ? textX - 4 : textX + 4;
      const anchor = slice.side === "right" ? "end" : "start";
      const percentage = Math.round(slice.value / total * 100);
      const valueLabel = slice.signed ? formatSignedCurrency(slice.displayValue) : formatCurrency(slice.displayValue);
      return `<polyline class="ratio-pie-connector" points="${slice.middlePoint.x.toFixed(1)},${slice.middlePoint.y.toFixed(1)} ${slice.outerPoint.x.toFixed(1)},${slice.outerPoint.y.toFixed(1)} ${lineEndX},${slice.labelY.toFixed(1)}" stroke="${escapeHtml(slice.color)}"></polyline><text class="ratio-pie-label" x="${textX}" y="${slice.labelY.toFixed(1)}" text-anchor="${anchor}"><tspan x="${textX}" dy="0">${escapeHtml(slice.label)}</tspan><tspan class="ratio-pie-value" x="${textX}" dy="13">${escapeHtml(valueLabel)} ・ ${percentage}%</tspan></text>`;
    }).join("");
    const totalLabel = visibleSegments.some((segment) => segment.signed)
      ? formatSignedCurrency(visibleSegments.reduce((sum, segment) => sum + segment.displayValue, 0))
      : formatCurrency(total);
    return `<section class="card ratio-chart-card"><div class="section-copy"><p class="section-kicker">${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><svg class="ratio-pie-svg" viewBox="0 0 360 270" role="img" aria-label="${escapeHtml(title)}。${visibleSegments.map((segment) => `${segment.label} ${segment.signed ? formatSignedCurrency(segment.displayValue) : formatCurrency(segment.displayValue)}`).join("、")}">${sliceMarkup}<circle class="ratio-pie-center" cx="${centerX}" cy="${centerY}" r="39"></circle><text class="ratio-pie-total-label" x="${centerX}" y="${centerY - 4}" text-anchor="middle">合計</text><text class="ratio-pie-total-value" x="${centerX}" y="${centerY + 15}" text-anchor="middle">${escapeHtml(totalLabel)}</text>${labelMarkup}</svg></section>`;
  }

  function renderAnalysisRatioPage(rows, incomeMode) {
    if (incomeMode) {
      return `<section class="analysis-page analysis-ratio-page">${renderRatioPieCard("INCOME MIX", "収入の割合", "対象月の収入実績を項目別に表示しています。計画外の想定外収入も含みます。", ratioSegmentsFromRows(rows, true))}</section>`;
    }
    const unexpectedRows = rows.filter((row) => isUnexpectedExpenseCategory(row.category));
    const variableRows = rows.filter((row) => row.category.group === "variable" && !isUnexpectedExpenseCategory(row.category));
    const fixedRows = rows.filter((row) => row.category.group === "fixed");
    const actualTotal = (sourceRows) => sourceRows.reduce((sum, row) => sum + row.actual, 0);
    const groupSegments = [
      { label: "変動支出", value: actualTotal(variableRows), displayValue: actualTotal(variableRows), color: "#df8b3a" },
      { label: "固定支出", value: actualTotal(fixedRows), displayValue: actualTotal(fixedRows), color: "#557894" },
      { label: "想定外支出", value: actualTotal(unexpectedRows), displayValue: actualTotal(unexpectedRows), color: "#b84a4a" }
    ].filter((segment) => segment.value > 0);
    return `<section class="analysis-page analysis-ratio-page">
      ${renderRatioPieCard("EXPENSE MIX", "変動・固定支出の割合", "対象月の支出実績を変動支出・固定支出に分けて表示しています。想定外支出がある場合は別枠で表示します。", groupSegments)}
      ${renderRatioPieCard("VARIABLE MIX", "変動支出の項目別割合", "対象月の変動支出実績です。0円の項目は表示しません。", ratioSegmentsFromRows(variableRows))}
      ${renderRatioPieCard("FIXED MIX", "固定支出の項目別割合", "対象月の固定支出実績です。0円の項目は表示しません。", ratioSegmentsFromRows(fixedRows))}
    </section>`;
  }

  function renderAnalysis() {
    if (!analysisPeriod) analysisPeriod = currentPeriod;
    const incomeMode = analysisMode === "income";
    const categories = incomeMode ? incomeCategoriesForReporting(analysisPeriod) : expenseCategoriesForReporting(analysisPeriod);
    const rows = categories.map((category) => {
      const plan = incomeMode ? activeIncomePlanAmount(category, analysisPeriod) : activeExpensePlanAmount(category, analysisPeriod);
      const actual = actualAmount(category.id, analysisPeriod);
      return { category, plan, actual, variance: plan - actual, ratio: planProgressRatio(plan, actual) };
    });
    const totalPlan = rows.reduce((sum, row) => sum + row.plan, 0);
    const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
    const progressDonut = makePlanProgressDonut(totalPlan, totalActual, incomeMode);
    const range = periodRange(analysisPeriod);
    if (analysisSelectedDate && (analysisSelectedDate < range.start || analysisSelectedDate > range.end)) analysisSelectedDate = "";
    analysisDetailPage = clamp(toInteger(analysisDetailPage), 0, ANALYSIS_PAGE_COUNT - 1);
    const today = parseLocalDate(localDateKey());
    const start = parseLocalDate(range.start);
    const end = parseLocalDate(range.end);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const elapsedDays = today < start ? 0 : today > end ? totalDays : Math.round((today - start) / 86400000) + 1;
    const insights = incomeMode ? createIncomeInsights(rows, totalPlan, totalActual, analysisPeriod) : createInsights(rows, totalPlan, totalActual, analysisPeriod);
    let heroStatus = "計画どおり";
    let heroTone = "positive";
    if (incomeMode && totalActual < totalPlan) { heroStatus = `${formatCurrency(totalPlan - totalActual)} 未達`; heroTone = "negative"; }
    else if (incomeMode && totalActual > totalPlan) heroStatus = `${formatCurrency(totalActual - totalPlan)} 上振れ`;
    else if (!incomeMode && totalActual > totalPlan) { heroStatus = `${formatCurrency(totalActual - totalPlan)} 超過`; heroTone = "negative"; }
    else if (!incomeMode && totalActual < totalPlan) heroStatus = `${formatCurrency(totalPlan - totalActual)} 残り`;
    const variableRows = rows.filter((row) => row.category.group === "variable" && !isUnexpectedExpenseCategory(row.category));
    const fixedRows = rows.filter((row) => row.category.group === "fixed");
    const unexpectedExpenseRows = rows.filter((row) => isUnexpectedExpenseCategory(row.category) && row.actual !== 0);
    const analysisRows = incomeMode
      ? `<div class="analysis-list">${rows.map((row) => renderAnalysisRow(row, true)).join("") || '<div class="empty-state">収入種別がありません。</div>'}</div>`
      : [
        ["VARIABLE", "変動支出", variableRows],
        ["FIXED", "固定支出", fixedRows],
        ["UNPLANNED", "想定外支出", unexpectedExpenseRows]
      ].filter(([, , groupRows]) => groupRows.length).map(([kicker, title, groupRows]) => `<section class="analysis-category-group"><p class="section-kicker">${kicker}</p><h3>${title}</h3><div class="analysis-list">${groupRows.map((row) => renderAnalysisRow(row, false)).join("")}</div></section>`).join("") || '<div class="empty-state">支出種別がありません。</div>';

    viewHost.innerHTML = `<div class="view-stack">
      <div class="segmented" style="--segments:2" aria-label="分析対象">
        <button type="button" class="segment-button ${incomeMode ? "" : "active"}" data-analysis-mode="expense">支出</button>
        <button type="button" class="segment-button ${incomeMode ? "active" : ""}" data-analysis-mode="income">収入</button>
      </div>
      <div class="month-switcher"><label class="field-label" for="analysis-period">分析する月</label><select id="analysis-period">${monthOptions(analysisPeriod)}</select></div>
      <div class="analysis-page-tabs" aria-label="月次状況のページ切り替え">
        <button type="button" class="analysis-page-tab${analysisDetailPage === 0 ? " active" : ""}" data-analysis-page="0" aria-current="${analysisDetailPage === 0 ? "page" : "false"}">計画差</button>
        <button type="button" class="analysis-page-tab${analysisDetailPage === 1 ? " active" : ""}" data-analysis-page="1" aria-current="${analysisDetailPage === 1 ? "page" : "false"}">日別記録</button>
        <button type="button" class="analysis-page-tab${analysisDetailPage === 2 ? " active" : ""}" data-analysis-page="2" aria-current="${analysisDetailPage === 2 ? "page" : "false"}">割合</button>
      </div>
      <div class="analysis-pages-viewport" data-analysis-pages tabindex="0" aria-label="${incomeMode ? "収入" : "支出"}の月次状況。左右にスライドして計画差・日別記録・割合を切り替えます。">
        <div class="analysis-pages-track" style="--analysis-page-offset:${analysisDetailPage * -(100 / ANALYSIS_PAGE_COUNT)}%">
          <section class="analysis-page analysis-summary-page">
            <section class="card analysis-hero">
              <div><p class="section-kicker">${incomeMode ? "INCOME PROGRESS" : "SPENDING PROGRESS"}</p><h2>${monthLabel(analysisPeriod)}の${incomeMode ? "収入" : "支出"}進捗</h2><p>計画 ${incomeMode ? formatSignedCurrency(totalPlan) : formatCurrency(totalPlan)} を100%として、実績 ${incomeMode ? formatSignedCurrency(totalActual) : formatCurrency(totalActual)} の割合を円で表示します。</p><strong class="${heroTone}">${heroStatus}</strong></div>
              <div class="donut" style="--donut:${progressDonut.gradient}"><div class="donut-label"><strong>${progressDonut.percentage}%</strong><span>計画進捗</span></div></div>
            </section>
            <section class="summary-grid">
              ${summaryCard(incomeMode ? "現在の収入" : "現在の支出", totalActual, `${elapsedDays}/${totalDays}日経過`, incomeMode && totalActual < 0 ? "negative" : "", incomeMode)}
              ${summaryCard(incomeMode ? "計画上の収入合計" : "計画上の支出合計", totalPlan, `${monthLabel(analysisPeriod)}の計画`, incomeMode && totalPlan < 0 ? "negative" : "", incomeMode)}
            </section>
            <section class="card"><div class="section-copy"><p class="section-kicker">BY CATEGORY</p><h2>種別ごとの計画差</h2><p>${incomeMode ? "設定した並び順で表示しています。" : "変動支出・固定支出を入力画面と同じ並び順で表示し、想定外支出は別枠で表示します。"}</p></div>${analysisRows}</section>
            <section class="card"><div class="section-copy"><p class="section-kicker">INSIGHTS</p><h2>今月の気づき</h2></div><ul class="insight-list">${insights.map((item) => `<li class="insight-item"><span class="insight-icon" aria-hidden="true">${item.icon}</span><span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></span></li>`).join("")}</ul></section>
          </section>
          ${renderAnalysisDailyPage(range, incomeMode, analysisSelectedDate)}
          ${renderAnalysisRatioPage(rows, incomeMode)}
        </div>
      </div>
    </div>`;
  }

  function renderAnalysisRow(row, incomeMode) {
    let difference = "計画どおり";
    let tone = "";
    if (incomeMode && row.variance > 0) { difference = `${formatCurrency(row.variance)}未達`; tone = "negative"; }
    else if (incomeMode && row.variance < 0) { difference = `${formatCurrency(Math.abs(row.variance))}上振れ`; tone = "positive"; }
    else if (!incomeMode && row.variance < 0) { difference = `${formatCurrency(Math.abs(row.variance))}超過`; tone = "negative"; }
    else if (!incomeMode && row.variance > 0) difference = `${formatCurrency(row.variance)}残り`;
    return `<div class="analysis-row"><div class="analysis-row-head"><span><strong>${escapeHtml(row.category.name)}</strong>・実績 ${incomeMode ? formatSignedCurrency(row.actual) : formatCurrency(row.actual)}</span><strong class="${tone}">${difference}</strong></div><div class="analysis-track"><span style="--category-color:${escapeHtml(row.category.color)};--progress:${clamp(row.ratio * 100, 0, 100)}%"></span></div></div>`;
  }

  function planProgressRatio(plan, actual) {
    if (plan === 0) return actual !== 0 ? 2 : 0;
    return actual / plan;
  }

  function makePlanProgressDonut(plan, actual, incomeMode) {
    const progress = clamp(planProgressRatio(plan, actual) * 100, 0, 100);
    if (plan === 0) return { gradient: "var(--surface-2) 0 100%", percentage: 0 };
    const color = incomeMode ? "#2f8057" : "#d66735";
    return { gradient: `conic-gradient(${color} 0 ${progress.toFixed(2)}%, var(--surface-2) ${progress.toFixed(2)}% 100%)`, percentage: Math.round(progress) };
  }

  function createInsights(rows, totalPlan, totalActual, month) {
    if (month > periodForDate(localDateKey())) {
      return [{ icon: "→", title: "未来月の計画です", body: "実績がまだないため、予算計画だけを表示しています。月が始まると予算差や未記録項目を分析します。" }];
    }
    const insights = [];
    const overspent = rows.filter((row) => row.actual > row.plan && row.actual > 0).sort((a, b) => a.variance - b.variance);
    if (overspent[0]) insights.push({ icon: "!", title: `${overspent[0].category.name}が予算を超えています`, body: `${formatCurrency(Math.abs(overspent[0].variance))}の超過です。記録を確認し、必要なら翌月計画を調整しましょう。` });
    const fixedMissing = categoriesForGroup("fixed").filter((category) => planAmount(category.id, month) > 0 && actualAmount(category.id, month) === 0);
    if (fixedMissing.length) insights.push({ icon: "✓", title: "未記録の固定支出があります", body: `${fixedMissing.map((category) => category.name).join("、")}は予定がありますが実績が未入力です。` });
    const unplanned = rows.find((row) => row.plan === 0 && row.actual > 0);
    if (unplanned) insights.push({ icon: "＋", title: `${unplanned.category.name}に予算外支出`, body: `${formatCurrency(unplanned.actual)}の実績があります。今後も発生する場合は計画へ追加できます。` });
    if (!insights.length) insights.push({ icon: "○", title: "計画どおりに進んでいます", body: totalActual ? "目立った予算超過や未入力はありません。" : "まだ支出記録がありません。使ったら入力画面から記録しましょう。" });
    return insights;
  }

  function createIncomeInsights(rows, totalPlan, totalActual, month) {
    if (month > periodForDate(localDateKey())) {
      return [{ icon: "→", title: "未来月の収入計画です", body: "実績がまだないため、収入予定だけを表示しています。月が始まると未達や予定外収入を分析します。" }];
    }
    const insights = [];
    const shortfalls = rows.filter((row) => row.plan > row.actual).sort((a, b) => b.variance - a.variance);
    if (shortfalls[0]) insights.push({ icon: "!", title: `${shortfalls[0].category.name}が計画未達です`, body: `${formatCurrency(shortfalls[0].variance)}がまだ記録されていません。入金済みなら収入実績を追加してください。` });
    const unplanned = rows.find((row) => row.plan === 0 && row.actual > 0);
    if (unplanned) insights.push({ icon: "＋", title: `${unplanned.category.name}に予定外収入`, body: `${formatCurrency(unplanned.actual)}の実績があります。継続する場合は今後の収入計画へ追加できます。` });
    if (!insights.length) insights.push({ icon: "○", title: "収入は計画どおりです", body: totalActual ? "目立った未達はありません。" : "まだ収入実績がありません。入金されたら入力画面から記録しましょう。" });
    return insights;
  }

  function renderSettings() {
    const paneButtons = [
      ["basic", "基本設定"], ["expense", "支出計画"], ["income", "収入計画"], ["projects", "プロジェクト切替"]
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
      <label><span class="field-label">日付の切替時刻</span><input id="date-rollover-time" type="time" value="${normalizeDateRolloverTime(state.settings.dateRolloverTime)}" step="60" required></label>
      <p class="help-text">この時刻を境に、入力日・日毎予算・通知などのアプリ内の日付を切り替えます。23:00なら23:00から翌日扱い、01:00なら01:00までは前日扱いです。</p>
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
        <div class="section-copy"><p class="section-kicker">現在のプロジェクト</p><h2>${escapeHtml(project.name)}${project.isSample ? "（サンプル）" : ""}</h2><p>${projectDateLabel(project.startDate)}〜${projectDateLabel(project.endDate)}・${project.closingDay}日締め</p></div>
        <label><span class="field-label">プロジェクトを切り替える</span><select id="project-load-select">${projectOptions}</select></label>
        <div class="dialog-actions">
          <button type="button" class="button secondary" data-action="load-project">切り替える</button>
          <button type="button" class="button primary" data-action="set-default-project"${isDefault ? " disabled" : ""}>${isDefault ? "規定のプロジェクト" : "規定のプロジェクトに設定する"}</button>
        </div>
        <p class="help-text">規定のプロジェクトに設定すると、次回アプリを開いたときにこのプロジェクトを自動で読み込みます。</p>
      </section>
      ${isSample ? `<section class="card"><p class="help-text">サンプルプロジェクトはいつでも操作を試せるよう、名前の変更と削除はできません。</p></section>` : `<form id="project-rename-form" class="card settings-form">
        <div class="section-copy"><p class="section-kicker">プロジェクト名変更</p><h2>現在のプロジェクト名を変更する</h2></div>
        <label><span class="field-label">プロジェクト名</span><input id="project-current-name" type="text" maxlength="40" value="${escapeHtml(project.name)}" required></label>
        <div class="dialog-actions">
          <button type="submit" class="button primary">名前を保存</button>
          <button type="button" class="button danger" data-action="delete-project">このプロジェクトを削除</button>
        </div>
        <p class="help-text">削除すると、このプロジェクトの計画・実績も端末から削除されます。</p>
      </form>`}
      <form id="project-create-form" class="card settings-form">
        <div class="section-copy"><p class="section-kicker">新しいプロジェクトを作成</p><h2>新しいプロジェクトを作成</h2><p>現在のプロジェクトとは別に、将来の家計簿期間をあらかじめ作成できます。</p></div>
        <label><span class="field-label">プロジェクト名</span><input id="project-name-input" type="text" maxlength="40" placeholder="例：2026年度の家計簿" required></label>
        <div class="form-grid two-columns">
          <label><span class="field-label">開始日</span><input id="project-start-date" type="date" value="${defaultStart}" required></label>
          <label><span class="field-label">終了日</span><input id="project-end-date" type="date" value="${defaultEnd}" required></label>
        </div>
        <p class="help-text">開始日を変えると、終了日は3年後の前日に自動調整されます。作成後は新しいプロジェクトを読み込みます。</p>
        <button type="submit" class="button primary">プロジェクトを作成して読み込む</button>
      </form>
    </div>`;
  }

  function renderCategorySettings(direction) {
    if (direction === "income") {
      return `<section class="section"><div class="section-header"><div><p class="section-kicker">INCOME</p><h2>収入種別と月別予定</h2></div><button type="button" class="button small primary" data-add-category="income">＋ 追加</button></div><p class="help-text">資産運用などは「収入（マイナス込み）」を選ぶと、月別計画を0円から上下に設定できます。</p><div class="category-settings-list">${renderCategoryRows(incomeCategories(true))}</div></section>`;
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
        <span class="category-meta"><strong>${escapeHtml(category.name)}${category.active === false ? "（無効）" : ""}</strong><span>${monthLabel(currentPeriod)} ${isSignedIncomeCategory(category) ? formatSignedCurrency(planAmount(category.id, currentPeriod)) : formatCurrency(planAmount(category.id, currentPeriod))}</span><span>計画合計 ${isSignedIncomeCategory(category) ? formatSignedCurrency(periodPlanTotal(category.id)) : formatCurrency(periodPlanTotal(category.id))}</span></span>
        <button type="button" class="row-action" data-edit-category="${escapeHtml(category.id)}">編集</button>
        <button type="button" class="row-action category-active-toggle ${category.active === false ? "is-inactive" : ""}" data-toggle-category-active="${escapeHtml(category.id)}">${category.active === false ? "有効にする" : "無効にする"}</button>
        ${dailyToggle}
      </article>`;
    }).join("");
  }

  function developerClockLabel(date = appNow()) {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short"
    }).format(date);
  }

  function renderData() {
    const updated = state.updatedAt ? new Date(state.updatedAt).toLocaleString("ja-JP") : "未保存";
    const backupDate = state.settings.lastBackupAt ? new Date(state.settings.lastBackupAt) : null;
    const lastBackup = backupDate && !Number.isNaN(backupDate.getTime()) ? backupDate.toLocaleString("ja-JP") : "まだ作成していません";
    const outsideTransactions = state.transactions.filter((transaction) => transaction.date < state.settings.startDate || transaction.date > state.settings.endDate);
    viewHost.innerHTML = `<div class="view-stack">
      <section class="card"><p class="section-kicker">LOCAL FIRST</p><h2>データはこの端末内に保存</h2><p>外部サーバーには送信しません。機種変更や万一に備えて定期的にバックアップしてください。</p><div class="privacy-banner">${state.categories.length}種別・${state.transactions.length}件の実績・${periodMonths().length}ヶ月の計画<br>最終更新：${escapeHtml(updated)}</div></section>
      <section class="data-action-list">
        ${dataAction("{ }", "完全バックアップ", `編集せず保管する復元用ファイル。最終作成：${escapeHtml(lastBackup)}`, "export-json")}
        ${dataAction("戻", "完全バックアップから復元", "完全バックアップを読み込んで全置換", "import-json")}
      </section>
      <section class="card developer-mode-card">
        <div class="section-copy"><p class="section-kicker">DEVELOPER MODE</p><h2>開発者モード</h2><p>動作確認用に、アプリ内で参照する現在日時を任意の日時へ固定します。無効にするとiPhoneの日時へ戻ります。</p></div>
        <label class="developer-mode-toggle">
          <span class="category-daily-copy"><strong>開発者モードを有効化</strong><span>${developerModeIsEnabled() ? `現在のアプリ内時刻：${escapeHtml(developerClockLabel())}` : "無効時はiPhoneの現在日時で動作します。"}</span></span>
          <input class="daily-budget-toggle-input" type="checkbox" role="switch" data-developer-mode-toggle${developerModeIsEnabled() ? " checked" : ""}>
          <span class="daily-budget-switch" aria-hidden="true"></span>
        </label>
        ${developerModeIsEnabled() ? `<div class="developer-clock-actions"><p>設定日時：<strong>${escapeHtml(developerClockLabel())}</strong></p><button type="button" class="button secondary" data-action="open-developer-clock">時刻設定</button></div>` : ""}
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

  function calculatorShiftTargetMonths(sourceMonth) {
    const sourceIndex = periodMonths().indexOf(sourceMonth);
    return sourceIndex < 0 ? [] : periodMonths().slice(sourceIndex + 1);
  }

  function calculatorBudgetSources(category, sourceMonth) {
    if (!category || !["variable", "fixed"].includes(category.group)) return { monthly: 0, carry: 0, total: 0 };
    const stats = categoryBudgetStats(category.id, sourceMonth);
    const monthly = Math.max(0, stats.monthlyRemaining);
    const carry = Math.max(0, stats.carryRemaining);
    return { monthly, carry, total: monthly + carry };
  }

  function consumeCarryOriginQueue(queue, amount) {
    let remaining = Math.max(0, toInteger(amount));
    while (remaining > 0 && queue.length) {
      const origin = queue[0];
      const consumed = Math.min(remaining, origin.amount);
      origin.amount -= consumed;
      remaining -= consumed;
      if (origin.amount <= 0) queue.shift();
    }
    return remaining;
  }

  function carryBudgetOriginQueue(categoryId, sourceMonth) {
    const sourceIndex = periodMonths().indexOf(sourceMonth);
    if (sourceIndex <= 0) return [];
    const queue = [];
    let debt = 0;
    periodMonths().slice(0, sourceIndex).forEach((month) => {
      const balance = planAmount(categoryId, month) - actualAmount(categoryId, month);
      if (balance >= 0) {
        const debtPayment = Math.min(balance, debt);
        debt -= debtPayment;
        const surplus = balance - debtPayment;
        if (surplus > 0) queue.push({ month, amount: surplus });
        return;
      }
      const unmetDeficit = consumeCarryOriginQueue(queue, -balance);
      debt += unmetDeficit;
    });
    const stats = categoryBudgetStats(categoryId, sourceMonth);
    consumeCarryOriginQueue(queue, Math.max(0, stats.actual - stats.plan));
    return queue;
  }

  function carryBudgetOriginAllocations(categoryId, sourceMonth, amount) {
    const queue = carryBudgetOriginQueue(categoryId, sourceMonth);
    let remaining = Math.max(0, toInteger(amount));
    const allocations = [];
    while (remaining > 0 && queue.length) {
      const origin = queue[0];
      const moved = Math.min(remaining, origin.amount);
      allocations.push({ month: origin.month, amount: moved });
      remaining -= moved;
      origin.amount -= moved;
      if (origin.amount <= 0) queue.shift();
    }
    return allocations;
  }

  function calculatorBudgetPriority(kind, sources) {
    if (sources.carry > 0 && sources.monthly <= 0) return "carry";
    if (sources.monthly > 0 && sources.carry <= 0) return "monthly";
    const value = document.querySelector(`#calculator-${kind}-priority`).value;
    return value === "carry" ? "carry" : "monthly";
  }

  function configureCalculatorBudgetPriority(kind, sources) {
    const field = document.querySelector(`#calculator-${kind}-priority-field`);
    const select = document.querySelector(`#calculator-${kind}-priority`);
    const hasBoth = sources.monthly > 0 && sources.carry > 0;
    field.hidden = !hasBoth;
    select.disabled = !hasBoth;
    select.value = sources.carry > 0 && sources.monthly <= 0 ? "carry" : "monthly";
  }

  function calculatorBudgetSourceText(sourceMonth, sources) {
    return `${monthLabel(sourceMonth)}で操作できる予算：今月の予算 ${formatCurrency(sources.monthly)}、持ち越し予算 ${formatCurrency(sources.carry)}`;
  }

  function calculatorBudgetAllocation(category, sourceMonth, amount, priority) {
    const sources = calculatorBudgetSources(category, sourceMonth);
    const requested = Math.max(0, toInteger(amount));
    let remaining = Math.min(requested, sources.total);
    let monthly = 0;
    let carry = 0;
    const takeMonthly = () => {
      const taken = Math.min(remaining, sources.monthly);
      monthly += taken;
      remaining -= taken;
    };
    const takeCarry = () => {
      const taken = Math.min(remaining, sources.carry);
      carry += taken;
      remaining -= taken;
    };
    if (priority === "carry") {
      takeCarry();
      takeMonthly();
    } else {
      takeMonthly();
      takeCarry();
    }
    return {
      sources,
      requested,
      amount: monthly + carry,
      monthly,
      carry,
      carryOrigins: carryBudgetOriginAllocations(category.id, sourceMonth, carry)
    };
  }

  function budgetPlanChangesForAllocation(sourceMonth, allocation, targetMonth = null) {
    const changes = new Map();
    const addChange = (month, amount) => changes.set(month, toInteger(changes.get(month)) + toInteger(amount));
    if (allocation.monthly > 0) addChange(sourceMonth, -allocation.monthly);
    allocation.carryOrigins.forEach((origin) => addChange(origin.month, -origin.amount));
    if (targetMonth && allocation.amount > 0) addChange(targetMonth, allocation.amount);
    return changes;
  }

  function calculatorBudgetAfterText(allocation) {
    const nextMonthly = allocation.sources.monthly - allocation.monthly;
    const nextCarry = allocation.sources.carry - allocation.carry;
    return `操作後\n今月の予算 ${formatCurrency(allocation.sources.monthly)} → ${formatCurrency(nextMonthly)}\n持ち越し予算 ${formatCurrency(allocation.sources.carry)} → ${formatCurrency(nextCarry)}`;
  }

  function calculatorForecastText(planChanges) {
    const before = projectEndForecastFromAggregates(periodMonths().map(aggregateMonth));
    const after = projectEndForecastAfterBudgetPlanChanges(planChanges);
    const difference = after - before;
    return `プロジェクト終了時の見込み収支 ${formatSignedCurrency(before)} → ${formatSignedCurrency(after)}${difference ? `（${difference > 0 ? "＋" : "−"}${formatCurrency(Math.abs(difference))}）` : "（変化なし）"}`;
  }

  function updateCalculatorShiftTargetSummary() {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const category = categoryById(calculatorContext.categoryId);
    const sourceMonth = calculatorContext.sourceMonth;
    const targetMonth = document.querySelector("#calculator-shift-target-month").value;
    const sources = calculatorBudgetSources(category, sourceMonth);
    const amountInput = document.querySelector("#calculator-shift-amount");
    const requestedAmount = Math.max(0, toInteger(amountInput.value));
    const priority = calculatorBudgetPriority("shift", sources);
    const allocation = calculatorBudgetAllocation(category, sourceMonth, requestedAmount, priority);
    const targetBudget = category && targetMonth ? planAmount(category.id, targetMonth) : 0;
    const validAmount = requestedAmount > 0 && requestedAmount <= sources.total && Boolean(targetMonth);
    const budgetSummary = document.querySelector("#calculator-shift-budget-summary");
    const forecast = document.querySelector("#calculator-shift-forecast");
    document.querySelector("#calculator-shift-source").textContent = calculatorBudgetSourceText(sourceMonth, sources);
    document.querySelector("#calculator-shift-target-summary").textContent = targetMonth
      ? `${monthLabel(targetMonth)}の現在の予定：${formatCurrency(targetBudget)} → シフト後：${formatCurrency(targetBudget + allocation.amount)}`
      : "移動先の月を選択してください。";
    const confirm = document.querySelector("#calculator-shift-confirm");
    confirm.disabled = !validAmount;
    confirm.textContent = targetMonth && requestedAmount > 0 ? `${monthLabel(targetMonth)}へ${formatCurrency(requestedAmount)}をシフト` : "予算をシフトする";
    amountInput.max = String(sources.total);
    if (requestedAmount > sources.total) {
      budgetSummary.classList.add("is-invalid");
      budgetSummary.textContent = `シフトできる予算は${formatCurrency(sources.total)}までです。`;
      forecast.textContent = "シフト額を予算内にすると、見込み収支への影響を表示します。";
      return;
    }
    budgetSummary.classList.remove("is-invalid");
    budgetSummary.textContent = calculatorBudgetAfterText(allocation);
    forecast.textContent = requestedAmount > 0 && targetMonth
      ? calculatorForecastText(budgetPlanChangesForAllocation(sourceMonth, allocation, targetMonth))
      : "シフト額と移動先を選ぶと、見込み収支への影響を表示します。";
  }

  function calculatorMovableBudget(category, sourceMonth) {
    return calculatorBudgetSources(category, sourceMonth).total;
  }

  function updateCalculatorReturnSummary() {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const category = categoryById(calculatorContext.categoryId);
    const sourceMonth = calculatorContext.sourceMonth;
    const sources = calculatorBudgetSources(category, sourceMonth);
    const amountInput = document.querySelector("#calculator-return-amount");
    const requestedAmount = Math.max(0, toInteger(amountInput.value));
    const priority = calculatorBudgetPriority("return", sources);
    const allocation = calculatorBudgetAllocation(category, sourceMonth, requestedAmount, priority);
    const forecast = document.querySelector("#calculator-return-forecast");
    const budgetSummary = document.querySelector("#calculator-return-budget-summary");
    const confirm = document.querySelector("#calculator-return-confirm");
    document.querySelector("#calculator-return-source").textContent = calculatorBudgetSourceText(sourceMonth, sources);
    amountInput.max = String(sources.total);
    confirm.disabled = requestedAmount <= 0;
    if (requestedAmount > sources.total) {
      budgetSummary.classList.add("is-invalid");
      budgetSummary.textContent = `返納できる予算は${formatCurrency(sources.total)}までです。`;
      forecast.classList.add("is-invalid");
      forecast.textContent = "返納額を予算内にしてください。";
      return;
    }
    budgetSummary.classList.remove("is-invalid");
    budgetSummary.textContent = calculatorBudgetAfterText(allocation);
    forecast.classList.remove("is-invalid");
    forecast.textContent = requestedAmount > 0
      ? calculatorForecastText(budgetPlanChangesForAllocation(sourceMonth, allocation))
      : "返納額を入力すると、見込み収支への影響を表示します。";
  }

  function updateCalculatorAddBudgetSummary() {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const category = categoryById(calculatorContext.categoryId);
    const sourceMonth = calculatorContext.sourceMonth;
    const amountInput = document.querySelector("#calculator-add-budget-amount");
    const amount = Math.max(0, toInteger(amountInput.value));
    const currentBudget = category ? planAmount(category.id, sourceMonth) : 0;
    const forecast = document.querySelector("#calculator-add-budget-forecast");
    const confirm = document.querySelector("#calculator-add-budget-confirm");
    document.querySelector("#calculator-add-budget-source").textContent = `${monthLabel(sourceMonth)}の現在の予算は${formatCurrency(currentBudget)}です。`;
    confirm.disabled = amount <= 0;
    if (amount <= 0) {
      forecast.textContent = "追加する金額を入力すると、見込み収支への影響を表示します。";
      return;
    }
    const before = projectEndForecastFromAggregates(periodMonths().map(aggregateMonth));
    const after = projectEndForecastAfterBudgetAddition(sourceMonth, amount);
    const decrease = Math.max(0, before - after);
    forecast.textContent = `プロジェクト終了時の見込み収支 ${formatSignedCurrency(before)} → ${formatSignedCurrency(after)}${decrease ? `（${formatCurrency(decrease)}減少）` : "（変化なし）"}`;
  }

  function resetCalculatorShiftPanel(category) {
    const panel = document.querySelector("#calculator-shift-panel");
    const returnPanel = document.querySelector("#calculator-return-panel");
    const addPanel = document.querySelector("#calculator-add-budget-panel");
    const actions = document.querySelector("#calculator-budget-actions");
    const toggle = document.querySelector("#calculator-shift-toggle");
    const returnToggle = document.querySelector("#calculator-return-toggle");
    const addToggle = document.querySelector("#calculator-add-budget-toggle");
    const sourceMonth = currentPeriod;
    const canShiftBudget = category && ["variable", "fixed"].includes(category.group) && !isUnexpectedExpenseCategory(category);
    const targets = canShiftBudget ? calculatorShiftTargetMonths(sourceMonth) : [];
    const sources = calculatorBudgetSources(category, sourceMonth);
    const movableBudget = sources.total;
    panel.hidden = true;
    returnPanel.hidden = true;
    addPanel.hidden = true;
    document.querySelector("#calculator-expression").hidden = false;
    document.querySelector("#calculator-display").hidden = false;
    document.querySelector("#calculator-keys").hidden = false;
    actions.hidden = !canShiftBudget;
    returnToggle.disabled = false;
    returnToggle.title = movableBudget <= 0 ? "返納する予算がありません" : "今月の予算と持ち越し予算から返納します";
    toggle.disabled = false;
    toggle.title = movableBudget <= 0 ? "シフトする予算がありません" : !targets.length ? "移動先の月がありません" : "今月の予算と持ち越し予算を別の月へ移します";
    document.querySelector("#calculator-shift-target-month").innerHTML = targets.map((month) => `<option value="${month}">${monthLabel(month)}</option>`).join("");
    configureCalculatorBudgetPriority("shift", sources);
    configureCalculatorBudgetPriority("return", sources);
    document.querySelector("#calculator-shift-amount").value = String(movableBudget);
    document.querySelector("#calculator-return-amount").value = String(movableBudget);
    document.querySelector("#calculator-add-budget-amount").value = "";
    addToggle.disabled = false;
    addToggle.title = `${monthLabel(sourceMonth)}の計画予算を追加します`;
    updateCalculatorShiftTargetSummary();
    updateCalculatorReturnSummary();
    updateCalculatorAddBudgetSummary();
  }

  function openCalculator(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    calculatorContext = {
      categoryId,
      direction: directionForCategory(category),
      isFixed: category.group === "fixed" && !isUnexpectedExpenseCategory(category),
      isUnexpectedExpense: isUnexpectedExpenseCategory(category),
      isUnexpectedIncome: isUnexpectedIncomeCategory(category),
      allowsNegative: isSignedIncomeCategory(category),
      canShiftBudget: ["variable", "fixed"].includes(category.group) && !isUnexpectedExpenseCategory(category),
      sourceMonth: currentPeriod
    };
    calculator = createCalculatorState();
    if (calculatorContext.isFixed) {
      calculator.current = String(planAmount(categoryId, currentPeriod));
      calculator.waitingForOperand = true;
      calculator.expression = `${monthLabel(currentPeriod)}の予定額`;
    }
    document.querySelector("#calculator-category").textContent = category.name;
    document.querySelector("#calculator-kind").textContent = calculatorContext.isUnexpectedExpense ? "想定外支出を入力" : calculatorContext.isUnexpectedIncome ? "想定外収入を入力" : calculatorContext.allowsNegative ? "収入（マイナス込み）を入力" : calculatorContext.direction === "income" ? "収入を入力" : "支出を入力";
    document.querySelector('[data-calc="subtract"]').hidden = !calculatorContext.allowsNegative;
    resetCalculatorShiftPanel(category);
    updateCalculatorDisplay();
    openDialog(calculatorDialog);
  }

  function updateCalculatorDisplay() {
    const value = calculatorContext && calculatorContext.allowsNegative ? toInteger(Number(calculator.current)) : Math.max(0, toInteger(Number(calculator.current)));
    const display = document.querySelector("#calculator-display");
    const pendingNegative = calculatorContext && calculatorContext.allowsNegative && calculator.current === "-0";
    display.textContent = pendingNegative ? `−${formatCurrency(0)}` : calculatorContext && calculatorContext.allowsNegative ? formatSignedCurrency(value) : formatCurrency(value);
    display.classList.toggle("negative", value < 0 || pendingNegative);
    document.querySelector("#calculator-expression").textContent = calculator.expression;
    document.querySelector("#calculator-ok").disabled = calculatorContext && calculatorContext.allowsNegative ? value === 0 : value <= 0;
    const forecast = document.querySelector("#calculator-project-forecast");
    if (calculatorContext && (calculatorContext.isUnexpectedExpense || calculatorContext.isUnexpectedIncome)) {
      const before = projectEndForecastFromAggregates(periodMonths().map(aggregateMonth));
      const after = calculatorContext.isUnexpectedIncome
        ? projectEndForecastAfterUnexpectedIncome(calculatorContext.sourceMonth, value)
        : projectEndForecastAfterUnexpectedExpense(calculatorContext.sourceMonth, value);
      forecast.classList.toggle("positive", calculatorContext.isUnexpectedIncome);
      forecast.hidden = false;
      forecast.textContent = `プロジェクト終了時の見込み収支 ${formatSignedCurrency(before)} → ${formatSignedCurrency(after)}`;
    } else {
      forecast.classList.remove("positive");
      forecast.hidden = true;
      forecast.textContent = "";
    }
  }

  function calculatorInputDigit(digit) {
    if (calculator.waitingForOperand) {
      calculator.current = digit === "00" ? "0" : digit;
      calculator.waitingForOperand = false;
    } else if (calculator.current === "0" || calculator.current === "-0") {
      const prefix = calculator.current === "-0" ? "-" : "";
      calculator.current = digit === "00" ? `${prefix}0` : `${prefix}${digit}`;
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
    if (nextOperation === "subtract" && calculatorContext && calculatorContext.allowsNegative && calculator.accumulator === null && calculator.operation === null && (calculator.current === "0" || calculator.current === "-0")) {
      calculator.current = calculator.current === "-0" ? "0" : "-0";
      calculator.waitingForOperand = false;
      calculator.expression = "";
      return;
    }
    const inputValue = Number(calculator.current);
    const symbols = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
    if (calculator.operation && !calculator.waitingForOperand) {
      const result = performCalculation(calculator.accumulator, inputValue, calculator.operation);
      const normalizedResult = calculatorContext && calculatorContext.allowsNegative ? Math.round(result) : Math.max(0, Math.round(result));
      calculator.current = String(normalizedResult);
      calculator.accumulator = normalizedResult;
    } else if (calculator.accumulator === null) {
      calculator.accumulator = inputValue;
    }
    calculator.operation = nextOperation;
    calculator.waitingForOperand = true;
    calculator.expression = `${calculatorContext && calculatorContext.allowsNegative ? formatSignedCurrency(calculator.accumulator) : formatCurrency(calculator.accumulator)} ${symbols[nextOperation]}`;
  }

  function calculatorEquals() {
    if (!calculator.operation || calculator.waitingForOperand) return;
    const result = performCalculation(calculator.accumulator, Number(calculator.current), calculator.operation);
    calculator.current = String(calculatorContext && calculatorContext.allowsNegative ? Math.round(result) : Math.max(0, Math.round(result)));
    calculator.expression = "";
    calculator.accumulator = null;
    calculator.operation = null;
    calculator.waitingForOperand = true;
  }

  function toggleCalculatorNegative() {
    if (!calculatorContext || !calculatorContext.allowsNegative) return;
    if (calculator.waitingForOperand) {
      calculator.current = "-0";
      calculator.waitingForOperand = false;
    } else if (calculator.current.startsWith("-")) {
      calculator.current = calculator.current.slice(1) || "0";
    } else {
      calculator.current = `-${calculator.current}`;
    }
    calculator.accumulator = null;
    calculator.operation = null;
    calculator.expression = "";
  }

  function handleCalculatorKey(key) {
    if (/^\d+$/.test(key)) calculatorInputDigit(key);
    else if (key === "subtract") toggleCalculatorNegative();
    else if (key === "clear") calculator = createCalculatorState();
    else if (key === "backspace") {
      if (!calculator.waitingForOperand) {
        const nextValue = calculator.current.length > 1 ? calculator.current.slice(0, -1) : "0";
        calculator.current = nextValue === "-" ? "0" : nextValue;
      }
    }
    updateCalculatorDisplay();
  }

  async function acceptCalculator() {
    calculatorEquals();
    const amount = calculatorContext && calculatorContext.allowsNegative ? toInteger(calculator.current) : Math.max(0, toInteger(calculator.current));
    if (!calculatorContext || (calculatorContext.allowsNegative ? amount === 0 : amount <= 0)) return;
    const category = categoryById(calculatorContext.categoryId);
    const transaction = {
      id: makeId("tx"),
      direction: calculatorContext.direction,
      categoryId: calculatorContext.categoryId,
      date: periodMonths().includes(periodForDate(localDateKey())) && currentPeriod === periodForDate(localDateKey()) ? localDateKey() : periodRange(currentPeriod).end,
      enteredOn: localDateKey(),
      amount,
      memo: "",
      createdAt: appTimestamp(),
      updatedAt: appTimestamp()
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
    document.querySelector("#memo-summary").textContent = `${category.name}・${calculatorContext.allowsNegative ? formatSignedCurrency(amount) : formatCurrency(amount)}・${dateTimeLabel(transaction.date)}`;
    document.querySelector("#memo-input").value = "";
    openDialog(memoDialog);
  }

  async function shiftCalculatorBudget() {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const category = categoryById(calculatorContext.categoryId);
    const sourceMonth = calculatorContext.sourceMonth;
    const targetMonth = document.querySelector("#calculator-shift-target-month").value;
    const amount = Math.max(0, toInteger(document.querySelector("#calculator-shift-amount").value));
    const targets = calculatorShiftTargetMonths(sourceMonth);
    if (!category || !["variable", "fixed"].includes(category.group) || !targets.includes(targetMonth)) throw new Error("移動先の月を選択してください");
    const sources = calculatorBudgetSources(category, sourceMonth);
    if (sources.total <= 0) throw new Error("シフトする予算がありません");
    if (amount <= 0 || amount > sources.total) throw new Error(`移せる金額は${formatCurrency(sources.total)}までです`);
    const allocation = calculatorBudgetAllocation(category, sourceMonth, amount, calculatorBudgetPriority("shift", sources));
    if (allocation.carryOrigins.reduce((sum, origin) => sum + origin.amount, 0) !== allocation.carry) throw new Error("持ち越し予算の移動元を確認できませんでした");
    const planChanges = budgetPlanChangesForAllocation(sourceMonth, allocation, targetMonth);
    const previousPlans = { ...(state.plans[category.id] || {}) };
    const previousDefaultAmount = category.defaultAmount;
    const previousPlanRule = category.planRule ? { ...category.planRule } : null;
    state.plans[category.id] = { ...previousPlans };
    planChanges.forEach((change, month) => {
      state.plans[category.id][month] = Math.max(0, toInteger(previousPlans[month]) + change);
    });
    category.defaultAmount = Math.max(0, toInteger(state.plans[category.id][currentPeriod]));
    category.planRule = null;
    try {
      await persist(`${category.name}の予算を${monthLabel(sourceMonth)}から${monthLabel(targetMonth)}へ${formatCurrency(amount)}シフトしました（今月 ${formatCurrency(allocation.monthly)}・持ち越し ${formatCurrency(allocation.carry)}）`);
    } catch (error) {
      state.plans[category.id] = previousPlans;
      category.defaultAmount = previousDefaultAmount;
      category.planRule = previousPlanRule;
      updateCalculatorShiftTargetSummary();
      throw error;
    }
    closeDialog(calculatorDialog);
    render();
  }

  async function returnCalculatorBudget() {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const category = categoryById(calculatorContext.categoryId);
    const sourceMonth = calculatorContext.sourceMonth;
    const amount = Math.max(0, toInteger(document.querySelector("#calculator-return-amount").value));
    if (!category || !["variable", "fixed"].includes(category.group)) throw new Error("返納できる支出項目を選択してください");
    const sources = calculatorBudgetSources(category, sourceMonth);
    if (sources.total <= 0) throw new Error("返納する予算がありません");
    if (amount > sources.total) {
      closeDialog(calculatorDialog);
      render();
      showToast(`返納できる予算は${formatCurrency(sources.total)}までです`);
      return;
    }
    if (amount <= 0) throw new Error("返納額を入力してください");
    const allocation = calculatorBudgetAllocation(category, sourceMonth, amount, calculatorBudgetPriority("return", sources));
    if (allocation.carryOrigins.reduce((sum, origin) => sum + origin.amount, 0) !== allocation.carry) throw new Error("持ち越し予算の返納元を確認できませんでした");
    const planChanges = budgetPlanChangesForAllocation(sourceMonth, allocation);
    const previousPlans = { ...(state.plans[category.id] || {}) };
    const previousDefaultAmount = category.defaultAmount;
    const previousPlanRule = category.planRule ? { ...category.planRule } : null;
    state.plans[category.id] = { ...previousPlans };
    planChanges.forEach((change, month) => {
      state.plans[category.id][month] = Math.max(0, toInteger(previousPlans[month]) + change);
    });
    category.defaultAmount = Math.max(0, toInteger(state.plans[category.id][currentPeriod]));
    category.planRule = null;
    try {
      await persist(`${category.name}の${monthLabel(sourceMonth)}の予算から${formatCurrency(amount)}を返納しました（今月 ${formatCurrency(allocation.monthly)}・持ち越し ${formatCurrency(allocation.carry)}）`);
    } catch (error) {
      state.plans[category.id] = previousPlans;
      category.defaultAmount = previousDefaultAmount;
      category.planRule = previousPlanRule;
      updateCalculatorReturnSummary();
      throw error;
    }
    closeDialog(calculatorDialog);
    render();
  }

  async function addCalculatorBudget() {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const category = categoryById(calculatorContext.categoryId);
    const sourceMonth = calculatorContext.sourceMonth;
    const amount = Math.max(0, toInteger(document.querySelector("#calculator-add-budget-amount").value));
    if (!category || !["variable", "fixed"].includes(category.group)) throw new Error("予算を追加できる支出項目を選択してください");
    if (amount <= 0) throw new Error("追加する金額を入力してください");
    const sourceBudget = planAmount(category.id, sourceMonth);
    const previousDefaultAmount = category.defaultAmount;
    const previousPlanRule = category.planRule ? { ...category.planRule } : null;
    state.plans[category.id] = { ...(state.plans[category.id] || {}) };
    state.plans[category.id][sourceMonth] = sourceBudget + amount;
    category.defaultAmount = Math.max(0, toInteger(state.plans[category.id][currentPeriod]));
    category.planRule = null;
    try {
      await persist(`${category.name}の${monthLabel(sourceMonth)}の予算に${formatCurrency(amount)}を追加しました`);
    } catch (error) {
      state.plans[category.id][sourceMonth] = sourceBudget;
      category.defaultAmount = previousDefaultAmount;
      category.planRule = previousPlanRule;
      updateCalculatorAddBudgetSummary();
      throw error;
    }
    closeDialog(calculatorDialog);
    render();
  }

  async function savePendingTransaction(memo) {
    if (!pendingTransaction) return;
    const stored = state.transactions.find((transaction) => transaction.id === pendingTransaction.id);
    if (stored) {
      stored.memo = String(memo || "").trim();
      stored.updatedAt = appTimestamp();
    }
    const category = categoryById(pendingTransaction.categoryId);
    const amount = pendingTransaction.amount;
    pendingTransaction = null;
    closeDialog(memoDialog);
    await persist(`${category ? category.name : "記録"} ${category && isSignedIncomeCategory(category) ? formatSignedCurrency(amount) : formatCurrency(amount)}を保存しました`);
    render();
  }

  function openTransactionEditor(id) {
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction) return;
    const category = categoryById(transaction.categoryId);
    const categories = state.categories.filter((category) => directionForCategory(category) === transaction.direction);
    document.querySelector("#transaction-id").value = transaction.id;
    document.querySelector("#transaction-category").innerHTML = categories.map((category) => `<option value="${escapeHtml(category.id)}"${category.id === transaction.categoryId ? " selected" : ""}>${escapeHtml(category.name)}${category.active === false ? "（非表示）" : ""}</option>`).join("");
    const amountInput = document.querySelector("#transaction-amount");
    amountInput.value = transaction.amount;
    amountInput.min = isSignedIncomeCategory(category) ? String(-MAX_PLAN_SCALE_MAX) : "1";
    const dateInput = document.querySelector("#transaction-date");
    dateInput.min = state.settings.startDate;
    dateInput.max = state.settings.endDate;
    dateInput.value = transaction.date;
    document.querySelector("#transaction-memo").value = transaction.memo || "";
    openDialog(transactionDialog);
  }

  function updateTransactionAmountInputConstraints() {
    const category = categoryById(document.querySelector("#transaction-category").value);
    document.querySelector("#transaction-amount").min = isSignedIncomeCategory(category) ? String(-MAX_PLAN_SCALE_MAX) : "1";
  }

  function limitCategoryGroupOptions(select, group) {
    const groups = isIncomeCategory({ group }) ? INCOME_CATEGORY_GROUPS : EXPENSE_CATEGORY_GROUPS;
    select.innerHTML = groups.map((value) => `<option value="${value}">${CATEGORY_GROUP_LABELS[value]}</option>`).join("");
  }

  function updatePlanReminderControls() {
    const enabled = document.querySelector("#plan-reminder-enabled").checked;
    const schedule = document.querySelector("#plan-reminder-schedule").value;
    const useWeekday = schedule === REMINDER_SCHEDULE_WEEKDAY;
    document.querySelector("#plan-reminder-options").hidden = !enabled;
    document.querySelector("#plan-reminder-day-field").hidden = useWeekday;
    document.querySelector("#plan-reminder-weekday-fields").hidden = !useWeekday;
    document.querySelector("#plan-reminder-help").textContent = !enabled
      ? "通知は無効です。"
      : useWeekday
        ? "締日に合わせ、対象月度の範囲内で選んだ週・曜日に通知します。対象月度内にない場合は、最も近い同じ曜日に読み替えます。"
        : "締日に合わせ、対象月度の範囲内にある同じ日に通知します。存在しない日は月末日に読み替えます。";
  }

  function setPlanReminderControls(reminder) {
    const config = normalizeReminderConfig(reminder);
    document.querySelector("#plan-reminder-day").innerHTML = Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${index + 1}日</option>`).join("");
    document.querySelector("#plan-reminder-week").innerHTML = Array.from({ length: 5 }, (_, index) => `<option value="${index + 1}">第${index + 1}</option>`).join("");
    document.querySelector("#plan-reminder-weekday").innerHTML = REMINDER_WEEKDAY_LABELS.map((label, index) => `<option value="${index}">${label}</option>`).join("");
    document.querySelector("#plan-reminder-enabled").checked = config.enabled;
    document.querySelector("#plan-reminder-schedule").value = config.schedule;
    document.querySelector("#plan-reminder-day").value = String(config.dayOfMonth);
    document.querySelector("#plan-reminder-week").value = String(config.weekOfMonth);
    document.querySelector("#plan-reminder-weekday").value = String(config.weekday);
    updatePlanReminderControls();
  }

  function planReminderConfigFromForm() {
    return normalizeReminderConfig({
      enabled: document.querySelector("#plan-reminder-enabled").checked,
      schedule: document.querySelector("#plan-reminder-schedule").value,
      dayOfMonth: document.querySelector("#plan-reminder-day").value,
      weekOfMonth: document.querySelector("#plan-reminder-week").value,
      weekday: document.querySelector("#plan-reminder-weekday").value
    });
  }

  function openCategoryEditor(group = "variable") {
    document.querySelector("#category-dialog-title").textContent = "種別を追加";
    document.querySelector("#category-id").value = "";
    document.querySelector("#category-name").value = "";
    const groupSelect = document.querySelector("#category-group");
    limitCategoryGroupOptions(groupSelect, group);
    groupSelect.value = group;
    document.querySelector("#category-color").value = isIncomeCategory({ group }) ? "#2b8a63" : "#3f7d5b";
    openDialog(categoryDialog);
  }

  function updatePlanCategoryKind(group) {
    const planLength = periodMonths().length;
    document.querySelector("#plan-kind").textContent = isSignedIncomeGroup(group) ? `収入（マイナス込み）予定・${planLength}ヶ月` : group === "income" ? `収入予定・${planLength}ヶ月` : group === "fixed" ? `固定支出・${planLength}ヶ月` : `変動支出・${planLength}ヶ月`;
    document.querySelector("#plan-editor-help").textContent = isSignedIncomeGroup(group)
      ? "月名をタップして選択。中央の0円から、上へ黒字・下へ赤字として概算入力できます。横スクロールは余白から操作できます。"
      : "月名をタップして選択。棒の上は上下で概算入力、横スクロールは余白から操作できます。";
    const bulkAmount = document.querySelector("#plan-bulk-amount");
    if (bulkAmount) bulkAmount.min = isSignedIncomeGroup(group) ? String(-MAX_PLAN_SCALE_MAX) : "0";
  }

  function planEditorAllowsNegative() {
    return isSignedIncomeGroup(document.querySelector("#plan-category-group").value);
  }

  function normalizePlanEditorAmount(amount) {
    return planEditorAllowsNegative() ? toInteger(amount) : Math.max(0, toInteger(amount));
  }

  function formatPlanAmount(amount) {
    return planEditorAllowsNegative() ? formatSignedCurrency(amount) : formatCurrency(amount);
  }

  function openPlanEditor(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    cancelPlanPointerTracking();
    editingPlanCategoryId = categoryId;
    planDraft = {};
    planRuleDraft = category.planRule ? { ...category.planRule, amount: normalizePlanAmount(category, category.planRule.amount) } : null;
    planScaleDraft = normalizePlanScaleMax(category.planScaleMax);
    selectedPlanMonth = null;
    periodMonths().forEach((month) => { planDraft[month] = planAmount(categoryId, month); });
    document.querySelector("#plan-category-name").textContent = category.name;
    document.querySelector("#plan-category-name-input").value = category.name;
    const groupSelect = document.querySelector("#plan-category-group");
    limitCategoryGroupOptions(groupSelect, category.group);
    groupSelect.value = category.group;
    document.querySelector("#plan-category-color").value = category.color;
    setPlanReminderControls(category.reminder);
    updatePlanCategoryKind(category.group);
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
    const allowsNegative = planEditorAllowsNegative();
    updatePlanScaleSummary();
    monthlyPlanEditor.innerHTML = periodMonths().map((month) => {
      const amount = normalizePlanEditorAmount(planDraft[month]);
      const height = allowsNegative ? planSignedBarHeight(amount) : planBarHeight(amount);
      const overScale = allowsNegative ? Math.abs(amount) > planScaleDraft : amount > planScaleDraft;
      const sliderValue = planBarPositionAmount(amount, planScaleDraft, allowsNegative);
      const valueText = `${formatPlanAmount(amount)}${overScale ? `（棒の上限 ${formatCurrency(planScaleDraft)}を超過）` : ""}`;
      const selected = month === selectedPlanMonth;
      return `<article class="month-plan-column ${selected ? "selected" : ""} ${overScale ? "over-scale" : ""} ${allowsNegative ? "signed-plan" : ""}" data-plan-column="${month}" style="--category-color:${escapeHtml(category.color)}">
        <button type="button" class="month-plan-label" data-plan-select="${month}" aria-pressed="${selected}">${monthLabel(month, false)}<br>${monthParts(month).year}<span class="month-plan-selected-indicator"${selected ? "" : " hidden"}>選択中</span></button>
        <div class="month-plan-bar-area${allowsNegative ? " is-signed" : ""}" data-plan-slider="${month}" role="slider" tabindex="0" aria-label="${monthLabel(month)}の計画金額" aria-describedby="plan-scale-step" aria-orientation="vertical" aria-valuemin="${allowsNegative ? -planScaleDraft : 0}" aria-valuemax="${planScaleDraft}" aria-valuenow="${sliderValue}" aria-valuetext="${escapeHtml(valueText)}"${selected ? ' aria-current="true"' : ""}>
          <span class="month-plan-overflow"${overScale ? "" : " hidden"}>上限超過</span>
          ${allowsNegative ? '<span class="month-plan-zero-line" aria-hidden="true"></span>' : ""}
          <span class="month-plan-bar${allowsNegative ? ` is-signed ${amount < 0 ? "is-negative" : "is-positive"}${amount === 0 ? " is-zero" : ""}` : ""}" style="--bar-height:${height}%"></span>
        </div>
        <input class="month-plan-input" data-plan-month="${month}" type="number" min="${allowsNegative ? -MAX_PLAN_SCALE_MAX : 0}" step="any" inputmode="numeric" value="${amount}" aria-label="${monthLabel(month)}の計画金額">
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
      const label = column.querySelector(".month-plan-label");
      if (label) label.setAttribute("aria-pressed", String(selected));
      const barArea = column.querySelector(".month-plan-bar-area");
      if (selected) barArea.setAttribute("aria-current", "true");
      else barArea.removeAttribute("aria-current");
    });
    const copyButton = document.querySelector("#copy-next-plan");
    const canCopy = selectedIndex >= 0 && selectedIndex < months.length - 1;
    copyButton.disabled = !canCopy;
    if (selectedIndex < 0) {
      copyButton.textContent = "月を選択すると次の月へコピーできます";
      copyButton.title = "月名・棒グラフ・金額欄をタップして月を選択してください";
    } else if (!canCopy) {
      copyButton.textContent = "最終月のため次の月へコピーできません";
      copyButton.title = "最後の月から先にはコピーできません";
    } else {
      copyButton.textContent = `選択中の${monthLabel(months[selectedIndex])}の値を${monthLabel(months[selectedIndex + 1])}へコピー`;
      copyButton.title = `${monthLabel(months[selectedIndex])}の値を${monthLabel(months[selectedIndex + 1])}へコピー`;
    }
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
    const allowsNegative = planEditorAllowsNegative();
    document.querySelector("#plan-scale-summary").textContent = allowsNegative ? `0円を中心に上下 ${formatCurrency(planScaleDraft)}` : `上端 ${formatCurrency(planScaleDraft)}`;
    document.querySelector("#plan-scale-step").textContent = allowsNegative ? `上下とも${formatCurrency(planBarStep())}刻み` : `棒は${formatCurrency(planBarStep())}刻み`;
  }

  function updatePlanColumn(month, amount, syncInput = true) {
    if (!planDraft || !Object.prototype.hasOwnProperty.call(planDraft, month)) return;
    const allowsNegative = planEditorAllowsNegative();
    const normalizedAmount = normalizePlanEditorAmount(amount);
    planDraft[month] = normalizedAmount;
    const column = monthlyPlanEditor.querySelector(`[data-plan-column="${month}"]`);
    if (!column) return;
    const barArea = column.querySelector(".month-plan-bar-area");
    const bar = column.querySelector(".month-plan-bar");
    const input = column.querySelector(".month-plan-input");
    const overflow = column.querySelector(".month-plan-overflow");
    const overScale = allowsNegative ? Math.abs(normalizedAmount) > planScaleDraft : normalizedAmount > planScaleDraft;
    bar.style.setProperty("--bar-height", `${allowsNegative ? planSignedBarHeight(normalizedAmount) : planBarHeight(normalizedAmount)}%`);
    bar.classList.toggle("is-negative", allowsNegative && normalizedAmount < 0);
    bar.classList.toggle("is-positive", allowsNegative && normalizedAmount >= 0);
    bar.classList.toggle("is-zero", allowsNegative && normalizedAmount === 0);
    barArea.setAttribute("aria-valuemin", String(allowsNegative ? -planScaleDraft : 0));
    barArea.setAttribute("aria-valuemax", String(planScaleDraft));
    barArea.setAttribute("aria-valuenow", String(planBarPositionAmount(normalizedAmount, planScaleDraft, allowsNegative)));
    barArea.setAttribute("aria-valuetext", `${formatPlanAmount(normalizedAmount)}${overScale ? `（棒の上限 ${formatCurrency(planScaleDraft)}を超過）` : ""}`);
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
    if (planEditorAllowsNegative()) {
      const rawAmount = (ratio - 0.5) * 2 * planScaleDraft;
      if (rawAmount >= planScaleDraft - (step / 2)) return planScaleDraft;
      if (rawAmount <= -planScaleDraft + (step / 2)) return -planScaleDraft;
      return clamp(roundSignedAmountToStep(rawAmount, step), -planScaleDraft, planScaleDraft);
    }
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
    updatePlanColumn(event.target.dataset.planMonth, event.target.value);
  }

  function applyPlanPattern() {
    const months = periodMonths();
    const startMonth = document.querySelector("#plan-start-month").value;
    const startIndex = months.indexOf(startMonth);
    const interval = clamp(toInteger(document.querySelector("#plan-interval").value, 1), 1, 36);
    const amount = normalizePlanEditorAmount(document.querySelector("#plan-bulk-amount").value);
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

  function isSafeImportedId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._|:-]*$/.test(String(value));
  }

  function directionForImportedCategory(category) {
    return isIncomeCategory(category) ? "income" : "expense";
  }

  async function exportJson() {
    const exportedAt = appTimestamp();
    const backupState = { ...state, settings: { ...state.settings, lastBackupAt: exportedAt } };
    const payload = { app: APP_NAME, backupVersion: BACKUP_VERSION, exportedAt, state: backupState };
    downloadBlob(JSON.stringify(payload, null, 2), "application/json", `budget-minus-backup-${localDateKey()}.json`);
    const previousState = state;
    state = backupState;
    try {
      await persist("完全バックアップを作成しました");
      render();
    } catch (error) {
      state = previousState;
      throw error;
    }
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
      if (!category || !isSafeImportedId(category.id) || ids.has(String(category.id)) || !["variable", "fixed", "income", SIGNED_INCOME_GROUP].includes(category.group)) throw new Error("バックアップの種別データが不正です。");
      if (category.planScaleMax !== undefined && (!Number.isFinite(Number(category.planScaleMax)) || Number(category.planScaleMax) <= 0 || Number(category.planScaleMax) > MAX_PLAN_SCALE_MAX)) throw new Error(`${category.name || "種別"}の棒上限額が不正です。`);
      if (category.dailyBudgetEnabled !== undefined && typeof category.dailyBudgetEnabled !== "boolean") throw new Error(`${category.name || "種別"}の日毎予算設定が不正です。`);
      ids.add(String(category.id));
      const categoryPlans = imported.plans[category.id] || {};
      Object.entries(categoryPlans).forEach(([month, amount]) => {
        if (!isValidMonthKey(month) || (!isSignedIncomeCategory(category) && toInteger(amount, -1) < 0)) throw new Error(`${category.name || "種別"}の月別計画が不正です。`);
      });
      if (category.planRule && (!isValidMonthKey(category.planRule.startMonth) || toInteger(category.planRule.interval) < 1 || toInteger(category.planRule.interval) > 36 || (!isSignedIncomeCategory(category) && toInteger(category.planRule.amount, -1) < 0))) throw new Error(`${category.name || "種別"}の一括設定ルールが不正です。`);
    });
    const transactionIds = new Set();
    imported.transactions.forEach((transaction) => {
      if (!transaction) throw new Error("バックアップの実績データが不正です。");
      const category = imported.categories.find((item) => String(item.id) === String(transaction.categoryId));
      const allowsNegative = isSignedIncomeCategory(category);
      if (!isSafeImportedId(transaction.id) || transactionIds.has(String(transaction.id)) || !ids.has(String(transaction.categoryId)) || !["expense", "income"].includes(transaction.direction) || !isValidDateKey(transaction.date) || (allowsNegative ? toInteger(transaction.amount) === 0 : toInteger(transaction.amount) <= 0)) throw new Error("バックアップの実績データが不正です。");
      if (directionForImportedCategory(category) !== transaction.direction) throw new Error("バックアップの実績区分と種別が一致しません。");
      transactionIds.add(String(transaction.id));
    });
  }

  async function importDataFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || payload.app !== APP_NAME || payload.backupVersion !== BACKUP_VERSION || !payload.state) throw new Error("有効なBudget Minus完全バックアップではありません。");
    const imported = payload.state;
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
    else if (target.dataset.analysisDate) { analysisSelectedDate = target.dataset.analysisDate; render(); }
    else if (target.dataset.analysisPage !== undefined) selectAnalysisPage(target.dataset.analysisPage);
    else if (target.dataset.action === "clear-analysis-date") { analysisSelectedDate = ""; render(); }
    else if (target.dataset.analysisMode) {
      analysisMode = target.dataset.analysisMode === "income" ? "income" : "expense";
      analysisDetailPage = 0;
      analysisSelectedDate = "";
      render();
    }
    else if (target.dataset.settingsPane) { settingsPane = target.dataset.settingsPane; render(); }
    else if (target.dataset.addCategory) openCategoryEditor(target.dataset.addCategory);
    else if (target.dataset.editCategory) openPlanEditor(target.dataset.editCategory);
    else if (target.dataset.action === "toggle-cumulative-auto-scale") {
      cumulativeAutoScaleEnabled = !cumulativeAutoScaleEnabled;
      cumulativeScaleWindow = null;
      if (overviewChartScaleTimer) {
        window.clearTimeout(overviewChartScaleTimer);
        overviewChartScaleTimer = null;
      }
      render();
    }
    else if (target.dataset.overviewChartIndex !== undefined) { cumulativeChartSelectedIndex = clamp(toInteger(target.dataset.overviewChartIndex), 0, Math.max(0, periodMonths().length - 1)); render(); }
    else if (target.dataset.toggleCategoryActive) await toggleCategoryActive(target.dataset.toggleCategoryActive);
    else if (target.dataset.action === "toggle-income") { incomeExpanded = !incomeExpanded; render(); }
    else if (target.dataset.action === "toggle-unexpected-entries") { unexpectedEntriesExpanded = !unexpectedEntriesExpanded; render(); }
    else if (target.dataset.action === "toggle-history") { allTransactionsShown = !allTransactionsShown; render(); }
    else if (target.dataset.action === "open-developer-clock") openDeveloperClockDialog();
    else if (target.dataset.action === "export-json") await exportJson();
    else if (target.dataset.action === "import-json") { importFile.accept = "application/json,.json"; importFile.value = ""; importFile.click(); }
    else if (target.dataset.action === "load-project") await loadSelectedProject();
    else if (target.dataset.action === "set-default-project") await setCurrentProjectAsDefault();
    else if (target.dataset.action === "delete-project") await deleteCurrentProject();
    else if (target.dataset.action === "reset-data") openDialog(resetDialog);
  }

  async function handleViewChange(event) {
    const dailyBudgetCategoryId = event.target.dataset.dailyBudgetCategory;
    if (event.target.dataset.developerModeToggle !== undefined) {
      await setDeveloperMode(event.target.checked);
    } else if (dailyBudgetCategoryId) {
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
    } else if (event.target.id === "entry-period") {
      currentPeriod = event.target.value;
      allTransactionsShown = false;
      render();
    } else if (event.target.id === "analysis-period") {
      analysisPeriod = event.target.value;
      analysisDetailPage = 0;
      analysisSelectedDate = "";
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
    const dateRolloverTime = normalizeDateRolloverTime(document.querySelector("#date-rollover-time").value);
    const startDate = document.querySelector("#start-date").value;
    const endDate = document.querySelector("#end-date").value;
    const themeId = themePresetFor(document.querySelector('input[name="theme-id"]:checked')?.value).id;
    if (!startDate || !endDate || parseLocalDate(endDate) < parseLocalDate(startDate)) {
      showToast("終了日は開始日以降にしてください");
      return;
    }
    if (closingDay !== Number(state.settings.closingDay) && state.transactions.length && !window.confirm("締日を変えると、入力済み実績が所属する月も再計算されます。変更しますか？")) return;
    const previousSettings = state.settings;
    state.settings = { ...state.settings, closingDay, dateRolloverTime, startDate, endDate, themeId };
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
  viewHost.addEventListener("pointerdown", startAnalysisPageSwipe);
  viewHost.addEventListener("pointerup", finishAnalysisPageSwipe);
  viewHost.addEventListener("pointercancel", cancelAnalysisPageSwipe);
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
  document.querySelector("#calculator-shift-toggle").addEventListener("click", (event) => {
    const category = calculatorContext && categoryById(calculatorContext.categoryId);
    if (calculatorMovableBudget(category, calculatorContext && calculatorContext.sourceMonth) <= 0) {
      showToast("シフトする予算がありません");
      return;
    }
    if (!calculatorContext || !calculatorShiftTargetMonths(calculatorContext.sourceMonth).length) {
      showToast("移動先の月がありません");
      return;
    }
    const panel = document.querySelector("#calculator-shift-panel");
    if (!panel.hidden) return;
    panel.hidden = false;
    document.querySelector("#calculator-return-panel").hidden = true;
    document.querySelector("#calculator-add-budget-panel").hidden = true;
    document.querySelector("#calculator-expression").hidden = true;
    document.querySelector("#calculator-display").hidden = true;
    document.querySelector("#calculator-keys").hidden = true;
    document.querySelector("#calculator-budget-actions").hidden = true;
    updateCalculatorShiftTargetSummary();
  });
  document.querySelector("#calculator-return-toggle").addEventListener("click", () => {
    const category = calculatorContext && categoryById(calculatorContext.categoryId);
    if (calculatorMovableBudget(category, calculatorContext && calculatorContext.sourceMonth) <= 0) {
      showToast("返納する予算がありません");
      return;
    }
    const panel = document.querySelector("#calculator-return-panel");
    if (!panel.hidden) return;
    panel.hidden = false;
    document.querySelector("#calculator-shift-panel").hidden = true;
    document.querySelector("#calculator-add-budget-panel").hidden = true;
    document.querySelector("#calculator-expression").hidden = true;
    document.querySelector("#calculator-display").hidden = true;
    document.querySelector("#calculator-keys").hidden = true;
    document.querySelector("#calculator-budget-actions").hidden = true;
    updateCalculatorReturnSummary();
  });
  document.querySelector("#calculator-add-budget-toggle").addEventListener("click", () => {
    if (!calculatorContext || !calculatorContext.canShiftBudget) return;
    const panel = document.querySelector("#calculator-add-budget-panel");
    if (!panel.hidden) return;
    panel.hidden = false;
    document.querySelector("#calculator-return-panel").hidden = true;
    document.querySelector("#calculator-shift-panel").hidden = true;
    document.querySelector("#calculator-expression").hidden = true;
    document.querySelector("#calculator-display").hidden = true;
    document.querySelector("#calculator-keys").hidden = true;
    document.querySelector("#calculator-budget-actions").hidden = true;
    updateCalculatorAddBudgetSummary();
  });
  document.querySelector("#calculator-shift-target-month").addEventListener("change", updateCalculatorShiftTargetSummary);
  document.querySelector("#calculator-shift-priority").addEventListener("change", updateCalculatorShiftTargetSummary);
  document.querySelector("#calculator-shift-amount").addEventListener("input", updateCalculatorShiftTargetSummary);
  document.querySelector("#calculator-shift-confirm").addEventListener("click", () => shiftCalculatorBudget().catch((error) => showToast(error.message)));
  document.querySelector("#calculator-return-priority").addEventListener("change", updateCalculatorReturnSummary);
  document.querySelector("#calculator-return-amount").addEventListener("input", updateCalculatorReturnSummary);
  document.querySelector("#calculator-return-confirm").addEventListener("click", () => returnCalculatorBudget().catch((error) => showToast(error.message)));
  document.querySelector("#calculator-add-budget-amount").addEventListener("input", updateCalculatorAddBudgetSummary);
  document.querySelector("#calculator-add-budget-confirm").addEventListener("click", () => addCalculatorBudget().catch((error) => showToast(error.message)));
  document.querySelector("#calculator-form").addEventListener("submit", (event) => event.preventDefault());

  document.querySelector("#app-version-button").addEventListener("click", () => {
    document.querySelector("#app-version-name").textContent = `v${APP_VERSION}`;
    refreshAppUpdateUi();
    openDialog(versionDialog);
  });
  document.querySelector("#app-update-check").addEventListener("click", () => checkForAppUpdate());

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

  document.querySelector("#developer-clock-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveDeveloperClock().catch((error) => showToast(error instanceof Error ? error.message : "時刻を設定できませんでした"));
  });

  document.querySelector("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.querySelector("#transaction-id").value;
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction) return;
    const categoryId = document.querySelector("#transaction-category").value;
    const category = categoryById(categoryId);
    if (!category) return;
    const rawAmount = toInteger(document.querySelector("#transaction-amount").value);
    const amount = isSignedIncomeCategory(category) ? rawAmount : Math.max(1, rawAmount);
    if (isSignedIncomeCategory(category) && amount === 0) {
      showToast("収入（マイナス込み）の実績は0円以外で入力してください");
      return;
    }
    const date = document.querySelector("#transaction-date").value;
    if (date < state.settings.startDate || date > state.settings.endDate) {
      showToast("日付は管理期間内にしてください");
      return;
    }
    transaction.categoryId = categoryId;
    transaction.amount = amount;
    transaction.date = date;
    transaction.memo = document.querySelector("#transaction-memo").value.trim();
    transaction.updatedAt = appTimestamp();
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
      state.categories.push({ id: categoryId, name, group, color, order, active: true, defaultAmount: 0, planScaleMax: DEFAULT_PLAN_SCALE_MAX, dailyBudgetEnabled: false, reminder: normalizeReminderConfig() });
      state.plans[categoryId] = {};
      periodMonths().forEach((month) => { state.plans[categoryId][month] = 0; });
    }
    closeDialog(categoryDialog);
    await persist("種別を保存しました");
    render();
  });

  async function deleteCategory(id, dialog) {
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
    closeDialog(dialog);
    await persist(hasTransactions ? "種別を非表示にしました" : "種別を削除しました");
    render();
  }

  document.querySelector("#apply-plan-pattern").addEventListener("click", applyPlanPattern);
  document.querySelector("#copy-next-plan").addEventListener("click", copyPlanToNextMonth);
  document.querySelector("#plan-category-group").addEventListener("change", (event) => {
    updatePlanCategoryKind(event.target.value);
    renderPlanEditor();
  });
  document.querySelector("#plan-reminder-enabled").addEventListener("change", updatePlanReminderControls);
  document.querySelector("#plan-reminder-schedule").addEventListener("change", updatePlanReminderControls);

  document.querySelector("#transaction-category").addEventListener("change", updateTransactionAmountInputConstraints);
  document.querySelector("#plan-category-delete").addEventListener("click", () => deleteCategory(editingPlanCategoryId, planDialog).catch((error) => showToast(error.message)));
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
    updatePlanColumn(event.target.dataset.planMonth, event.target.value, false);
  });
  monthlyPlanEditor.addEventListener("focusin", (event) => {
    if (event.target.dataset.planMonth) selectPlanMonth(event.target.dataset.planMonth);
  });
  monthlyPlanEditor.addEventListener("click", (event) => {
    const monthSelectButton = event.target.closest("[data-plan-select]");
    if (monthSelectButton) selectPlanMonth(monthSelectButton.dataset.planSelect);
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
    const allowsNegative = planEditorAllowsNegative();
    const currentAmount = normalizePlanEditorAmount(planDraft[month]);
    const barStep = planBarStep();
    const pageStep = Math.max(barStep, roundAmountToStep(planScaleDraft / 10, barStep));
    let nextAmount;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") nextAmount = currentAmount + barStep;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") nextAmount = currentAmount - barStep;
    else if (event.key === "PageUp") nextAmount = currentAmount + pageStep;
    else if (event.key === "PageDown") nextAmount = currentAmount - pageStep;
    else if (event.key === "Home") nextAmount = allowsNegative ? -planScaleDraft : 0;
    else if (event.key === "End") nextAmount = planScaleDraft;
    else return;
    event.preventDefault();
    selectPlanMonth(month);
    const maximum = Math.abs(currentAmount) > planScaleDraft ? MAX_PLAN_SCALE_MAX : planScaleDraft;
    const minimum = allowsNegative ? -maximum : 0;
    const roundedAmount = allowsNegative ? roundSignedAmountToStep(nextAmount, barStep) : roundAmountToStep(nextAmount, barStep);
    updatePlanColumn(month, clamp(roundedAmount, minimum, maximum));
  });
  document.querySelector("#plan-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = categoryById(editingPlanCategoryId);
    if (!category || !planDraft) return;
    const name = document.querySelector("#plan-category-name-input").value.trim();
    const group = document.querySelector("#plan-category-group").value;
    const color = document.querySelector("#plan-category-color").value;
    if (!name) {
      showToast("項目名を入力してください");
      return;
    }
    const hasTransactions = state.transactions.some((item) => item.categoryId === category.id);
    if (hasTransactions && directionForCategory(category) !== directionForImportedCategory({ group })) {
      showToast("実績がある項目は支出・収入の区分を変更できません");
      return;
    }
    planScaleDraft = normalizePlanScaleMax(document.querySelector("#plan-scale-max").value);
    const allowsNegative = isSignedIncomeGroup(group);
    const normalizedPlanDraft = {};
    Object.entries(planDraft).forEach(([month, amount]) => { normalizedPlanDraft[month] = allowsNegative ? toInteger(amount) : Math.max(0, toInteger(amount)); });
    state.plans[editingPlanCategoryId] = { ...(state.plans[editingPlanCategoryId] || {}), ...normalizedPlanDraft };
    category.name = name;
    category.group = group;
    category.color = color;
    category.active = true;
    category.archivedAt = null;
    if (group !== "variable") category.dailyBudgetEnabled = false;
    category.defaultAmount = allowsNegative ? toInteger(normalizedPlanDraft[currentPeriod] ?? Object.values(normalizedPlanDraft)[0]) : Math.max(0, toInteger(normalizedPlanDraft[currentPeriod] ?? Object.values(normalizedPlanDraft)[0]));
    category.planRule = planRuleDraft ? { ...planRuleDraft, amount: allowsNegative ? toInteger(planRuleDraft.amount) : Math.max(0, toInteger(planRuleDraft.amount)) } : null;
    category.planScaleMax = planScaleDraft;
    category.reminder = planReminderConfigFromForm();
    cancelPlanPointerTracking();
    closeDialog(planDialog);
    await persist(`${category.name}の項目と計画を保存しました`);
    render();
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try { await importDataFile(file); }
    catch (error) { showToast(error instanceof Error ? error.message : "ファイルを読み込めませんでした"); }
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("focus", refreshForCurrentDeviceDate);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshForCurrentDeviceDate();
  });

  function refreshForCurrentDeviceDate() {
    if (!state || developerModeIsEnabled() || localDateKey() === lastRenderedDate) return;
    render();
  }

  function scheduleNextDateRefresh() {
    if (nextDayRenderTimer) window.clearTimeout(nextDayRenderTimer);
    if (developerModeIsEnabled()) return;
    const now = new Date();
    const next = nextDateRollover(now);
    nextDayRenderTimer = window.setTimeout(() => {
      nextDayRenderTimer = null;
      refreshForCurrentDeviceDate();
      scheduleNextDateRefresh();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }

  async function initialize() {
    try {
      applyLoadedProject(await window.BudgetDB.getWorkspace());
      updateNetworkStatus();
      render();
    } catch (error) {
      viewHost.innerHTML = `<div class="card"><h2>データを開けませんでした</h2><p>${escapeHtml(error instanceof Error ? error.message : "時間をおいて再度お試しください。")}</p></div>`;
    }

    try {
      await registerServiceWorker();
    } catch (error) {
      console.error("Service Workerの登録に失敗しました。", error);
    }
  }

  initialize();
})();
