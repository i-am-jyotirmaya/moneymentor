"use client";
import type {
  CategoryCatalogResponse,
  Commitment,
  DashboardJudgement,
  Goal,
  GoalDetail,
  GoalPlanPace,
  GoalPlanVersion,
  GoalPlanningRun,
} from "@/lib/api";
import {
  activateGoalPlan,
  createGoal,
  createGoalPlanningRun,
  customizeGoalPlan,
  deleteGoalParticipantConsent,
  getGoal,
  getGoalPlanningRun,
  putGoalParticipantConsent,
  reviewGoalPlan,
} from "@/lib/api";
import { getAuthSessionSnapshot } from "@/lib/auth-session";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceUrl } from "./use-workspace-url";
export type PlanningSectionProps = {
  canWrite: boolean;
  categoryCatalog: CategoryCatalogResponse | null;
  commitments: Commitment[];
  currencyCode: string;
  goals: Goal[];
  householdId: string | null;
  judgements: DashboardJudgement[];
};
export function usePlanningController({
  canWrite,
  categoryCatalog,
  commitments,
  currencyCode,
  goals,
  householdId,
  judgements,
}: PlanningSectionProps) {
  const [createdGoals, setCreatedGoals] = useState<Goal[]>([]);
  const { params, updateQuery } = useWorkspaceUrl();
  const selectedGoalId = params.get("goal") ?? goals[0]?.id ?? null;
  const [goalDetail, setGoalDetail] = useState<GoalDetail | null>(null);
  const [planningRun, setPlanningRun] = useState<GoalPlanningRun | null>(null);
  const [isPlanningWorking, setIsPlanningWorking] = useState(false);
  const [planningNotice, setPlanningNotice] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState({
    name: "",
    goalType: "Saving" as Goal["goalType"],
    targetAmount: "",
    targetDate: "",
    priority: "Medium" as Goal["priority"],
    isShared: false,
  });
  const [planForm, setPlanForm] = useState({
    pace: "" as "" | GoalPlanPace,
    targetDate: "",
    monthlyContribution: "",
  });
  const [customizationContext, setCustomizationContext] = useState("");

  const visibleGoals = useMemo(
    () => [
      ...createdGoals,
      ...goals.filter(
        (goal) => !createdGoals.some((created) => created.id === goal.id),
      ),
    ],
    [createdGoals, goals],
  );

  const accessToken = getAuthSessionSnapshot()?.accessToken;

  const loadGoalDetail = useCallback(
    async (goalId: string) => {
      if (!accessToken) return;
      const detail = await getGoal(accessToken, goalId);
      setGoalDetail(detail);
    },
    [accessToken],
  );

  useEffect(() => {
    if (!selectedGoalId || !accessToken) return;
    let active = true;
    void getGoal(accessToken, selectedGoalId)
      .then((detail) => {
        if (active) setGoalDetail(detail);
      })
      .catch(() => {
        if (active)
          setPlanningNotice(
            "Could not load this goal. Choose another goal or try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [selectedGoalId, accessToken, householdId]);

  useEffect(() => {
    if (
      !planningRun ||
      !accessToken ||
      !["Pending", "Processing"].includes(planningRun.status)
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void getGoalPlanningRun(accessToken, planningRun.goalId, planningRun.id)
        .then(async (nextRun) => {
          setPlanningRun(nextRun);
          if (nextRun.status === "Succeeded") {
            await loadGoalDetail(nextRun.goalId);
            setPlanningNotice("Your plan is ready.");
          } else if (nextRun.status === "Failed") {
            setPlanningNotice(
              nextRun.error ?? "Plan generation failed. You can retry.",
            );
          }
        })
        .catch(() =>
          setPlanningNotice("Could not refresh plan generation status."),
        );
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [accessToken, loadGoalDetail, planningRun]);

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !goalForm.name.trim() || !goalForm.targetAmount) return;
    setIsPlanningWorking(true);
    setPlanningNotice(null);
    try {
      const created = await createGoal(accessToken, {
        householdId: householdId ?? undefined,
        name: goalForm.name.trim(),
        goalType: goalForm.goalType,
        targetAmount: Number(goalForm.targetAmount),
        targetDate: goalForm.targetDate || undefined,
        priority: goalForm.priority,
        isShared: goalForm.isShared,
      });
      setCreatedGoals((current) => [created, ...current]);
      setGoalForm({
        name: "",
        goalType: "Saving",
        targetAmount: "",
        targetDate: "",
        priority: "Medium",
        isShared: false,
      });
      updateQuery({ goal: created.id }, "goal-plan");
      setPlanningNotice("Goal created. Generate a plan when you are ready.");
    } catch (caughtError) {
      setPlanningNotice(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create goal.",
      );
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleGeneratePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedGoalId) return;
    setIsPlanningWorking(true);
    setPlanningNotice(null);
    try {
      const run = await createGoalPlanningRun(accessToken, selectedGoalId, {
        pace: planForm.pace || undefined,
        targetDate: planForm.targetDate || undefined,
        monthlyContribution: planForm.monthlyContribution
          ? Number(planForm.monthlyContribution)
          : undefined,
        locale: "en-IN",
      });
      setPlanningRun(run);
      setPlanningNotice(
        "We are securely preparing your plan in the background.",
      );
    } catch (caughtError) {
      setPlanningNotice(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not start planning.",
      );
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleActivate(version: GoalPlanVersion) {
    if (!accessToken || !selectedGoalId) return;
    setIsPlanningWorking(true);
    try {
      await activateGoalPlan(accessToken, selectedGoalId, version.id);
      await loadGoalDetail(selectedGoalId);
      setPlanningNotice("You are now following this plan.");
    } catch (caughtError) {
      setPlanningNotice(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not follow this plan.",
      );
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleCustomize(version: GoalPlanVersion) {
    if (!accessToken || !selectedGoalId) return;
    const source = version.options[0];
    if (!source) return;
    setIsPlanningWorking(true);
    try {
      const customized = await customizeGoalPlan(
        accessToken,
        selectedGoalId,
        version.id,
        {
          pace: planForm.pace || source.pace,
          targetDate: planForm.targetDate || undefined,
          monthlyContribution: planForm.monthlyContribution
            ? Number(planForm.monthlyContribution)
            : source.monthlyContribution,
          context: customizationContext || undefined,
        },
      );
      await loadGoalDetail(selectedGoalId);
      setPlanningNotice(
        `Customized version ${customized.versionNumber} created.`,
      );
    } catch (caughtError) {
      setPlanningNotice(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not customize plan.",
      );
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleReview(version: GoalPlanVersion) {
    if (!accessToken || !selectedGoalId) return;
    setIsPlanningWorking(true);
    try {
      const run = await reviewGoalPlan(accessToken, selectedGoalId, version.id);
      setPlanningRun(run);
      setPlanningNotice("AI review started.");
    } catch (caughtError) {
      setPlanningNotice(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not start AI review.",
      );
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleConsent() {
    if (!accessToken || !selectedGoalId || !goalDetail) return;
    setIsPlanningWorking(true);
    try {
      if (goalDetail.currentUserConsent?.revokedAt === null) {
        await deleteGoalParticipantConsent(accessToken, selectedGoalId);
      } else {
        await putGoalParticipantConsent(accessToken, selectedGoalId);
      }
      await loadGoalDetail(selectedGoalId);
    } catch (caughtError) {
      setPlanningNotice(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update consent.",
      );
    } finally {
      setIsPlanningWorking(false);
    }
  }

  const visibleGroups = useMemo(() => {
    const categoryById = new Map(
      (categoryCatalog?.categories ?? []).map((category) => [
        category.id,
        category,
      ]),
    );
    return (categoryCatalog?.categories ?? [])
      .filter(
        (category) => category.parentCategoryId === null && !category.isHidden,
      )
      .map((group) => ({
        ...group,
        childCount: (categoryCatalog?.categories ?? []).filter(
          (category) =>
            category.parentCategoryId === group.id && !category.isHidden,
        ).length,
      }))
      .filter((group) => group.childCount > 0 || categoryById.has(group.id))
      .slice(0, 8);
  }, [categoryCatalog]);

  return {
    canWrite,
    commitments,
    currencyCode,
    judgements,
    updateQuery,
    selectedGoalId,
    goalDetail: goalDetail?.goal.id === selectedGoalId ? goalDetail : null,
    planningRun,
    isPlanningWorking,
    planningNotice,
    goalForm,
    setGoalForm,
    planForm,
    setPlanForm,
    customizationContext,
    setCustomizationContext,
    visibleGoals,
    handleCreateGoal,
    handleGeneratePlan,
    handleActivate,
    handleCustomize,
    handleReview,
    handleConsent,
    visibleGroups,
  };
}
