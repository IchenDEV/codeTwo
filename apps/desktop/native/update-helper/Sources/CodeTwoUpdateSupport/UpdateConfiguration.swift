import Foundation

public struct UpdateConfiguration: Equatable, Sendable {
    public static let codeTwoBundleIdentifier = "dev.codetwo.app"

    public let applicationURL: URL
    public let bundleIdentifier: String
    public let bundleVersion: String
    public let displayVersion: String
    public let feedURL: URL

    public init(
        applicationURL: URL,
        bundleIdentifier: String,
        bundleVersion: String,
        displayVersion: String,
        feedURL: URL
    ) {
        self.applicationURL = applicationURL
        self.bundleIdentifier = bundleIdentifier
        self.bundleVersion = bundleVersion
        self.displayVersion = displayVersion
        self.feedURL = feedURL
    }

    public static func load(applicationPath: String) throws -> UpdateConfiguration {
        let applicationURL = URL(fileURLWithPath: applicationPath).standardizedFileURL
        guard applicationURL.pathExtension == "app" else {
            throw UpdateConfigurationError.notApplicationBundle(applicationURL.path)
        }
        guard let bundle = Bundle(url: applicationURL) else {
            throw UpdateConfigurationError.unreadableBundle(applicationURL.path)
        }
        guard bundle.bundleIdentifier == codeTwoBundleIdentifier else {
            throw UpdateConfigurationError.unexpectedBundleIdentifier(
                bundle.bundleIdentifier ?? "missing"
            )
        }

        let bundleVersion = try requiredString("CFBundleVersion", in: bundle)
        let displayVersion = try requiredString("CFBundleShortVersionString", in: bundle)
        let publicKey = try requiredString("SUPublicEDKey", in: bundle)
        guard
            let publicKeyData = Data(base64Encoded: publicKey),
            publicKeyData.count == 32,
            publicKeyData.base64EncodedString() == publicKey
        else {
            throw UpdateConfigurationError.invalidPublicKey
        }
        guard bundle.object(forInfoDictionaryKey: "SURequireSignedFeed") as? Bool == true else {
            throw UpdateConfigurationError.requiredBoolean("SURequireSignedFeed")
        }
        guard bundle.object(forInfoDictionaryKey: "SUVerifyUpdateBeforeExtraction") as? Bool == true else {
            throw UpdateConfigurationError.requiredBoolean("SUVerifyUpdateBeforeExtraction")
        }

        let feed = try requiredString("SUFeedURL", in: bundle)
        guard let feedURL = URL(string: feed), feedURL.scheme?.lowercased() == "https" else {
            throw UpdateConfigurationError.insecureFeedURL(feed)
        }

        return UpdateConfiguration(
            applicationURL: applicationURL,
            bundleIdentifier: codeTwoBundleIdentifier,
            bundleVersion: bundleVersion,
            displayVersion: displayVersion,
            feedURL: feedURL
        )
    }

    private static func requiredString(_ key: String, in bundle: Bundle) throws -> String {
        guard let value = bundle.object(forInfoDictionaryKey: key) as? String else {
            throw UpdateConfigurationError.missingValue(key)
        }
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw UpdateConfigurationError.emptyValue(key)
        }
        return value
    }
}

public enum UpdateConfigurationError: LocalizedError, Equatable {
    case notApplicationBundle(String)
    case unreadableBundle(String)
    case unexpectedBundleIdentifier(String)
    case missingValue(String)
    case emptyValue(String)
    case requiredBoolean(String)
    case insecureFeedURL(String)
    case invalidPublicKey

    public var errorDescription: String? {
        switch self {
        case .notApplicationBundle(let path):
            return "Update target is not an application bundle: \(path)"
        case .unreadableBundle(let path):
            return "Update target cannot be read as an application bundle: \(path)"
        case .unexpectedBundleIdentifier(let identifier):
            return "Update target has unexpected bundle identifier: \(identifier)"
        case .missingValue(let key):
            return "Update target is missing required Info.plist key \(key)"
        case .emptyValue(let key):
            return "Update target has an empty Info.plist value for \(key)"
        case .requiredBoolean(let key):
            return "Update target must set \(key) to true"
        case .insecureFeedURL(let value):
            return "Update feed must use HTTPS: \(value)"
        case .invalidPublicKey:
            return "SUPublicEDKey must be a base64-encoded 32-byte Ed25519 public key"
        }
    }
}
