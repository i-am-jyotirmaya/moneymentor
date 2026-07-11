"use client";

import { useState } from "react";
import type {
  HouseholdDashboard,
  HouseholdInvitation,
  HouseholdRole,
} from "@/lib/api";

export function useHouseholdScopeState() {
  const [households, setHouseholds] = useState<HouseholdDashboard | null>(null);
  const [householdInvitations, setHouseholdInvitations] = useState<HouseholdInvitation[]>([]);
  const [sentHouseholdInvitations, setSentHouseholdInvitations] = useState<HouseholdInvitation[]>([]);
  const [householdNotice, setHouseholdNotice] = useState<string | null>(null);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<HouseholdRole>("Member");
  const [isSavingHousehold, setIsSavingHousehold] = useState(false);

  return {
    households,
    setHouseholds,
    householdInvitations,
    setHouseholdInvitations,
    sentHouseholdInvitations,
    setSentHouseholdInvitations,
    householdNotice,
    setHouseholdNotice,
    selectedHouseholdId,
    setSelectedHouseholdId,
    householdName,
    setHouseholdName,
    memberEmail,
    setMemberEmail,
    memberRole,
    setMemberRole,
    isSavingHousehold,
    setIsSavingHousehold,
  };
}
