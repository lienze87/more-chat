import ExpoModulesCore
import Foundation

public final class CodeExecModule: Module {
  private let lock = NSLock()
  private var executions: [Int: QuickJSExecution] = [:]

  public func definition() -> ModuleDefinition {
    Name("MoreChatCodeExec")
    Events("toolRequest")

    AsyncFunction("evaluate") {
      (runId: Int, program: String, memoryLimit: Int, stackLimit: Int, timeoutMs: Int, promise: Promise) in
      let execution = QuickJSExecution(
        timeoutMs: timeoutMs,
        requestTool: { [weak self] requestId, name, argumentsText in
          self?.sendEvent("toolRequest", [
            "runId": runId,
            "requestId": requestId,
            "name": name,
            "argumentsText": argumentsText
          ])
        },
        complete: { [weak self] result in
          self?.removeExecution(runId)
          switch result {
          case .success(let output):
            promise.resolve(output)
          case .failure(.timeout):
            promise.reject("ERR_CODE_EXEC_TIMEOUT", "JavaScript 执行超时。")
          case .failure(.cancelled):
            promise.reject("ERR_CODE_EXEC_CANCELLED", "JavaScript 执行已停止。")
          case .failure(.stalled):
            promise.reject("ERR_CODE_EXEC", "脚本停在一个无法完成的 Promise 上。")
          case .failure(.script):
            promise.reject("ERR_CODE_EXEC", "脚本执行失败。")
          }
        }
      )
      self.lock.withLock { self.executions[runId] = execution }
      execution.start(program, memoryLimit: memoryLimit, stackLimit: stackLimit)
    }

    AsyncFunction("reply") { (runId: Int, requestId: Int, response: String) in
      let execution = self.lock.withLock { self.executions[runId] }
      execution?.reply(requestId: requestId, response: response)
    }

    AsyncFunction("cancel") { (runId: Int) in
      let execution = self.lock.withLock { self.executions[runId] }
      execution?.cancel()
    }

    OnDestroy {
      let active = self.lock.withLock {
        let active = Array(self.executions.values)
        self.executions.removeAll()
        return active
      }
      active.forEach { $0.cancel() }
    }
  }

  private func removeExecution(_ runId: Int) {
    _ = lock.withLock { executions.removeValue(forKey: runId) }
  }
}
