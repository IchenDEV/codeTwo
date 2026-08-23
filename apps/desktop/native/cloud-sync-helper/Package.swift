// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CodeTwoCloudSyncHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CodeTwoCloudSyncHelper", targets: ["CodeTwoCloudSyncHelper"]),
    ],
    targets: [
        .executableTarget(
            name: "CodeTwoCloudSyncHelper",
            linkerSettings: [
                .linkedFramework("CloudKit"),
                .linkedFramework("Security"),
            ]
        ),
    ]
)
