import { requireOptionalNativeModule } from "expo";

type NativePasskeys = {
  isSupported(): boolean;
  create(options: string): Promise<string | null>;
  get(options: string): Promise<string | null>;
};

const passkeys = requireOptionalNativeModule<NativePasskeys>("SpndrrPasskeys");

export function supportsPasskeys() {
  return passkeys?.isSupported() ?? false;
}

export async function getPasskeyCredential(operation: "create" | "get", publicKey: unknown) {
  if (!passkeys?.isSupported()) throw new Error("Passkeys are unavailable on this device.");
  let result: string | null;
  try {
    result = await passkeys[operation](JSON.stringify(publicKey));
  } catch {
    throw new Error(operation === "get"
      ? "No passkey could sign you in. Try again or use your password."
      : "This device could not create a passkey. Check your password manager and try again.");
  }
  if (result === null) return null;
  return { clientExtensionResults: {}, ...JSON.parse(result) as Record<string, unknown> };
}
