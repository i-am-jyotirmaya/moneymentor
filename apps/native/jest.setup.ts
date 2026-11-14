jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }),
  };
});
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "https://api.spndrr.example" } } },
}));
