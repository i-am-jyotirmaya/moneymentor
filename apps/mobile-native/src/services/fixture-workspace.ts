import type { Category, Commitment, FinancialAccount, Goal, GoalDetail, GoalPlanningRun, GoalPlanVersion, HouseholdInvitation, HouseholdSummary, HttpRequest, JudgementReport, JudgementReportObservation, Transaction, UserSettings } from '@spndrr/finance-core';

/** In-memory QA server for screen acceptance, never selected by a production binary. */
export function fixtureWorkspace({ householdId, userId, accounts, categories, transactions, nextId }: {
  householdId: string; userId: string; accounts: FinancialAccount[]; categories: Category[]; transactions: Transaction[]; nextId: () => string;
}) {
  const timestamp = () => new Date().toISOString();
  const settings: UserSettings = { userProfileId: userId, displayName: 'Jyoti', email: 'qa@example.test', currencyCode: 'INR', timeZone: 'Asia/Kolkata', plan: 'Premium', requireMerchantForExpenses: false, defaultTransactionVisibility: 'Private' };
  const households: HouseholdSummary[] = [
    { id: householdId, name: 'Personal', kind: 'Personal', currencyCode: 'INR', timeZone: 'Asia/Kolkata', role: 'Owner', status: 'Active', canWrite: true, memberCount: 1, createdAt: timestamp() },
    { id: '00000000-0000-4000-8000-000000000012', name: 'Family view', kind: 'Family', currencyCode: 'INR', timeZone: 'Asia/Kolkata', role: 'Viewer', status: 'Active', canWrite: false, memberCount: 2, createdAt: timestamp() },
  ];
  const goals: Goal[] = []; const details = new Map<string, GoalDetail>(); const commitments: Commitment[] = [];
  const runs = new Map<string, GoalPlanningRun>(); const invitations: HouseholdInvitation[] = [];
  const insight: JudgementReportObservation = { id: 'fixture-insight', ruleCode: 'QA_CONTEXT', issueKey: 'fixture-context', direction: 'Neutral', severity: 'Info', severityRank: 0, tone: 'Healthy', status: 'Active', title: 'A clearer picture starts here', value: 'Tracked data', message: 'Keep your records up to date to make patterns easier to see.', actionCode: 'Observe', actionParametersJson: '{}', evidenceJson: '{}', resolvedAt: null, expiresAt: '2099-01-01T00:00:00Z', isDismissed: false };
  const ok = (data: unknown, status = 200) => ({ status, data });
  const missing = () => ok({ title: 'Not found' }, 404);
  const invalid = (title: string) => ok({ title }, 400);
  return (request: HttpRequest) => {
    const [path = '', search = ''] = request.path.split('?');
    const params = Object.fromEntries(search.split('&').filter(Boolean).map(part => { const [key = '', value = ''] = part.split('='); return [decodeURIComponent(key), decodeURIComponent(value)]; }));
    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope = String(params.householdId ?? body.householdId ?? householdId);
    const household = households.find(item => item.id === scope);
    if (request.method !== 'GET' && household?.canWrite === false && !path.startsWith('/api/privacy') && path !== '/api/settings/me') return ok({ title: 'Household is view only' }, 403);
    if (path === '/api/settings/me') { if (request.method === 'PATCH') Object.assign(settings, body); return ok(settings); }
    if (path === '/api/households') {
      if (request.method === 'POST') { const item: HouseholdSummary = { ...households[0]!, id: nextId(), name: String(body.name), kind: 'Family' }; households.push(item); return ok(item, 201); }
      return ok({ plan: settings.plan, canUseHouseholds: true, defaultHouseholdId: householdId, households });
    }
    if (path === '/api/households/invitations') return ok(invitations.filter(item => item.email === settings.email));
    const invitationResponse = /^\/api\/households\/invitations\/([^/]+)\/(accept|decline)$/.exec(path);
    if (invitationResponse) { const item = invitations.find(value => value.id === invitationResponse[1]); if (!item) return missing(); item.status = invitationResponse[2] === 'accept' ? 'Accepted' : 'Declined'; item.respondedAt = timestamp(); return ok(item); }
    const householdRoute = /^\/api\/households\/([^/]+)\/(settings|invitations)$/.exec(path);
    if (householdRoute) {
      const selected = households.find(item => item.id === householdRoute[1]); if (!selected) return missing();
      if (householdRoute[2] === 'settings') { Object.assign(selected, body); return ok(selected); }
      if (request.method === 'GET') return ok(invitations.filter(item => item.householdId === selected.id));
      const item: HouseholdInvitation = { id: nextId(), householdId: selected.id, householdName: selected.name, email: String(body.email), role: body.role as HouseholdInvitation['role'], status: 'Pending', invitedByDisplayName: 'Jyoti', createdAt: timestamp(), expiresAt: '2099-01-01T00:00:00Z', respondedAt: null, deliveryStatus: 'Sent', deliveryAttemptCount: 1, sentAt: timestamp(), lastDeliveryError: null };
      invitations.push(item); return ok(item, 201);
    }
    if (path === '/api/categories' && request.method === 'GET') return household ? ok({ householdId: scope, canWrite: household.canWrite, categories: categories.filter(item => !item.householdId || item.householdId === scope) }) : missing();
    if (path === '/api/categories' && request.method === 'POST') {
      const item: Category = { id: nextId(), householdId: scope, name: String(body.name), type: body.type as Category['type'], classification: body.classification as Category['classification'], parentCategoryId: body.parentCategoryId ? String(body.parentCategoryId) : null, icon: body.icon ? String(body.icon) : null, isHidden: false, isSystemCategory: false, sortOrder: 20000, createdAt: timestamp() }; categories.push(item); return ok(item, 201);
    }
    const categoryRoute = /^\/api\/categories\/([^/]+)$/.exec(path);
    if (categoryRoute) { const index = categories.findIndex(item => item.id === categoryRoute[1]); const item = categories[index]; if (!item) return missing(); if (item.isSystemCategory) return invalid('System categories cannot be changed.'); if (request.method === 'DELETE') { categories.splice(index, 1); return ok(null, 204); } Object.assign(item, body); return ok(item); }
    if (path === '/api/financial-accounts' && request.method === 'GET') return ok(accounts.filter(item => item.householdId === scope));
    if (path === '/api/financial-accounts' || /^\/api\/financial-accounts\/[^/]+$/.test(path)) {
      const existing = path.split('/')[3] ? accounts.find(item => item.id === path.split('/')[3]) : undefined;
      if (request.method === 'PUT' && !existing) return missing();
      const item: FinancialAccount = { ...(existing ?? accounts[0]!), ...body, id: existing?.id ?? nextId(), householdId: scope, ownerUserProfileId: body.shared ? null : userId, currencyCode: household?.currencyCode ?? settings.currencyCode } as FinancialAccount;
      if (existing) Object.assign(existing, item); else accounts.push(item); return ok(item, existing ? 200 : 201);
    }
    if (path === '/api/transactions/trash') return ok({ items: transactions.filter(item => item.householdId === scope && item.deletedAt) });
    const transactionRoute = /^\/api\/transactions\/([^/]+)(\/restore)?$/.exec(path);
    if (transactionRoute) { const item = transactions.find(value => value.id === transactionRoute[1]); if (!item) return missing();
      if (transactionRoute[2]) item.deletedAt = null; else if (request.method === 'DELETE') item.deletedAt = timestamp(); else if (request.method === 'PATCH') { Object.assign(item, body); item.accountName = accounts.find(account => account.id === item.accountId)?.name ?? null; item.categoryName = categories.find(category => category.id === item.categoryId)?.name ?? null; }
      return ok(item);
    }
    if (path === '/api/dashboard/monthly') {
      const month = params.month ?? timestamp().slice(0, 7); const items = transactions.filter(item => item.householdId === scope && !item.deletedAt && item.transactionDate.startsWith(month));
      const total = (type: Transaction['type']) => items.filter(item => item.type === type).reduce((sum, item) => sum + (item.kind === 'Refund' || item.kind === 'Reversal' ? -item.amount : item.amount), 0);
      const income = total('Income'); const spends = total('Expense'); const invested = total('Investment');
      return ok({ month, periodStart: `${month}-01`, periodEnd: `${month}-28`, monthLabel: month, currencyCode: household?.currencyCode ?? 'INR', income, spends, invested, saved: income - spends - invested, savingsRate: income > 0 ? ((income - spends - invested) / income) * 100 : null, investedRate: income > 0 ? invested / income * 100 : null,
        categories: categories.filter(category => items.some(item => item.categoryId === category.id)).map(category => ({ name: category.name, amount: items.filter(item => item.categoryId === category.id).reduce((sum, item) => sum + (item.kind === 'Refund' ? -item.amount : item.amount), 0), budget: null, tone: 'Healthy', note: '' })), judgements: [], insights: [], recentTransactions: items.slice(0, 5) });
    }
    if (path === '/api/goals') {
      if (request.method === 'GET') return ok(goals.filter(item => item.householdId === scope));
      const goal: Goal = { id: nextId(), householdId: scope, userProfileId: body.isShared ? null : userId, createdByUserProfileId: userId, name: String(body.name), goalType: body.goalType as Goal['goalType'], targetAmount: Number(body.targetAmount), currentAmount: 0, targetDate: body.targetDate ? String(body.targetDate) : null, monthlyTarget: body.monthlyTarget ? Number(body.monthlyTarget) : null, priority: body.priority as Goal['priority'], status: 'Active', remainingAmount: Number(body.targetAmount), monthsRemaining: null, requiredMonthlyContribution: null, projectedMonthlyPace: null, projectedCompletionDate: null, achievedAt: null, createdAt: timestamp(), updatedAt: timestamp() };
      goals.push(goal); details.set(goal.id, { goal, plan: null, currentUserConsent: null }); return ok(goal, 201);
    }
    const goalRoute = /^\/api\/goals\/([^/]+)(.*)$/.exec(path);
    if (goalRoute) {
      const detail = details.get(goalRoute[1]!); if (!detail) return missing(); const goal = detail.goal; const suffix = goalRoute[2];
      if (!suffix) { if (request.method === 'PATCH') { Object.assign(goal, body); goal.remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount); } return ok(request.method === 'PATCH' ? goal : detail); }
      if (suffix === '/contributions') { const amount = Number(body.amount); goal.currentAmount += amount; goal.remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount); return ok({ id: nextId(), goalId: goal.id, userProfileId: userId, amount, contributedAt: body.contributedAt, source: 'Manual', transactionId: null, commitmentId: null, createdAt: timestamp() }, 201); }
      if (suffix === '/participant-consent') { if (request.method === 'GET') return ok(detail.currentUserConsent); if (request.method === 'DELETE') { if (detail.currentUserConsent) detail.currentUserConsent.revokedAt = timestamp(); return ok(null, 204); } detail.currentUserConsent = { goalId: goal.id, userProfileId: userId, policyVersion: 'fixture-planning', consentedAt: timestamp(), revokedAt: null }; return ok(detail.currentUserConsent); }
      const version = (): GoalPlanVersion => ({ id: nextId(), versionNumber: (detail.plan?.versions.length ?? 0) + 1, source: suffix?.endsWith('/customizations') ? 'Customized' : 'Generated', sourceVersionId: null, userContext: body.context ? String(body.context) : null, createdAt: timestamp(), options: [{ id: nextId(), pace: (body.pace ?? 'Balanced') as 'Balanced', monthlyContribution: Number(body.monthlyContribution ?? 500), projectedCompletionDate: String(body.targetDate ?? '2027-12-01'), feasibility: 'Feasible', isRecommended: true, title: 'A steady path', explanation: 'A deterministic QA plan based on fixture data.', tradeOffs: ['Set aside money each month.'], assumptions: ['Income stays stable.'], risks: ['Unexpected expenses can change progress.'], milestones: [] }] });
      const addVersion = (item: GoalPlanVersion) => { detail.plan ??= { id: nextId(), status: 'Draft', activeVersionId: null, createdAt: timestamp(), updatedAt: timestamp(), versions: [] }; detail.plan.versions.push(item); };
      if (suffix === '/planning-runs' || suffix?.endsWith('/review-runs')) { const item: GoalPlanningRun = { id: nextId(), goalId: goal.id, runType: suffix.endsWith('/review-runs') ? 'Review' : 'Generate', status: 'Pending', resultVersionId: null, model: 'fixture-only', retryCount: 0, failureCategory: null, error: null, createdAt: timestamp(), startedAt: null, completedAt: null, result: null }; runs.set(item.id, item); return ok(item, 202); }
      if (suffix?.startsWith('/planning-runs/')) { const item = runs.get(suffix.split('/')[2]!); if (!item) return missing(); if (item.status === 'Pending') { const result = version(); addVersion(result); Object.assign(item, { status: 'Succeeded', result, resultVersionId: result.id, completedAt: timestamp() }); } return ok(item); }
      if (suffix?.endsWith('/customizations')) { const item = version(); addVersion(item); return ok(item); }
      if (suffix?.endsWith('/activate')) { const item = detail.plan?.versions.find(value => value.id === suffix.split('/')[2]); if (!item || !detail.plan) return missing(); detail.plan.status = 'Active'; detail.plan.activeVersionId = item.id; return ok(item); }
    }
    if (path === '/api/commitments') {
      if (request.method === 'GET') return ok(commitments.filter(item => item.householdId === scope));
      const item = { ...body, id: nextId(), householdId: scope, userProfileId: body.isShared ? null : userId, categoryId: body.categoryId ?? null, categoryName: categories.find(category => category.id === body.categoryId)?.name ?? null, goalId: body.goalId ?? null, isActive: true, lastMatchedAt: null, lastJudgementAt: null, createdAt: timestamp(), updatedAt: timestamp() } as Commitment; commitments.push(item); return ok(item, 201);
    }
    if (path.startsWith('/api/commitments/')) { const item = commitments.find(value => value.id === path.split('/')[3]); if (!item) return missing(); Object.assign(item, body); return ok(item); }
    if (path === '/api/judgements/active') return ok(insight.isDismissed ? [] : [insight]);
    if (path.endsWith('/dismiss')) { insight.isDismissed = true; return ok(null, 204); }
    if (path.endsWith('/explanations')) return ok({ feedbackId: nextId() });
    if (path === '/api/judgement-reports/history') return ok([]);
    if (path === '/api/judgement-reports') { const report: JudgementReport = { id: 'fixture-report', householdId: scope, userProfileId: userId, scope: (params.scope ?? 'Personal') as 'Personal', cadence: (params.cadence ?? 'Monthly') as 'Monthly', period: params.period ?? timestamp().slice(0, 7), startDate: timestamp().slice(0, 10), endDateExclusive: timestamp().slice(0, 10), timeZone: 'Asia/Kolkata', currencyCode: 'INR', revision: 1, calculationVersion: 'fixture-only', status: 'Calculated', direction: 'InsufficientData', confidence: 'Low', baselinePeriodsUsed: 0, dataQualityFlags: ['InsufficientData'], metrics: [], categories: [], judgements: [], narration: null, narrationStatus: 'NotRequested', isProcessingUpdate: false, calculatedAt: timestamp(), publishedAt: null }; return ok(report); }
    if (path === '/api/privacy/export') return ok({ generatedAt: timestamp(), version: 1, profile: settings, households, transactions, goals, commitments });
    if (path === '/api/privacy/account') return ok(null, 204);
    return undefined;
  };
}
