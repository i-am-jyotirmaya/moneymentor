"use client";

import { getRegistration } from "@/lib/api";
import { useEffect, useState } from "react";
import { ProgressLink as Link } from "./navigation-progress";

export function RegistrationLink({
  className,
  initialIsOpen,
}: {
  className?: string;
  initialIsOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialIsOpen ?? false);
  useEffect(() => {
    if (initialIsOpen !== undefined) return;
    let active = true;
    getRegistration()
      .then((settings) => {
        if (active) setIsOpen(settings.mode === "Open");
      })
      .catch(() => {
        /* Fail closed: keep the access request link. */
      });
    return () => {
      active = false;
    };
  }, [initialIsOpen]);

  return (
    <Link className={className} href={isOpen ? "/signup" : "/request-access"}>
      {isOpen ? "Create a new account" : "Request MVP access"}
    </Link>
  );
}
