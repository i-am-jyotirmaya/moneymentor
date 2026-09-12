"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRegistration } from "@/lib/api";

export function RegistrationLink({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    getRegistration().then(settings => {
      if (active) setIsOpen(settings.mode === "Open");
    }).catch(() => { /* Fail closed: keep the access request link. */ });
    return () => { active = false; };
  }, []);

  return <Link className={className} href={isOpen ? "/signup" : "/request-access"}>
    {isOpen ? "Create a new account" : "Request MVP access"}
  </Link>;
}
