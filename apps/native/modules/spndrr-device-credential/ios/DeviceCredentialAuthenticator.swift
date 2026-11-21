import Foundation
import LocalAuthentication
import Security

// A Keychain access control can require the device passcode without attempting Face ID or Touch ID.
enum DeviceCredentialAuthenticator {
    static func authenticate(completion: @escaping (String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let context = LAContext()
            guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil),
                  let access = SecAccessControlCreateWithFlags(
                    nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .devicePasscode, nil
                  ) else {
                completion("unavailable")
                return
            }
            context.localizedReason = "Unlock Spndrr"
            let item: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "com.spndrr.device-credential",
                kSecAttrAccount as String: "unlock"
            ]
            // The value is a marker. Keychain authenticates access to it and retains no app credential.
            var attributes = item
            attributes[kSecAttrAccessControl as String] = access
            attributes[kSecValueData as String] = Data([1])
            let added = SecItemAdd(attributes as CFDictionary, nil)
            guard added == errSecSuccess || added == errSecDuplicateItem else {
                completion("failed")
                return
            }

            var query = item
            query[kSecReturnData as String] = true
            query[kSecUseAuthenticationContext as String] = context
            var marker: CFTypeRef?
            switch SecItemCopyMatching(query as CFDictionary, &marker) {
            case errSecSuccess: completion("success")
            case errSecUserCanceled: completion("cancelled")
            default: completion("failed")
            }
        }
    }
}
