import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  AndroidConfig, XML, withAndroidColors, withAndroidColorsNight, withAndroidManifest,
  withAndroidStyles, withFinalizedMod, type ConfigPlugin,
} from 'expo/config-plugins';

export function withoutFontScale(value = '') {
  return value.split('|').filter(entry => entry && entry !== 'fontScale').join('|');
}
export function withKeyboardResize(value = '') {
  const values = value.split('|').filter(item => item && !item.startsWith('adjust'));
  return [...new Set([...values, 'adjustResize'])].join('|');
}
const lightColors = { sp_bg: '#F4F6FB', sp_mark: '#2944D4', sp_mark_slice: '#0E1220', ic_launcher_background: '#0E1433' };
const nightColors = { sp_bg: '#0A0D18', sp_mark: '#4A63EC', sp_mark_slice: '#FFFFFF' };
const appTheme = AndroidConfig.Styles.getAppThemeGroup();
const barFlags = ['android:windowLightStatusBar', 'android:windowLightNavigationBar'];

function setStyle(xml: AndroidConfig.Resources.ResourceXML, parent: { name: string }, name: string, value: string) {
  AndroidConfig.Styles.assignStylesValue(xml, { add: true, parent, name, value });
}

const withPlatform: ConfigPlugin = config => {
  config = withAndroidColors(config, mod => {
    for (const [name, value] of Object.entries(lightColors)) {
      AndroidConfig.Colors.assignColorValue(mod.modResults, { name, value });
    }
    return mod;
  });
  config = withAndroidColorsNight(config, mod => {
    for (const [name, value] of Object.entries(nightColors)) {
      AndroidConfig.Colors.assignColorValue(mod.modResults, { name, value });
    }
    return mod;
  });
  config = withAndroidStyles(config, mod => {
    for (const name of ['android:windowBackground', 'android:statusBarColor', 'android:navigationBarColor']) {
      setStyle(mod.modResults, appTheme, name, '@color/sp_bg');
    }
    for (const name of barFlags) setStyle(mod.modResults, appTheme, name, 'true');
    setStyle(mod.modResults, { name: 'Theme.App.SplashScreen' }, 'windowSplashScreenAnimatedIcon', '@drawable/spndrr_mark_splash');
    return mod;
  });
  config = withFinalizedMod(config, ['android', async mod => {
    const { projectRoot, platformProjectRoot } = mod.modRequest;
    const { getProjectStylesXMLPathAsync, getStyleParent, readStylesXMLAsync } = AndroidConfig.Styles;
    const lightPath = await getProjectStylesXMLPathAsync(projectRoot);
    const lightStyles = await readStylesXMLAsync({ path: lightPath });
    const theme = getStyleParent(lightStyles, appTheme);
    if (!theme) throw new Error('AppTheme is missing from Android styles');

    // A qualified style replaces the default style, so keep all generated AppTheme items.
    const nightPath = join(dirname(dirname(lightPath)), 'values-night', 'styles.xml');
    const nightStyles = await readStylesXMLAsync({ path: nightPath, fallback: '<resources />' });
    nightStyles.resources.style = [
      ...(nightStyles.resources.style ?? []).filter(style => style.$.name !== appTheme.name),
      theme,
    ];
    if (lightStyles.resources.$?.['xmlns:tools']) {
      nightStyles.resources.$ = { ...nightStyles.resources.$, 'xmlns:tools': lightStyles.resources.$['xmlns:tools'] };
    }
    for (const name of barFlags) setStyle(nightStyles, appTheme, name, 'false');
    await mkdir(dirname(nightPath), { recursive: true });
    await XML.writeXMLAsync({ path: nightPath, xml: nightStyles });

    const res = join(platformProjectRoot, 'app', 'src', 'main', 'res');
    const drawable = join(res, 'drawable');
    const vectors = join(projectRoot, '..', '..', 'assets', 'branding', 'revamp', 'android');
    await mkdir(drawable, { recursive: true });
    await Promise.all(['ic_launcher_foreground.xml', 'ic_launcher_monochrome.xml', 'spndrr_mark_splash.xml']
      .map(name => copyFile(join(vectors, name), join(drawable, name))));

    // Expo generates these XML files with mipmap PNG references during prebuild.
    await Promise.all(['ic_launcher.xml', 'ic_launcher_round.xml'].map(async name => {
      const path = join(res, 'mipmap-anydpi-v26', name);
      const xml = await readFile(path, 'utf8');
      await writeFile(path, xml
        .replace('@color/iconBackground', '@color/ic_launcher_background')
        .replace('@mipmap/ic_launcher_foreground', '@drawable/ic_launcher_foreground')
        .replace('@mipmap/ic_launcher_monochrome', '@drawable/ic_launcher_monochrome'));
    }));
    return mod;
  }]);
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
