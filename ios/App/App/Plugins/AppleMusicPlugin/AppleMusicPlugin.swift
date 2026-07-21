import Foundation
import Capacitor
import MusicKit
import StoreKit

/**
 * Thin Apple Music bridge for MomentAI.
 * Uses MusicKit for authorization + user token, then REST for playlist create/add.
 *
 * Requires NSAppleMusicUsageDescription and a MusicKit-enabled App ID.
 * Developer token comes from GET /api/apple/dev-token (never bundle the private key).
 */
@objc(AppleMusicPlugin)
public class AppleMusicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleMusicPlugin"
    public let jsName = "AppleMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createPlaylist", returnType: CAPPluginReturnPromise)
    ]

    private var developerToken: String?

    @objc func authorize(_ call: CAPPluginCall) {
        self.developerToken = call.getString("developerToken")

        Task {
            let status = await MusicAuthorization.request()
            guard status == .authorized else {
                call.reject("Apple Music authorization denied", "DENIED")
                return
            }
            call.resolve(["authorized": true])
        }
    }

    @objc func createPlaylist(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), !name.isEmpty else {
            call.reject("Playlist name is required", "BAD_ARGS")
            return
        }
        let description = call.getString("description") ?? ""
        let catalogIds = call.getArray("catalogIds", String.self) ?? []
        let developerToken = self.developerToken ?? call.getString("developerToken")

        guard let developerToken, !developerToken.isEmpty else {
            call.reject("Missing Apple Music developer token", "NO_DEV_TOKEN")
            return
        }

        Task {
            do {
                let status = await MusicAuthorization.request()
                guard status == .authorized else {
                    call.reject("Apple Music authorization required", "DENIED")
                    return
                }

                let userToken = try await self.fetchUserToken(developerToken: developerToken)
                let playlistId = try await self.createLibraryPlaylist(
                    name: name,
                    description: description,
                    catalogIds: catalogIds,
                    developerToken: developerToken,
                    userToken: userToken
                )

                call.resolve([
                    "playlistId": playlistId as Any,
                    "addedCount": catalogIds.count
                ])
            } catch {
                call.reject(error.localizedDescription, "CREATE_FAILED")
            }
        }
    }

    private func fetchUserToken(developerToken: String) async throws -> String {
        // SKCloudServiceController provides the Music User Token for Media API writes.
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            SKCloudServiceController().requestUserToken(forDeveloperToken: developerToken) { token, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let token, !token.isEmpty else {
                    continuation.resume(throwing: NSError(
                        domain: "MomentAI.AppleMusic",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "Empty Music User Token"]
                    ))
                    return
                }
                continuation.resume(returning: token)
            }
        }
    }

    private func createLibraryPlaylist(
        name: String,
        description: String,
        catalogIds: [String],
        developerToken: String,
        userToken: String
    ) async throws -> String? {
        var body: [String: Any] = [
            "attributes": [
                "name": name,
                "description": description
            ]
        ]

        if !catalogIds.isEmpty {
            body["relationships"] = [
                "tracks": [
                    "data": catalogIds.map { ["id": $0, "type": "songs"] }
                ]
            ]
        }

        let url = URL(string: "https://api.music.apple.com/v1/me/library/playlists")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(developerToken)", forHTTPHeaderField: "Authorization")
        request.setValue(userToken, forHTTPHeaderField: "Music-User-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "MomentAI.AppleMusic", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Invalid response creating playlist"
            ])
        }
        guard (200...299).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "MomentAI.AppleMusic", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: "Apple Music create failed (\(http.statusCode)): \(detail)"
            ])
        }

        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let items = json["data"] as? [[String: Any]],
           let id = items.first?["id"] as? String {
            return id
        }
        return nil
    }
}
