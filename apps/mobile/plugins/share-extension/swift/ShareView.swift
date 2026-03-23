import SwiftUI

struct ShareView: View {
    let content: SharedContent
    let onDismiss: () -> Void

    @State private var state: ShareState = .loading
    @State private var errorMessage: String?

    enum ShareState {
        case loading
        case preview
        case saving
        case success
        case error
    }

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.04) // #0a0a0a
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Nav bar
                HStack {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Color(white: 0.98))
                    }

                    Spacer()

                    if state == .success {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(white: 0.98))
                    } else {
                        Button(action: save) {
                            if state == .saving {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: Color(white: 0.04)))
                                    .scaleEffect(0.8)
                                    .frame(width: 60, height: 32)
                                    .background(Color(white: 0.98))
                                    .cornerRadius(16)
                            } else {
                                Text("Save")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(Color(red: 0.04, green: 0.04, blue: 0.04))
                                    .frame(width: 60, height: 32)
                                    .background(Color(white: 0.98))
                                    .cornerRadius(16)
                            }
                        }
                        .disabled(state != .preview)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)

                Divider()
                    .background(Color(white: 0.15))

                // Content area
                switch state {
                case .loading:
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(white: 0.98)))
                    Spacer()

                case .preview, .saving, .success:
                    previewCard
                        .padding(20)
                    Spacer()

                case .error:
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 32))
                            .foregroundColor(Color(white: 0.6))
                        Text(errorMessage ?? "Something went wrong")
                            .font(.system(size: 14))
                            .foregroundColor(Color(white: 0.88))
                            .multilineTextAlignment(.center)
                    }
                    .padding(20)
                    Spacer()
                }

                // Footer
                Divider()
                    .background(Color(white: 0.15))
                Text("Saving to Vault")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
                    .padding(.vertical, 12)
            }
        }
        .onAppear {
            validateContent()
        }
    }

    private var previewCard: some View {
        HStack(alignment: .top, spacing: 14) {
            // Thumbnail
            if let imageData = content.imageData, let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 56, height: 56)
                    .cornerRadius(8)
                    .clipped()
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(white: 0.12))
                    .frame(width: 56, height: 56)
                    .overlay(
                        Image(systemName: "link")
                            .font(.system(size: 20))
                            .foregroundColor(Color(white: 0.4))
                    )
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(content.displayTitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(white: 0.98))
                    .lineLimit(1)

                Text(content.displaySubtitle)
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.6))
                    .lineLimit(3)
            }

            Spacer()
        }
        .padding(14)
        .background(Color(white: 0.08))
        .cornerRadius(12)
    }

    private func validateContent() {
        if !content.isValid {
            state = .error
            errorMessage = "Cannot save text-only content. Share a link or image instead."
            return
        }
        state = .preview
    }

    private func performSave(token: String) async throws {
        if let imageData = content.imageData, let imageMIME = content.imageMIME {
            _ = try await APIClient.saveImage(imageData: imageData, mimeType: imageMIME, token: token)
        } else if let url = content.url {
            _ = try await APIClient.saveURL(
                url: url.absoluteString,
                content: content.text,
                title: nil,
                token: token
            )
        }
    }

    private func save() {
        guard state == .preview else { return }
        state = .saving

        Task {
            do {
                guard var token = KeychainHelper.getAccessToken() ?? (await KeychainHelper.refreshAndGetToken(apiBaseURL: APIClient.baseURL)) else {
                    await MainActor.run {
                        state = .error
                        errorMessage = "Please open MindTab and log in first."
                    }
                    return
                }

                do {
                    try await performSave(token: token)
                } catch APIError.serverError(401, _) {
                    // Token expired — refresh and retry once
                    guard let refreshedToken = await KeychainHelper.refreshAndGetToken(apiBaseURL: APIClient.baseURL) else {
                        await MainActor.run {
                            state = .error
                            errorMessage = "Please open MindTab and log in first."
                        }
                        return
                    }
                    token = refreshedToken
                    try await performSave(token: token)
                }

                await MainActor.run {
                    state = .success
                }

                try await Task.sleep(nanoseconds: 800_000_000) // 0.8s
                await MainActor.run {
                    onDismiss()
                }
            } catch {
                await MainActor.run {
                    state = .error
                    if let apiError = error as? APIError {
                        switch apiError {
                        case .noToken:
                            errorMessage = "Please open MindTab and log in first."
                        case .noNetwork:
                            errorMessage = "No internet connection. Please try again."
                        case .serverError(_, let msg):
                            errorMessage = msg ?? "Failed to save. Please try again."
                        case .encodingError:
                            errorMessage = "Failed to process content."
                        }
                    } else if (error as NSError).code == NSURLErrorNotConnectedToInternet {
                        errorMessage = "No internet connection. Please try again."
                    } else {
                        errorMessage = "Failed to save. Please try again."
                    }
                }
            }
        }
    }
}
