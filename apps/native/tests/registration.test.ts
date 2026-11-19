import { registrationIsOpen } from "../src/auth/registration";

test.each(["Open", "RequestOnly"] as const)("registration %s", async mode => {
  expect(await registrationIsOpen({ registration: async () => ({ mode }) })).toBe(mode === "Open");
});
test("registration link fails closed when availability cannot be loaded", async () => {
  expect(await registrationIsOpen({ registration: async () => { throw new Error("offline"); } })).toBe(false);
});
