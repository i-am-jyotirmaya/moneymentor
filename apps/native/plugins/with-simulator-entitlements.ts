import plist from "@expo/plist";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IOSConfig, withFinalizedMod, withXcodeProject, type ConfigPlugin } from "expo/config-plugins";

const simulatorEntitlementsFile = "SpndrrSimulator.entitlements";

const withSimulatorEntitlements: ConfigPlugin = config => {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) throw new Error("Set ios.bundleIdentifier to generate simulator entitlements.");
  const applicationIdentifier = `LOCALDEV01.${bundleIdentifier}`;

  config = withXcodeProject(config, mod => {
    const project = mod.modResults;
    const { getApplicationNativeTarget, getBuildConfigurationForListIdAndName, getProjectName } = IOSConfig.XcodeUtils;
    const { target } = getApplicationNativeTarget({ project, projectName: getProjectName(mod.modRequest.projectRoot) });
    const [, debug] = getBuildConfigurationForListIdAndName(project, {
      configurationListId: target.buildConfigurationList,
      buildConfiguration: "Debug",
    });
    debug.buildSettings['"CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]"'] = simulatorEntitlementsFile;
    return mod;
  });

  return withFinalizedMod(config, ["ios", async mod => {
    const { projectRoot, projectName, platformProjectRoot } = mod.modRequest;
    // Copy the app's entitlements after Expo and the other plugins have written them.
    const appEntitlementsPath = IOSConfig.Entitlements.getEntitlementsPath(projectRoot, {
      buildConfiguration: "Debug",
      targetName: projectName,
    });
    const entitlements = appEntitlementsPath
      ? plist.parse(await readFile(appEntitlementsPath, "utf8")) as Record<string, unknown>
      : mod.ios?.entitlements ?? {};
    const existingGroups = entitlements["keychain-access-groups"];
    // SecureStore relies on the app's default access group.
    const keychainAccessGroups = [...new Set([applicationIdentifier, ...(Array.isArray(existingGroups) ? existingGroups : [])])];
    await writeFile(join(platformProjectRoot, simulatorEntitlementsFile), plist.build({
      ...entitlements,
      "application-identifier": applicationIdentifier,
      "keychain-access-groups": keychainAccessGroups,
    }));
    return mod;
  }]);
};

export default withSimulatorEntitlements;
