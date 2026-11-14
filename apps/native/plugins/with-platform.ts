import { AndroidConfig, withAndroidManifest, withMainActivity, withAndroidStyles, type ConfigPlugin } from 'expo/config-plugins';

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
  config = withAndroidStyles(config, mod => {
    const theme = mod.modResults.resources.style?.find(style => style.$.name === 'AppTheme');
    if (theme) {
      const values = { 'android:windowBackground': '#F3F5F9', 'android:statusBarColor': '#F3F5F9', 'android:navigationBarColor': '#F3F5F9', 'android:windowLightStatusBar': 'true', 'android:windowLightNavigationBar': 'true' };
      theme.item = (theme.item ?? []).filter(item => !(item.$.name in values));
      for (const [name, value] of Object.entries(values)) theme.item.push({ $: { name }, _: value });
    }
    return mod;
  });
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
