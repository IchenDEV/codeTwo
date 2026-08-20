import CodeTwoUpdateSupport
import Foundation
import Testing

@Test func rejectsNonApplicationPath() {
    #expect(throws: UpdateConfigurationError.notApplicationBundle("/tmp/C2")) {
        try UpdateConfiguration.load(applicationPath: "/tmp/C2")
    }
}

@Test func exposesStableBundleIdentity() {
    #expect(UpdateConfiguration.codeTwoBundleIdentifier == "dev.codetwo.app")
}

@Test func acceptsOnlyCompleteFailClosedSparkleConfiguration() throws {
    let application = try makeApplicationBundle()
    let configuration = try UpdateConfiguration.load(applicationPath: application.path)

    #expect(configuration.bundleIdentifier == "dev.codetwo.app")
    #expect(configuration.bundleVersion == "1.2.3")
    #expect(configuration.feedURL == URL(string: "https://updates.example.test/appcast.xml"))
}

@Test func rejectsAnInvalidEd25519PublicKey() throws {
    let application = try makeApplicationBundle(overrides: ["SUPublicEDKey": "not-a-key"])
    #expect(throws: UpdateConfigurationError.invalidPublicKey) {
        try UpdateConfiguration.load(applicationPath: application.path)
    }
}

@Test func rejectsAnInsecureFeed() throws {
    let application = try makeApplicationBundle(overrides: [
        "SUFeedURL": "http://updates.example.test/appcast.xml",
    ])
    #expect(throws: UpdateConfigurationError.insecureFeedURL("http://updates.example.test/appcast.xml")) {
        try UpdateConfiguration.load(applicationPath: application.path)
    }
}

private func makeApplicationBundle(overrides: [String: Any] = [:]) throws -> URL {
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
        .appendingPathComponent("C2.app", isDirectory: true)
    let contents = root.appendingPathComponent("Contents", isDirectory: true)
    try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)

    var plist: [String: Any] = [
        "CFBundleIdentifier": "dev.codetwo.app",
        "CFBundleVersion": "1.2.3",
        "CFBundleShortVersionString": "1.2.3",
        "CFBundlePackageType": "APPL",
        "SUFeedURL": "https://updates.example.test/appcast.xml",
        "SUPublicEDKey": Data(repeating: 7, count: 32).base64EncodedString(),
        "SURequireSignedFeed": true,
        "SUVerifyUpdateBeforeExtraction": true,
    ]
    for (key, value) in overrides {
        plist[key] = value
    }
    let data = try PropertyListSerialization.data(
        fromPropertyList: plist,
        format: .xml,
        options: 0
    )
    try data.write(to: contents.appendingPathComponent("Info.plist"))
    return root
}
