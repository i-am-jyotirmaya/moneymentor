/*
 * MoneyMentor local test-data generator.
 *
 * Run this in the browser where you are already signed in to the local web app.
 * With the default API URL, open the web app as http://localhost:3000 so the
 * Strict refresh cookie remains on the same site as http://localhost:5267.
 *
 *   1. Open DevTools -> Sources -> Snippets.
 *   2. Paste this file into a snippet and run it once.
 *   3. In the Console, run: await generateMoneyMentorTestData();
 *
 * Preview without writes:
 *   await generateMoneyMentorTestData({ dryRun: true });
 *
 * Override the base monthly income or local API URL:
 *   await generateMoneyMentorTestData({
 *     apiBaseUrl: "http://localhost:5267",
 *     monthlyIncome: 100000
 *   });
 */
(function installMoneyMentorTestDataGenerator(browserWindow) {
  "use strict";

  const DEFAULT_API_BASE_URL = "http://localhost:5267";
  const DEFAULT_MONTHLY_INCOME = 10_000;
  const SEED_MARKER = "[moneymentor-seed-vone]";
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

  function assertLocalUrl(url, label) {
    if (!LOCAL_HOSTS.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
      throw new Error(`${label} must use a local http(s) URL. Received ${url.origin}.`);
    }
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function formatMoneyForParser(value) {
    return value.toFixed(2);
  }

  function formatDate(year, month, day) {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getCalendarDate(now, timeZone) {
    let parts;
    try {
      parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
    } catch (error) {
      throw new Error(`The household timezone '${timeZone}' is not supported by this browser.`, { cause: error });
    }

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
    };
  }

  function shiftMonth(year, month, offset) {
    const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      key: formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1).slice(0, 7),
    };
  }

  function makeEntry(period, definition, baseIncome) {
    const amount = roundMoney(baseIncome * definition.ratio);
    const amountText = formatMoneyForParser(amount);
    const sourceText = definition.text(amountText);

    return {
      amount,
      categoryName: definition.categoryName,
      classification: definition.classification,
      date: formatDate(period.year, period.month, definition.day),
      sourceText: `${sourceText} ${SEED_MARKER}`,
      type: definition.type ?? "Expense",
    };
  }

  function buildSeedEntries(periods, monthlyIncome) {
    const common = [
      { day: 2, ratio: 0.25, categoryName: "Rent", classification: "consumption", text: (amount) => `paid rent ${amount} to landlord` },
      { day: 4, ratio: 0.02, categoryName: "Groceries", classification: "consumption", text: (amount) => `groceries for ${amount} from local market` },
      { day: 6, ratio: 0.01, categoryName: "Fuel", classification: "consumption", text: (amount) => `petrol ${amount} from fuel station` },
      { day: 7, ratio: 0.01, categoryName: "Food Delivery", classification: "consumption", text: (amount) => `swiggy dinner ${amount}` },
      { day: 8, ratio: 0.025, categoryName: "Electricity", classification: "consumption", text: (amount) => `paid electricity ${amount} to power company` },
      { day: 9, ratio: 0.015, categoryName: "Internet", classification: "consumption", text: (amount) => `paid internet ${amount} to broadband provider` },
      { day: 11, ratio: 0.02, categoryName: "Groceries", classification: "consumption", text: (amount) => `groceries for ${amount} from local market` },
      { day: 14, ratio: 0.01, categoryName: "Food Delivery", classification: "consumption", text: (amount) => `swiggy dinner ${amount}` },
      { day: 18, ratio: 0.02, categoryName: "Groceries", classification: "consumption", text: (amount) => `groceries for ${amount} from local market` },
      { day: 20, ratio: 0.01, categoryName: "Fuel", classification: "consumption", text: (amount) => `petrol ${amount} from fuel station` },
      { day: 21, ratio: 0.01, categoryName: "Food Delivery", classification: "consumption", text: (amount) => `swiggy dinner ${amount}` },
      { day: 25, ratio: 0.02, categoryName: "Groceries", classification: "consumption", text: (amount) => `groceries for ${amount} from local market` },
      { day: 28, ratio: 0.01, categoryName: "Food Delivery", classification: "consumption", text: (amount) => `swiggy dinner ${amount}` },
    ];

    const olderDefinitions = [
      { day: 1, ratio: 1, categoryName: "Salary / Wages", classification: "income", type: "Income", text: (amount) => `salary credited ${amount}` },
      ...common,
      { day: 5, ratio: 0.15, categoryName: "Mutual Funds / ETFs", classification: "savings", text: (amount) => `paid sip ${amount} to broker` },
      { day: 23, ratio: 0.03, categoryName: "General Merchandise", classification: "consumption", text: (amount) => `amazon shopping ${amount}` },
    ];

    const newerDefinitions = [
      { day: 1, ratio: 0.95, categoryName: "Salary / Wages", classification: "income", type: "Income", text: (amount) => `salary credited ${amount}` },
      ...common.map((definition) => {
        if (definition.categoryName === "Groceries") return { ...definition, ratio: 0.025 };
        if (definition.categoryName === "Fuel") return { ...definition, ratio: 0.025 };
        if (definition.categoryName === "Food Delivery") return { ...definition, ratio: 0.03 };
        if (definition.categoryName === "Electricity") return { ...definition, ratio: 0.03 };
        return definition;
      }),
      { day: 5, ratio: 0.08, categoryName: "Mutual Funds / ETFs", classification: "savings", text: (amount) => `paid sip ${amount} to broker` },
      { day: 23, ratio: 0.06, categoryName: "General Merchandise", classification: "consumption", text: (amount) => `amazon shopping ${amount}` },
      { day: 26, ratio: 0.06, categoryName: "General Merchandise", classification: "consumption", text: (amount) => `amazon shopping ${amount}` },
    ];

    return [
      ...olderDefinitions.map((definition) => makeEntry(periods[0], definition, monthlyIncome)),
      ...newerDefinitions.map((definition) => makeEntry(periods[1], definition, monthlyIncome)),
    ].sort((left, right) => left.date.localeCompare(right.date));
  }

  function buildFinancialSummary(entries) {
    const byPeriod = new Map();
    for (const entry of entries) {
      const period = entry.date.slice(0, 7);
      const summary = byPeriod.get(period) ?? {
        period,
        transactionCount: 0,
        income: 0,
        consumption: 0,
        savingsAllocation: 0,
        categories: {},
      };

      summary.transactionCount += 1;
      if (entry.classification === "income") summary.income += entry.amount;
      if (entry.classification === "consumption") summary.consumption += entry.amount;
      if (entry.classification === "savings") summary.savingsAllocation += entry.amount;
      summary.categories[entry.categoryName] = roundMoney(
        (summary.categories[entry.categoryName] ?? 0) + entry.amount,
      );
      byPeriod.set(period, summary);
    }

    return Array.from(byPeriod.values()).map((summary) => ({
      ...summary,
      income: roundMoney(summary.income),
      consumption: roundMoney(summary.consumption),
      savingsAllocation: roundMoney(summary.savingsAllocation),
    }));
  }

  function readErrorBody(body, status) {
    if (!body) return `HTTP ${status}`;
    if (typeof body === "string") return body;
    if (body.detail) return body.detail;
    if (body.title) return body.title;
    if (Array.isArray(body.errors)) return body.errors.join("; ");
    if (body.errors && typeof body.errors === "object") {
      return Object.values(body.errors).flat().join("; ");
    }
    return `HTTP ${status}`;
  }

  async function createApiClient(apiBaseUrl) {
    let accessToken;

    async function request(path, options = {}) {
      const headers = new Headers(options.headers);
      if (options.body !== undefined) headers.set("Content-Type", "application/json");
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        credentials: "include",
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const body = response.status === 204
        ? null
        : contentType.includes("application/json")
          ? await response.json()
          : await response.text();

      if (!response.ok) {
        const error = new Error(`${options.label ?? path}: ${readErrorBody(body, response.status)}`);
        error.status = response.status;
        error.retryAfter = response.headers.get("retry-after");
        throw error;
      }

      return body;
    }

    const session = await request("/api/auth/refresh", {
      method: "POST",
      label: "Could not restore the logged-in session",
    });
    if (!session?.accessToken) {
      throw new Error("The refresh response did not contain an access token. Sign in again and retry.");
    }
    if (session.requiresPrivacyConsent) {
      throw new Error("Accept the current privacy policy in MoneyMentor before generating financial data.");
    }
    accessToken = session.accessToken;

    return { request };
  }

  async function listMonthTransactions(api, householdId, month) {
    const items = [];
    let page = 1;
    let totalPages = 1;

    do {
      const query = new URLSearchParams({
        householdId,
        month,
        page: String(page),
        pageSize: "100",
      });
      const response = await api.request(`/api/transactions?${query}`, {
        label: `Could not list transactions for ${month}`,
      });
      items.push(...(response?.items ?? []));
      totalPages = Math.max(1, Number(response?.totalPages ?? 1));
      page += 1;
    } while (page <= totalPages);

    return items;
  }

  function assertCreatedTransaction(transaction, expected, context) {
    if (!transaction) throw new Error(`${context}: the API did not return a saved transaction.`);

    const failures = [];
    if (transaction.householdId !== expected.householdId) failures.push("household");
    if (transaction.userProfileId !== expected.userProfileId) failures.push("owner");
    if (transaction.type !== expected.type) failures.push(`type '${transaction.type}'`);
    if (Number(transaction.amount) !== expected.amount) failures.push(`amount '${transaction.amount}'`);
    if (transaction.transactionDate !== expected.date) failures.push(`date '${transaction.transactionDate}'`);
    if (transaction.currencyCode !== expected.currencyCode) failures.push(`currency '${transaction.currencyCode}'`);
    if (transaction.categoryName !== expected.categoryName) failures.push(`category '${transaction.categoryName}'`);
    if (!transaction.sourceText?.includes(SEED_MARKER)) failures.push("seed marker");

    if (failures.length > 0) {
      throw new Error(`${context}: saved transaction validation failed (${failures.join(", ")}).`);
    }
  }

  async function rollback(api, newIds, deletedIds) {
    const failures = [];
    for (const id of [...newIds].reverse()) {
      try {
        await api.request(`/api/transactions/${encodeURIComponent(id)}`, {
          method: "DELETE",
          label: `Rollback could not delete new transaction ${id}`,
        });
      } catch (error) {
        failures.push(error.message);
      }
    }
    for (const id of deletedIds) {
      try {
        await api.request(`/api/transactions/${encodeURIComponent(id)}/restore`, {
          method: "POST",
          label: `Rollback could not restore previous transaction ${id}`,
        });
      } catch (error) {
        failures.push(error.message);
      }
    }
    return failures;
  }

  async function generateMoneyMentorTestData(options = {}) {
    const pageUrl = new URL(browserWindow.location.href);
    assertLocalUrl(pageUrl, "The MoneyMentor web page");

    const apiUrl = new URL(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
    assertLocalUrl(apiUrl, "The MoneyMentor API");
    const apiBaseUrl = apiUrl.origin + apiUrl.pathname.replace(/\/$/, "");

    const monthlyIncome = Number(options.monthlyIncome ?? DEFAULT_MONTHLY_INCOME);
    if (!Number.isFinite(monthlyIncome) || monthlyIncome < 1 || monthlyIncome > 100_000_000) {
      throw new Error("monthlyIncome must be between 1 and 100,000,000 so every generated amount remains positive.");
    }

    const now = options.now === undefined ? new Date() : new Date(options.now);
    if (Number.isNaN(now.getTime())) throw new Error("now must be a valid date when provided.");

    const api = await createApiClient(apiBaseUrl);
    const [settings, householdDashboard] = await Promise.all([
      api.request("/api/settings/me", { label: "Could not load current-user settings" }),
      api.request("/api/households", { label: "Could not load households" }),
    ]);

    const householdId = householdDashboard?.defaultHouseholdId;
    const household = householdDashboard?.households?.find((item) => item.id === householdId);
    if (!householdId || !household) {
      throw new Error("The current user's default personal household could not be found.");
    }
    if (household.kind !== "Personal") {
      throw new Error("The default household is not a personal household; no data was changed.");
    }
    if (!household.canWrite) {
      throw new Error(`The current user cannot write to '${household.name}'.`);
    }
    if (!settings?.userProfileId) {
      throw new Error("The current app user profile could not be resolved.");
    }

    const timeZone = household.timeZone || settings.timeZone;
    const currencyCode = household.currencyCode || settings.currencyCode;
    if (!timeZone || !currencyCode) {
      throw new Error("The personal household must have a currency and timezone before data can be generated.");
    }

    const localNow = getCalendarDate(now, timeZone);
    const periods = [
      shiftMonth(localNow.year, localNow.month, -2),
      shiftMonth(localNow.year, localNow.month, -1),
    ];
    const entries = buildSeedEntries(periods, monthlyIncome);
    const financialSummary = buildFinancialSummary(entries);

    const existingByMonth = await Promise.all(
      periods.map((period) => listMonthTransactions(api, householdId, period.key)),
    );
    const existingSeedTransactions = existingByMonth
      .flat()
      .filter((transaction) =>
        transaction.userProfileId === settings.userProfileId
        && transaction.sourceText?.includes(SEED_MARKER));

    const preview = {
      dryRun: Boolean(options.dryRun),
      household: household.name,
      householdId,
      currencyCode,
      timeZone,
      periods: periods.map((period) => period.key),
      existingSeedTransactionCount: existingSeedTransactions.length,
      plannedTransactionCount: entries.length,
      financialSummary,
      entries,
    };

    console.group("MoneyMentor test-data preview");
    console.table(financialSummary.map((summary) => ({
      period: summary.period,
      transactions: summary.transactionCount,
      income: summary.income,
      consumption: summary.consumption,
      savingsAllocation: summary.savingsAllocation,
      currency: currencyCode,
    })));
    console.info(`Household: ${household.name}`);
    console.info(`Timezone: ${timeZone}`);
    console.info(`Existing generated rows to replace: ${existingSeedTransactions.length}`);
    console.groupEnd();

    if (options.dryRun) return preview;

    const confirmed = browserWindow.confirm(
      `Replace MoneyMentor test data in '${household.name}'?\n\n`
      + `Periods: ${periods.map((period) => period.key).join(" and ")}\n`
      + `Existing generated rows to remove: ${existingSeedTransactions.length}\n`
      + `New rows to create: ${entries.length}\n\n`
      + "Only transactions carrying the MoneyMentor seed marker and owned by your profile will be replaced.",
    );
    if (!confirmed) {
      console.info("MoneyMentor test-data generation cancelled. No data was changed.");
      return { ...preview, cancelled: true };
    }

    const deletedIds = [];
    const newIds = [];

    try {
      for (const transaction of existingSeedTransactions) {
        await api.request(`/api/transactions/${encodeURIComponent(transaction.id)}`, {
          method: "DELETE",
          label: `Could not remove previous seed transaction ${transaction.id}`,
        });
        deletedIds.push(transaction.id);
      }

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const response = await api.request("/api/assistant/messages", {
          method: "POST",
          label: `Could not create seed transaction ${index + 1}/${entries.length}`,
          body: {
            text: entry.sourceText,
            householdId,
            inputMode: "System",
            transactionDate: entry.date,
            currencyCode,
            locale: "en-IN",
          },
        });

        let transaction = response?.transaction;
        if (!transaction) {
          const detail = [...(response?.errors ?? []), response?.assistantMessage]
            .filter(Boolean)
            .join("; ");
          throw new Error(
            `Seed transaction ${index + 1}/${entries.length} was not saved${detail ? `: ${detail}` : "."}`,
          );
        }
        newIds.push(transaction.id);

        if (transaction.categoryName !== entry.categoryName) {
          transaction = await api.request(`/api/transactions/${encodeURIComponent(transaction.id)}`, {
            method: "PATCH",
            label: `Could not normalize category for seed transaction ${index + 1}/${entries.length}`,
            body: { categoryName: entry.categoryName },
          });
        }

        assertCreatedTransaction(transaction, {
          ...entry,
          householdId,
          userProfileId: settings.userProfileId,
          currencyCode,
        }, `Seed transaction ${index + 1}/${entries.length}`);

        if (index < entries.length - 1) {
          await new Promise((resolve) => browserWindow.setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error("Test-data generation failed. Attempting to restore the previous generated data.", error);
      const rollbackFailures = await rollback(api, newIds, deletedIds);
      if (rollbackFailures.length > 0) {
        throw new AggregateError(
          [error, ...rollbackFailures.map((message) => new Error(message))],
          "Test-data generation failed and rollback was incomplete. Review the transaction trash before retrying.",
        );
      }
      throw new Error("Test-data generation failed; previous generated data was restored.", { cause: error });
    }

    const result = {
      ...preview,
      dryRun: false,
      replacedTransactionCount: deletedIds.length,
      createdTransactionCount: newIds.length,
      transactionIds: newIds,
    };

    console.group("MoneyMentor test data generated");
    console.info(`Created ${newIds.length} transactions across ${periods.map((period) => period.key).join(" and ")}.`);
    console.table(financialSummary.map((summary) => ({
      period: summary.period,
      income: summary.income,
      consumption: summary.consumption,
      savingsAllocation: summary.savingsAllocation,
      currency: currencyCode,
    })));
    console.info("Closed-period judgement recalculation has been queued by the transaction service.");
    console.groupEnd();
    return result;
  }

  Object.defineProperty(browserWindow, "generateMoneyMentorTestData", {
    configurable: true,
    enumerable: false,
    value: generateMoneyMentorTestData,
    writable: false,
  });
})(window);
