import { incomingLinkTarget, invitationToken, mobileLinkTarget, redirectIncomingPath } from "../src/lib/deep-links";

test.each([
  ["https://mvp.spndrr.com/signup/#token=placeholder", "/signup/#token=placeholder"],
  ["spndrr://signup#token=placeholder", "/signup/#token=placeholder"],
  ["spndrr:///signup/#token=hello%2Bworld", "/signup/#token=hello%2Bworld"],
  ["https://mvp.spndrr.com/settings/?ignored=yes", "/settings/"],
  ["https://mvp.spndrr.com/", "/"],
  ["https://mvp.spndrr.com/signup?token=placeholder", "/signup/"],
  ["https://other.test/signup/#token=placeholder", null],
  ["http://mvp.spndrr.com/signup/#token=placeholder", null],
  ["https://user:placeholder@mvp.spndrr.com/signup/#token=placeholder", null],
  ["javascript:alert(1)", null],
  ["/signup/#token=placeholder", null],
  ["spndrr://unknown", null],
  ["invalid", null],
])("mobile target %s", (input, output) => {
  expect(mobileLinkTarget(input, "https://mvp.spndrr.com")).toBe(output);
});
test("accepts only the configured web origin", () => {
  expect(mobileLinkTarget("https://preview.example.test/signup/#token=placeholder", "https://preview.example.test")).toBe("/signup/#token=placeholder");
});
test("invitation form requires a signup fragment token and decodes it for router params", () => {
  expect(invitationToken(" https://mvp.spndrr.com/signup/#token=hello%2Bworld ")).toBe("hello+world");
  expect(invitationToken("spndrr://login#token=placeholder")).toBeNull();
  expect(invitationToken("spndrr://signup#token=")).toBeNull();
  expect(invitationToken("spndrr://signup?token=placeholder")).toBeNull();
});

test.each([
  ['spndrr://signup?token=placeholder', '/(auth)/signup?token=placeholder'],
  ['https://mvp.spndrr.com/signup/#token=hello%2Bworld', '/(auth)/signup?token=hello%2Bworld'],
  ['https://mvp.spndrr.com/signup?token=placeholder', '/(auth)/signup?token=placeholder'],
  ['https://mvp.spndrr.com/signup?token=query#token=fragment', '/(auth)/signup?token=fragment'],
  ['spndrr://settings', '/(tabs)/settings'],
  ['https://other.test/signup#token=placeholder', null],
  ['spndrr://user:placeholder@signup#token=placeholder', null],
  ['spndrr://unknown', null],
  ['spndrr://privacy', null],
])('incoming OS link %s', (input, output) => {
  expect(incomingLinkTarget(input)).toBe(output);
});

test.each([
  ['exp+spndrr://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081', 'exp+spndrr://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'],
  ['https://other.test/signup/#token=placeholder', 'https://other.test/signup/#token=placeholder'],
  ['https://mvp.spndrr.com/signup/#token=hello%2Bworld', '/(auth)/signup?token=hello%2Bworld'],
  ['spndrr://signup?token=placeholder', '/(auth)/signup?token=placeholder'],
])('incoming redirect leaves unknown URLs unchanged: %s', (input, output) => {
  expect(redirectIncomingPath(input)).toBe(output);
});
