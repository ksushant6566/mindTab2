import UIKit
import UniformTypeIdentifiers
import SwiftUI

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            close()
            return
        }

        Task {
            let content = await extractContent(from: extensionItems)
            await showShareView(content: content)
        }
    }

    private func extractContent(from items: [NSExtensionItem]) async -> SharedContent {
        var url: URL?
        var text: String?
        var imageData: Data?
        var imageMIME: String?

        for item in items {
            guard let attachments = item.attachments else { continue }

            for provider in attachments {
                // Try image first
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    if let result = await loadImage(from: provider) {
                        imageData = result.data
                        imageMIME = result.mime
                    }
                }

                // Try URL
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let loadedURL = await loadURL(from: provider) {
                        url = loadedURL
                    }
                }

                // Try text
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let loadedText = await loadText(from: provider) {
                        text = loadedText
                    }
                }
            }
        }

        return SharedContent(url: url, text: text, imageData: imageData, imageMIME: imageMIME)
    }

    private func loadURL(from provider: NSItemProvider) async -> URL? {
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                continuation.resume(returning: item as? URL)
            }
        }
    }

    private func loadText(from provider: NSItemProvider) async -> String? {
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                continuation.resume(returning: item as? String)
            }
        }
    }

    private func loadImage(from provider: NSItemProvider) async -> (data: Data, mime: String)? {
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.image.identifier) { item, _ in
                if let imageURL = item as? URL,
                   let data = try? Data(contentsOf: imageURL) {
                    let mime = imageURL.pathExtension == "png" ? "image/png" : "image/jpeg"
                    continuation.resume(returning: (data, mime))
                } else if let image = item as? UIImage,
                          let data = image.jpegData(compressionQuality: 0.85) {
                    continuation.resume(returning: (data, "image/jpeg"))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    @MainActor
    private func showShareView(content: SharedContent) {
        let shareView = ShareView(content: content) {
            self.close()
        }

        let hostingController = UIHostingController(rootView: shareView)
        hostingController.view.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1) // #0a0a0a

        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        hostingController.didMove(toParent: self)
    }

    func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}

struct SharedContent {
    let url: URL?
    let text: String?
    let imageData: Data?
    let imageMIME: String?

    var hasURL: Bool { url != nil }
    var hasImage: Bool { imageData != nil }
    var isValid: Bool { hasURL || hasImage }

    var displayTitle: String {
        if let host = url?.host {
            return host.replacingOccurrences(of: "www.", with: "")
        }
        return "Shared Content"
    }

    var displaySubtitle: String {
        if let text = text, !text.isEmpty {
            return String(text.prefix(200))
        }
        if let url = url {
            return url.absoluteString
        }
        return "Image"
    }
}
