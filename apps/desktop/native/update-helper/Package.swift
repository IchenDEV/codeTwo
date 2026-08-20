// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CodeTwoUpdateHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CodeTwoUpdateHelper", targets: ["CodeTwoUpdateHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.6"),
    ],
    targets: [
        .target(name: "CodeTwoUpdateSupport"),
        .executableTarget(
            name: "CodeTwoUpdateHelper",
            dependencies: [
                "CodeTwoUpdateSupport",
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-rpath",
                    "-Xlinker", "@executable_path/../Frameworks",
                ]),
            ]
        ),
        .testTarget(
            name: "CodeTwoUpdateSupportTests",
            dependencies: ["CodeTwoUpdateSupport"]
        ),
    ]
)
