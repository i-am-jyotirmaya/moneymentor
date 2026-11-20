import AuthenticationServices
import ExpoModulesCore
import UIKit

public final class SpndrrPasskeysModule: Module {
    private var ceremony: Ceremony?

    public func definition() -> ModuleDefinition {
        Name("SpndrrPasskeys")

        Function("isSupported") { true }

        AsyncFunction("create") { (json: String, promise: Promise) throws in
            let options = try JSONDecoder().decode(CreationOptions.self, from: Data(json.utf8))
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rp.id)
            let challenge = try decodeBase64URL(options.challenge)
            let userId = try decodeBase64URL(options.user.id)
            let request: ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest
            if #available(iOS 17.4, *) {
                let clientData = ASPublicKeyCredentialClientData(challenge: challenge, origin: "https://\(options.rp.id)")
                request = provider.createCredentialRegistrationRequest(clientData: clientData, name: options.user.name, userID: userId)
                request.excludedCredentials = try (options.excludeCredentials ?? []).map {
                    ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: try decodeBase64URL($0.id))
                }
            } else {
                request = provider.createCredentialRegistrationRequest(challenge: challenge, name: options.user.name, userID: userId)
            }
            request.displayName = options.user.displayName
            request.userVerificationPreference = .required
            request.attestationPreference = .none
            try self.perform(request, promise)
        }.runOnQueue(.main)

        AsyncFunction("get") { (json: String, promise: Promise) throws in
            let options = try JSONDecoder().decode(AssertionOptions.self, from: Data(json.utf8))
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
            let challenge = try decodeBase64URL(options.challenge)
            let request: ASAuthorizationPlatformPublicKeyCredentialAssertionRequest
            if #available(iOS 17.4, *) {
                let clientData = ASPublicKeyCredentialClientData(challenge: challenge, origin: "https://\(options.rpId)")
                request = provider.createCredentialAssertionRequest(clientData: clientData)
            } else {
                request = provider.createCredentialAssertionRequest(challenge: challenge)
            }
            request.userVerificationPreference = .required
            try self.perform(request, promise)
        }.runOnQueue(.main)
    }

    private func perform(_ request: ASAuthorizationRequest, _ promise: Promise) throws {
        guard ceremony == nil,
              let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .filter({ $0.activationState == .foregroundActive }).compactMap(\.keyWindow).first else {
            throw PasskeyUnavailable()
        }
        let operation = Ceremony(request, window: window, promise: promise) { [weak self] in self?.ceremony = nil }
        ceremony = operation
        operation.start()
    }
}

private struct CreationOptions: Decodable {
    struct RelyingParty: Decodable { let id: String }
    struct User: Decodable {
        let id: String
        let name: String
        let displayName: String
    }
    struct Descriptor: Decodable { let id: String }
    let rp: RelyingParty
    let user: User
    let challenge: String
    let excludeCredentials: [Descriptor]?
}

private struct AssertionOptions: Decodable {
    let rpId: String
    let challenge: String
}

private final class Ceremony: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let controller: ASAuthorizationController
    private let window: UIWindow
    private let promise: Promise
    private let finish: () -> Void

    init(_ request: ASAuthorizationRequest, window: UIWindow, promise: Promise, finish: @escaping () -> Void) {
        controller = ASAuthorizationController(authorizationRequests: [request])
        self.window = window
        self.promise = promise
        self.finish = finish
    }

    func start() {
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { window }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { finish() }
        switch authorization.credential {
        case let registration as ASAuthorizationPlatformPublicKeyCredentialRegistration:
            guard let attestation = registration.rawAttestationObject else {
                promise.reject(PasskeyUnavailable())
                return
            }
            resolve(registration.credentialID, [
                "clientDataJSON": base64URL(registration.rawClientDataJSON),
                "attestationObject": base64URL(attestation)
            ])
        case let assertion as ASAuthorizationPlatformPublicKeyCredentialAssertion:
            resolve(assertion.credentialID, [
                "clientDataJSON": base64URL(assertion.rawClientDataJSON),
                "authenticatorData": base64URL(assertion.rawAuthenticatorData),
                "signature": base64URL(assertion.signature),
                "userHandle": base64URL(assertion.userID)
            ])
        default:
            promise.reject(PasskeyUnavailable())
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { finish() }
        if (error as? ASAuthorizationError)?.code == .canceled { promise.resolve(nil) }
        else { promise.reject(PasskeyUnavailable()) }
    }

    private func resolve(_ id: Data, _ response: [String: String]) {
        let credential: [String: Any] = [
            "id": base64URL(id), "rawId": base64URL(id), "type": "public-key",
            "clientExtensionResults": [String: Any](), "response": response
        ]
        do {
            let json = try JSONSerialization.data(withJSONObject: credential)
            promise.resolve(String(decoding: json, as: UTF8.self))
        } catch {
            promise.reject(PasskeyUnavailable())
        }
    }
}

private final class PasskeyUnavailable: Exception {
    override var reason: String { "The device could not complete the passkey request." }
}

private func base64URL(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}

private func decodeBase64URL(_ value: String) throws -> Data {
    let base = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    let padded = base + String(repeating: "=", count: (4 - base.count % 4) % 4)
    guard let data = Data(base64Encoded: padded) else { throw PasskeyUnavailable() }
    return data
}
