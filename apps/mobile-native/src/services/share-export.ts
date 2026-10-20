import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const exportFile = () => new File(Paths.cache, 'spndrr-private-export.json');
export function clearExportCache() { const file = exportFile(); if (file.exists) file.delete(); }
export async function sharePrivacyExport(load: () => Promise<unknown>) {
  if (!await Sharing.isAvailableAsync()) throw Error('File sharing is unavailable on this device.');
  clearExportCache();
  const value = await load();
  if (!value || typeof value !== 'object') throw Error('The export response could not be verified.');
  const file = exportFile();
  try {
    file.create({ overwrite: true }); file.write(JSON.stringify(value, null, 2));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Spndrr export', UTI: 'public.json' });
    // Android recipients may read after the sheet closes. Retain the sandbox cache until
    // explicit removal, next export, signout or next cold start rather than racing their read.
  } catch (error) { clearExportCache(); throw error; }
}
