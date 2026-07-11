"use client";

import { useState } from "react";

export function usePrivacyState() {
  const [isAcceptingConsent, setIsAcceptingConsent] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [isPrivacyWorking, setIsPrivacyWorking] = useState(false);

  return {
    isAcceptingConsent,
    setIsAcceptingConsent,
    deletionPassword,
    setDeletionPassword,
    deletionConfirmation,
    setDeletionConfirmation,
    isPrivacyWorking,
    setIsPrivacyWorking,
  };
}
