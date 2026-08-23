@preconcurrency import CloudKit
import Foundation
import Security

private let recordType = "CodeTwoSyncState"
private let recordName = "private-v1"

private struct HelperEvent: Encodable {
    let state: String
    var message: String? = nil
    var file: String? = nil
    var changeTag: String? = nil
    var revision: Int64? = nil
}

private enum Command: String {
    case status
    case download
    case upload
}

private struct Invocation {
    let command: Command
    let container: String
    let destination: String?
    let source: String?
    let expectedChangeTag: String?

    static func parse(_ arguments: [String]) throws -> Invocation {
        guard let first = arguments.first, let command = Command(rawValue: first) else {
            throw HelperError.usage
        }
        var values: [String: String] = [:]
        var index = 1
        while index < arguments.count {
            let key = arguments[index]
            guard key.hasPrefix("--"), index + 1 < arguments.count else {
                throw HelperError.usage
            }
            values[key] = arguments[index + 1]
            index += 2
        }
        guard let container = values["--container"], !container.isEmpty else {
            throw HelperError.usage
        }
        if command == .download && values["--destination"] == nil { throw HelperError.usage }
        if command == .upload && values["--source"] == nil { throw HelperError.usage }
        return Invocation(
            command: command,
            container: container,
            destination: values["--destination"],
            source: values["--source"],
            expectedChangeTag: values["--expected-change-tag"]
        )
    }
}

private enum HelperError: LocalizedError {
    case usage
    case restricted(String)
    case unavailable(String)
    case missingAsset
    case invalidSnapshot
    case conflict

    var errorDescription: String? {
        switch self {
        case .usage:
            return "Usage: CodeTwoCloudSyncHelper <status|download|upload> --container <id> [--destination <path> | --source <path>] [--expected-change-tag <tag>]"
        case .restricted(let message):
            return message
        case .unavailable(let message):
            return message
        case .missingAsset:
            return "The iCloud sync record has no payload asset."
        case .invalidSnapshot:
            return "The local sync snapshot is invalid."
        case .conflict:
            return "The iCloud record changed during synchronization."
        }
    }
}

private func emit(_ event: HelperEvent) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(event) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

private func ckError(_ error: Error) -> CKError? {
    if let value = error as? CKError { return value }
    let nsError = error as NSError
    return nsError.domain == CKError.errorDomain ? CKError(_nsError: nsError) : nil
}

private func emitFailure(_ error: Error) -> Int32 {
    if case HelperError.conflict = error {
        emit(HelperEvent(state: "conflict", message: error.localizedDescription))
        return EXIT_FAILURE
    }
    if case HelperError.restricted = error {
        emit(HelperEvent(state: "restricted", message: error.localizedDescription))
        return EXIT_FAILURE
    }
    if let cloudError = ckError(error) {
        switch cloudError.code {
        case .serverRecordChanged:
            emit(HelperEvent(state: "conflict", message: cloudError.localizedDescription))
        case .notAuthenticated:
            emit(HelperEvent(state: "signed-out", message: "Sign in to iCloud to sync C2."))
        case .permissionFailure, .badContainer:
            emit(HelperEvent(state: "restricted", message: "This C2 build is not provisioned for its iCloud container."))
        case .networkUnavailable, .networkFailure, .serviceUnavailable, .requestRateLimited, .zoneBusy:
            emit(HelperEvent(state: "unavailable", message: cloudError.localizedDescription))
        default:
            emit(HelperEvent(state: "error", message: cloudError.localizedDescription))
        }
    } else {
        emit(HelperEvent(state: "error", message: error.localizedDescription))
    }
    FileHandle.standardError.write(Data("CodeTwoCloudSyncHelper: \(error.localizedDescription)\n".utf8))
    return EXIT_FAILURE
}

private func requireContainerEntitlement(_ identifier: String) throws {
    guard
        let task = SecTaskCreateFromSelf(nil),
        let value = SecTaskCopyValueForEntitlement(
            task,
            "com.apple.developer.icloud-container-identifiers" as CFString,
            nil
        ) as? [String],
        value.contains(identifier)
    else {
        throw HelperError.restricted(
            "This C2 build is not provisioned for its iCloud container."
        )
    }
}

