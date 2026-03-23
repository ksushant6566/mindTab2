import Foundation
import Security

struct KeychainHelper {
    static let appGroup = "group.in.mindtab.app"
    static let accessTokenKey = "mindtab_access_token"
    static let refreshTokenKey = "mindtab_refresh_token"

    static func getAccessToken() -> String? {
        return get(key: accessTokenKey)
    }

    static func getRefreshToken() -> String? {
        return get(key: refreshTokenKey)
    }

    /// Force-refresh the access token using the stored refresh token.
    static func refreshAndGetToken(apiBaseURL: String) async -> String? {
        guard let refreshToken = getRefreshToken() else { return nil }
        return await refreshAccessToken(apiBaseURL: apiBaseURL, refreshToken: refreshToken)
    }

    private static func refreshAccessToken(apiBaseURL: String, refreshToken: String) async -> String? {
        guard let url = URL(string: "\(apiBaseURL)/auth/refresh") else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("mobile", forHTTPHeaderField: "X-Platform")

        let body = ["refreshToken": refreshToken]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let newAccessToken = json["accessToken"],
              let newRefreshToken = json["refreshToken"] else {
            return nil
        }

        // Update tokens in shared keychain
        set(key: accessTokenKey, value: newAccessToken)
        set(key: refreshTokenKey, value: newRefreshToken)

        return newAccessToken
    }

    // MARK: - Keychain Operations

    private static func get(key: String) -> String? {
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

    private static func set(key: String, value: String) {
        let data = Data(value.utf8)

        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroup,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroup,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(addQuery as CFDictionary, nil)
    }
}
