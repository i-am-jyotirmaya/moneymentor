import type { FinanceClient } from "../api/client";

export async function registrationIsOpen(client: Pick<FinanceClient, "registration">): Promise<boolean> {
  try { return (await client.registration()).mode === "Open"; }
  catch { return false; } // Fail closed, matching RegistrationLink.
}
