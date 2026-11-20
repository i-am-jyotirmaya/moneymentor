import ExpoModulesCore

public final class SpndrrDeviceCredentialModule: Module {
    public func definition() -> ModuleDefinition {
        Name("SpndrrDeviceCredential")
        AsyncFunction("authenticate") { (promise: Promise) in
            DeviceCredentialAuthenticator.authenticate { result in promise.resolve(result) }
        }
    }
}
