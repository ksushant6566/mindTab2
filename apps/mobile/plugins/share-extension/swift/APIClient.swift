import Foundation
import UIKit

enum APIError: Error {
    case noToken
    case noNetwork
    case serverError(Int, String?)
    case encodingError
    case missingID
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
            return try parseCreatedID(from: data)
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
            return try parseCreatedID(from: data)
        }

        let errorMessage = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
        throw APIError.serverError(httpResponse.statusCode, errorMessage)
    }

    /// Save an audio recording from the share extension.
    /// Posts multipart/form-data to POST /saves. The server probes duration and starts processing.
    static func saveAudio(fileURL: URL, token: String) async throws -> String {
        let boundary = UUID().uuidString
        var formData = Data()

        let mimeType = audioMIMEType(for: fileURL)
        let filename = fileURL.lastPathComponent
        let audioData = try Data(contentsOf: fileURL)

        func appendField(_ name: String, _ value: String) {
            formData.append("--\(boundary)\r\n".data(using: .utf8)!)
            formData.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            formData.append(value.data(using: .utf8)!)
            formData.append("\r\n".data(using: .utf8)!)
        }
        appendField("auto_commit", "true")
        appendField("source", "share_extension")

        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        formData.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        formData.append(audioData)
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
            return try parseCreatedID(from: data)
        }

        let errorMessage = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
        throw APIError.serverError(httpResponse.statusCode, errorMessage)
    }

    /// Save a video file from the share extension.
    /// Posts multipart/form-data to POST /saves as an Instagram Reel candidate.
    static func saveVideo(fileURL: URL, sourceURL: String?, token: String) async throws -> String {
        let boundary = UUID().uuidString

        let mimeType = videoMIMEType(for: fileURL)
        let filename = fileURL.lastPathComponent
        let uploadFileURL = try makeVideoMultipartFile(
            fileURL: fileURL,
            sourceURL: sourceURL,
            filename: filename,
            mimeType: mimeType,
            boundary: boundary
        )
        defer { try? FileManager.default.removeItem(at: uploadFileURL) }

        let (data, response) = try await uploadFile(
            path: "/saves",
            method: "POST",
            contentType: "multipart/form-data; boundary=\(boundary)",
            fileURL: uploadFileURL,
            token: token
        )

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0, "Invalid response")
        }

        if httpResponse.statusCode == 201 {
            return try parseCreatedID(from: data)
        }

        let errorMessage = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
        throw APIError.serverError(httpResponse.statusCode, errorMessage)
    }

    private static func audioMIMEType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "m4a", "mp4":  return "audio/mp4"
        case "mp3":         return "audio/mpeg"
        case "wav":         return "audio/wav"
        case "ogg", "oga":  return "audio/ogg"
        case "webm":        return "audio/webm"
        case "flac":        return "audio/flac"
        case "aac":         return "audio/aac"
        default:            return "audio/mp4"
        }
    }

    private static func videoMIMEType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "mov":         return "video/quicktime"
        case "webm":        return "video/webm"
        case "m4v":         return "video/x-m4v"
        case "mp4":         return "video/mp4"
        default:            return "video/mp4"
        }
    }

    // MARK: - Private

    private static func parseCreatedID(from data: Data) throws -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String,
              !id.isEmpty else {
            throw APIError.missingID
        }
        return id
    }

    private static func makeVideoMultipartFile(fileURL: URL, sourceURL: String?, filename: String, mimeType: String, boundary: String) throws -> URL {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("mindtab-video-upload-\(UUID().uuidString).multipart")
        FileManager.default.createFile(atPath: tempURL.path, contents: nil)

        do {
            let output = try FileHandle(forWritingTo: tempURL)
            defer { try? output.close() }

            func write(_ string: String) throws {
                guard let data = string.data(using: .utf8) else {
                    throw APIError.encodingError
                }
                try output.write(contentsOf: data)
            }

            func appendField(_ name: String, _ value: String) throws {
                try write("--\(boundary)\r\n")
                try write("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                try write(value)
                try write("\r\n")
            }

            try appendField("auto_commit", "true")
            try appendField("source", "share_extension")
            if let sourceURL = sourceURL,
               !sourceURL.isEmpty,
               let parsedSourceURL = URL(string: sourceURL),
               let scheme = parsedSourceURL.scheme?.lowercased(),
               scheme == "http" || scheme == "https" {
                try appendField("source_url", sourceURL)
            }

            let escapedFilename = escapeMultipartFilename(filename)
            try write("--\(boundary)\r\n")
            try write("Content-Disposition: form-data; name=\"video\"; filename=\"\(escapedFilename)\"\r\n")
            try write("Content-Type: \(mimeType)\r\n\r\n")

            let input = try FileHandle(forReadingFrom: fileURL)
            defer { try? input.close() }
            while true {
                let chunk = try input.read(upToCount: 1024 * 1024)
                guard let chunk, !chunk.isEmpty else { break }
                try output.write(contentsOf: chunk)
            }

            try write("\r\n--\(boundary)--\r\n")
            return tempURL
        } catch {
            try? FileManager.default.removeItem(at: tempURL)
            throw error
        }
    }

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

    private static func uploadFile(path: String, method: String, contentType: String, fileURL: URL, token: String) async throws -> (Data, URLResponse) {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.encodingError
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("mobile", forHTTPHeaderField: "X-Platform")

        return try await URLSession.shared.upload(for: request, fromFile: fileURL)
    }

    private static func escapeMultipartFilename(_ filename: String) -> String {
        filename
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\r", with: "_")
            .replacingOccurrences(of: "\n", with: "_")
    }
}
