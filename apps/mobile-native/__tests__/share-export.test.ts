import * as Sharing from 'expo-sharing';
import { clearExportCache, sharePrivacyExport } from '../src/services/share-export';

const mockFile = { uri: 'file:///cache/spndrr-private-export.json', exists: false, create: jest.fn(), write: jest.fn(), delete: jest.fn() };
jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile), Paths: { cache: 'file:///cache' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks(); mockFile.exists = false;
  mockFile.create.mockImplementation(() => { mockFile.exists = true; }); mockFile.delete.mockImplementation(() => { mockFile.exists = false; }); mockFile.write.mockImplementation(() => undefined);
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true); jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
});
test('unsupported sharing does not fetch or write a sensitive export', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false); const load = jest.fn();
  await expect(sharePrivacyExport(load)).rejects.toThrow('File sharing is unavailable'); expect(load).not.toHaveBeenCalled(); expect(mockFile.write).not.toHaveBeenCalled();
});
test('the native share sheet receives the JSON file and explicit cleanup removes its temporary copy', async () => {
  const data = { profile: { displayName: 'Alice' }, transactions: [{ amount: 40.29 }] };
  await sharePrivacyExport(async () => data);
  expect(JSON.parse(mockFile.write.mock.calls[0]![0])).toEqual(data);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(mockFile.uri, expect.objectContaining({ mimeType: 'application/json' }));
  expect(mockFile.exists).toBe(true); clearExportCache(); expect(mockFile.exists).toBe(false);
});
test('a failed share removes its sensitive temporary copy and invalid exports are never written', async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('Share failed'));
  await expect(sharePrivacyExport(async () => ({ profile: 'fixture' }))).rejects.toThrow('Share failed'); expect(mockFile.exists).toBe(false);
  mockFile.write.mockClear(); await expect(sharePrivacyExport(async () => null)).rejects.toThrow('could not be verified'); expect(mockFile.write).not.toHaveBeenCalled();
});
