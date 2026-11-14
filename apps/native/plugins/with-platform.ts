import { AndroidConfig, withAndroidManifest, withMainActivity, type ConfigPlugin } from 'expo/config-plugins';

export function withFontScale(value = '') {
  return [...new Set([...value.split('|').filter(Boolean), 'fontScale'])].join('|');
}
export function forceLightActivity(source: string) {
  const statement = 'androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO)';
  if (source.includes(statement)) return source;
  if (!source.includes('super.onCreate(')) throw new Error('MainActivity onCreate not found');
  return source.replace(/super\.onCreate\(/, `${statement};\n    super.onCreate(`);
}
const withPlatform: ConfigPlugin = config => {
  config = withAndroidManifest(config, mod => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$['android:configChanges'] = withFontScale(activity.$['android:configChanges']);
    return mod;
  });
  return withMainActivity(config, mod => {
    mod.modResults.contents = forceLightActivity(mod.modResults.contents);
    return mod;
  });
};
export default withPlatform;
