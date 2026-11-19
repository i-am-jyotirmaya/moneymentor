import { AndroidConfig, withAndroidManifest, withAndroidStyles, type ConfigPlugin } from 'expo/config-plugins';

export function withoutFontScale(value = '') {
  return value.split('|').filter(entry => entry && entry !== 'fontScale').join('|');
}
export function withKeyboardResize(value = '') {
  const values = value.split('|').filter(item => item && !item.startsWith('adjust'));
  return [...new Set([...values, 'adjustResize'])].join('|');
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
    activity.$['android:configChanges'] = withoutFontScale(activity.$['android:configChanges']);
    // Preserve state flags but require IME resize for edge-to-edge screens.
    activity.$['android:windowSoftInputMode'] = withKeyboardResize(activity.$['android:windowSoftInputMode']);
    return mod;
  });
  // Night mode follows the system (userInterfaceStyle "automatic"); MainActivity no longer forces light.
  return config;
};
export default withPlatform;
