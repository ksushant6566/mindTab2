import ExpoModulesCore
import Security

public class SharedKeychainModule: Module {
    public func definition() -> ModuleDefinition {
        Name("SharedKeychain")

        AsyncFunction("setItem") { (appGroup: String, key: String, value: String) in
            try self.keychainSet(appGroup: appGroup, key: key, value: value)
        }

        AsyncFunction("getItem") { (appGroup: String, key: String) -> String? in
            return self.keychainGet(appGroup: appGroup, key: key)
        }

        AsyncFunction("removeItem") { (appGroup: String, key: String) in
            self.keychainRemove(appGroup: appGroup, key: key)
        }

        AsyncFunction("clear") { (appGroup: String) in
            self.keychainClearAll(appGroup: appGroup)
        }
    }

    private func keychainSet(appGroup: String, key: String, value: String) throws {
        let data = Data(value.utf8)

        // Delete existing item first.
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroup,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item.
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroup,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: "SharedKeychain", code: Int(status), userInfo: [
                NSLocalizedDescriptionKey: "Failed to save to keychain: \(status)"
            ])
        }
    }

    private func keychainGet(appGroup: String, key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func keychainRemove(appGroup: String, key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroup,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func keychainClearAll(appGroup: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccessGroup as String: appGroup,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
