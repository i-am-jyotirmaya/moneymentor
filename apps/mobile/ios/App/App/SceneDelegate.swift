import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var privacyCover: UIView?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SpndrrBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        guard let window, privacyCover == nil else { return }
        let cover = UIView(frame: window.bounds)
        cover.backgroundColor = .systemBackground
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

final class SpndrrBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(DeviceCredentialPlugin())
    }
}

@objc(DeviceCredentialPlugin)
final class DeviceCredentialPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "DeviceCredentialPlugin"
    let jsName = "SpndrrDeviceCredential"
    let pluginMethods = [CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)]

    @objc func authenticate(_ call: CAPPluginCall) {
        DeviceCredentialAuthenticator.authenticate { status in call.resolve(["status": status]) }
    }
}