private func requireAvailableAccount(_ container: CKContainer) async throws {
    switch try await container.accountStatus() {
    case .available:
        return
    case .noAccount:
        throw CKError(.notAuthenticated)
    case .restricted:
        throw CKError(.permissionFailure)
    case .couldNotDetermine:
        throw HelperError.unavailable("iCloud account status could not be determined.")
    case .temporarilyUnavailable:
        throw HelperError.unavailable("iCloud is temporarily unavailable.")
    @unknown default:
        throw HelperError.unavailable("iCloud account status is unavailable.")
    }
}

private func fetchRecord(_ database: CKDatabase, id: CKRecord.ID) async throws -> CKRecord? {
    do {
        return try await database.record(for: id)
    } catch {
        if ckError(error)?.code == .unknownItem { return nil }
        throw error
    }
}

private func snapshotRevision(at url: URL) throws -> Int64 {
    let data = try Data(contentsOf: url)
    guard
        let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let revision = value["revision"] as? NSNumber
    else {
        throw HelperError.invalidSnapshot
    }
    return revision.int64Value
}

private func download(container: CKContainer, destinationPath: String) async throws {
    try await requireAvailableAccount(container)
    let database = container.privateCloudDatabase
    let id = CKRecord.ID(recordName: recordName)
    guard let record = try await fetchRecord(database, id: id) else {
        emit(HelperEvent(state: "downloaded"))
        return
    }
    guard let asset = record["payload"] as? CKAsset, let source = asset.fileURL else {
        throw HelperError.missingAsset
    }
    let destination = URL(fileURLWithPath: destinationPath).standardizedFileURL
    try FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: destination)
    }
    try FileManager.default.copyItem(at: source, to: destination)
    emit(HelperEvent(
        state: "downloaded",
        file: destination.path,
        changeTag: record.recordChangeTag,
        revision: (record["revision"] as? NSNumber)?.int64Value
    ))
}

private func upload(
    container: CKContainer,
    sourcePath: String,
    expectedChangeTag: String?
) async throws {
    try await requireAvailableAccount(container)
    let source = URL(fileURLWithPath: sourcePath).standardizedFileURL
    guard FileManager.default.fileExists(atPath: source.path) else {
        throw HelperError.invalidSnapshot
    }
    let revision = try snapshotRevision(at: source)
    let database = container.privateCloudDatabase
    let id = CKRecord.ID(recordName: recordName)
    let current = try await fetchRecord(database, id: id)
    if current?.recordChangeTag != expectedChangeTag { throw HelperError.conflict }

    let record = current ?? CKRecord(recordType: recordType, recordID: id)
    record["payload"] = CKAsset(fileURL: source)
    record["revision"] = NSNumber(value: revision)
    record["schemaVersion"] = NSNumber(value: 1)
    record["updatedAt"] = Date()
    let results = try await database.modifyRecords(
        saving: [record],
        deleting: [],
        savePolicy: .ifServerRecordUnchanged,
        atomically: true
    )
    guard let result = results.saveResults[id] else {
        throw HelperError.unavailable("CloudKit did not return the saved sync record.")
    }
    let saved = try result.get()
    emit(HelperEvent(
        state: "written",
        changeTag: saved.recordChangeTag,
        revision: revision
    ))
}

@main
private struct CodeTwoCloudSyncHelper {
    static func main() async {
        do {
            let invocation = try Invocation.parse(Array(CommandLine.arguments.dropFirst()))
            try requireContainerEntitlement(invocation.container)
            let container = CKContainer(identifier: invocation.container)
            switch invocation.command {
            case .status:
                try await requireAvailableAccount(container)
                emit(HelperEvent(state: "ready"))
            case .download:
                try await download(container: container, destinationPath: invocation.destination!)
            case .upload:
                try await upload(
                    container: container,
                    sourcePath: invocation.source!,
                    expectedChangeTag: invocation.expectedChangeTag
                )
            }
            Foundation.exit(EXIT_SUCCESS)
        } catch {
            Foundation.exit(emitFailure(error))
        }
    }
}
