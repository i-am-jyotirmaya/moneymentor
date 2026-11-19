import { authFieldLocks, validateAuthForm } from "../src/auth/validation";

const signup = { mode: "signup", displayName: "Aarav Shah", email: "aarav@example.com", password: "password", accepted: true } as const;

test("pasted email with surrounding spaces passes", () => {
  expect(validateAuthForm({ ...signup, email: "  aarav@example.com \t" })).toBe("");
});

test.each(["email", "displayName"] as const)("whitespace-only %s is required", field => {
  expect(validateAuthForm({ ...signup, [field]: " \t " })).toBe("Please fill out all required fields.");
});

test.each(["missing-at", "a b@example.com", "a@b c", "a@b..c", "a@-b.com", "a@b-.com", "a@b_c"])("invalid email %s is rejected", email => {
  expect(validateAuthForm({ ...signup, email })).toBe("Please enter a valid email address.");
});

test.each(["a@b", "a+b@example.com", "a@sub.example.com"])("HTML-valid email %s passes", email => {
  expect(validateAuthForm({ ...signup, email })).toBe("");
});

test("login skips display name and acceptance", () => {
  expect(validateAuthForm({ ...signup, mode: "login", displayName: "", accepted: false })).toBe("");
});

test("request skips password and acceptance", () => {
  expect(validateAuthForm({ ...signup, mode: "request", password: "", accepted: false })).toBe("");
});

test.each(["login", "signup"] as const)("%s requires password without trimming it", mode => {
  expect(validateAuthForm({ ...signup, mode, password: "" })).toBe("Please fill out all required fields.");
  expect(validateAuthForm({ ...signup, mode, password: " " })).toBe("");
});

test("signup requires acceptance", () => {
  expect(validateAuthForm({ ...signup, accepted: false })).toBe("Please accept the beta privacy policy.");
});

test("invitation locks only email", () => {
  expect(authFieldLocks({ token: "token", name: "Aarav Shah", email: signup.email })).toEqual({ displayName: false, email: true });
});

test("no invitation locks nothing", () => {
  expect(authFieldLocks()).toEqual({ displayName: false, email: false });
});
