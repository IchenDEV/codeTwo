import AppKit
import CodeTwoUpdateSupport
import Foundation
import Sparkle

private enum Command: String {
    case status
    case check
    case probe
}

private struct Invocation {
    let command: Command
    let applicationPath: String

    static func parse(_ arguments: [String]) throws -> Invocation {
        guard let commandValue = arguments.first, let command = Command(rawValue: commandValue) else {
            throw InvocationError.usage
        }
        guard arguments.count == 3, arguments[1] == "--application" else {
            throw InvocationError.usage
        }
        return Invocation(command: command, applicationPath: arguments[2])
    }
}

private enum InvocationError: LocalizedError {
    case usage

    var errorDescription: String? {
        "Usage: CodeTwoUpdateHelper <status|check|probe> --application /path/to/C2.app"
    }
}

private struct HelperEvent: Encodable {
    let state: String
    var version: String? = nil
    var displayVersion: String? = nil
    var message: String? = nil
}

private func emit(_ event: HelperEvent) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(event), let line = String(data: data, encoding: .utf8) else {
        return
    }
    FileHandle.standardOutput.write(Data("\(line)\n".utf8))
}

@MainActor
private final class UpdateDriver: NSObject, SPUUpdaterDelegate {
    private let bundle: Bundle
    private let command: Command
    private lazy var userDriver = SPUStandardUserDriver(hostBundle: bundle, delegate: nil)
    private lazy var updater = SPUUpdater(
        hostBundle: bundle,
        applicationBundle: bundle,
        userDriver: userDriver,
        delegate: self
    )

    init(configuration: UpdateConfiguration, command: Command) throws {
        guard let bundle = Bundle(url: configuration.applicationURL) else {
            throw UpdateConfigurationError.unreadableBundle(configuration.applicationURL.path)
        }
        self.bundle = bundle
        self.command = command
        super.init()
    }

    func run() throws {
        try updater.start()

        emit(HelperEvent(state: "checking"))
        if command == .probe {
            updater.checkForUpdateInformation()
        } else {
            updater.checkForUpdates()
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
        NSApplication.shared.run()
    }

    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        emit(HelperEvent(
            state: "update-available",
            version: item.versionString,
            displayVersion: item.displayVersionString
        ))
    }

    func updaterDidNotFindUpdate(_ updater: SPUUpdater, error: Error) {
        emit(HelperEvent(state: "up-to-date", message: error.localizedDescription))
    }

    func updater(
        _ updater: SPUUpdater,
        didFinishUpdateCycleFor updateCheck: SPUUpdateCheck,
        error: Error?
    ) {
        if let error {
            emit(HelperEvent(state: "error", message: error.localizedDescription))
        } else {
            emit(HelperEvent(state: "finished"))
        }
        NSApplication.shared.stop(nil)
    }
}

@MainActor
private func main() -> Int32 {
    do {
        let invocation = try Invocation.parse(Array(CommandLine.arguments.dropFirst()))
        let configuration = try UpdateConfiguration.load(applicationPath: invocation.applicationPath)

        if invocation.command == .status {
            emit(HelperEvent(
                state: "ready",
                version: configuration.bundleVersion,
                displayVersion: configuration.displayVersion
            ))
            return EXIT_SUCCESS
        }

        NSApplication.shared.setActivationPolicy(.accessory)
        let driver = try UpdateDriver(configuration: configuration, command: invocation.command)
        try driver.run()
        return EXIT_SUCCESS
    } catch {
        emit(HelperEvent(state: "error", message: error.localizedDescription))
        FileHandle.standardError.write(Data("CodeTwoUpdateHelper: \(error.localizedDescription)\n".utf8))
        return EXIT_FAILURE
    }
}

exit(main())
