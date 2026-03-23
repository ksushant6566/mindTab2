import Foundation
import UIKit

enum APIError: Error {
    case noToken
    case noNetwork
    case serverError(Int, String?)
    case encodingError
}

struct APIClient {
    // Production URL. In development builds, the config plugin can override this via Info.plist.
    static var baseURL: String {
        Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? "https://api.mindtab.in"
    }

    /// Save a URL with optional pre-extracted content.
    static func saveURL(url: String, content: String?, title: String?, token: String) async throws -> String {
        var body: [String: String] = ["url": url]
        if let content = content, !content.isEmpty {
            body["content"] = content
        }
        if let title = title, !title.isEmpty {
            body["title"] = title
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            throw APIError.encodingError
        }

        let (data, response) = try await makeRequest(
            path: "/saves",
            method: "POST",
            contentType: "application/json",
            body: jsonData,
            token: token
        )

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0, "Invalid response")
        }

        if httpResponse.statusCode == 201 {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let id = json["id"] as? String {
                return id
            }
            return ""
        }

        let errorMessage = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
        throw APIError.serverError(httpResponse.statusCode, errorMessage)
    }

    /// Save an image.
    static func saveImage(imageData: Data, mimeType: String, token: String) async throws -> String {
        let boundary = UUID().uuidString
        var formData = Data()

        let ext = mimeType == "image/png" ? "png" : mimeType == "image/webp" ? "webp" : "jpg"

        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"image\"; filename=\"share.\(ext)\"\r\n".data(using: .utf8)!)
        formData.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        formData.append(imageData)
        formData.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let (data, response) = try await makeRequest(
            path: "/saves",
            method: "POST",
            contentType: "multipart/form-data; boundary=\(boundary)",
            body: formData,
            token: token
        )

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0, "Invalid response")
        }

        if httpResponse.statusCode == 201 {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let id = json["id"] as? String {
                return id
            }
            return ""
        }

        let errorMessage = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
        throw APIError.serverError(httpResponse.statusCode, errorMessage)
    }

    // MARK: - Private

    private static func makeRequest(path: String, method: String, contentType: String, body: Data, token: String) async throws -> (Data, URLResponse) {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.encodingError
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("mobile", forHTTPHeaderField: "X-Platform")
        request.httpBody = body

        return try await URLSession.shared.data(for: request)
    }
}
