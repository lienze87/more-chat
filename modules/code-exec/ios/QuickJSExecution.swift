import Foundation
import MoreChatQuickJS

final class QuickJSExecution {
  enum Failure: Error {
    case cancelled
    case timeout
    case stalled
    case script
  }

  private struct Request {
    let id: Int
    let name: String
    let argumentsText: String
    let resolve: JSValue
  }

  private let queue = DispatchQueue(label: "com.morechat.code-exec", qos: .userInitiated)
  private let lock = NSLock()
  private let deadline: DispatchTime
  private let requestTool: (Int, String, String) -> Void
  private let complete: (Result<String, Failure>) -> Void
  private var cancelled = false

  // The VM and its values are only accessed on queue.
  private var runtime: OpaquePointer?
  private var context: OpaquePointer?
  private var program: JSValue?
  private var requests: [Request] = []
  private var nextRequestId = 0
  private var waitingForTool = false
  private var finished = false

  init(
    timeoutMs: Int,
    requestTool: @escaping (Int, String, String) -> Void,
    complete: @escaping (Result<String, Failure>) -> Void
  ) {
    deadline = .now() + .milliseconds(timeoutMs)
    self.requestTool = requestTool
    self.complete = complete
  }

  func start(_ source: String, memoryLimit: Int, stackLimit: Int) {
    queue.async {
      self.evaluate(source, memoryLimit: memoryLimit, stackLimit: stackLimit)
    }
    queue.asyncAfter(deadline: deadline) { [weak self] in
      guard let self, let failure = self.stopReason else { return }
      self.finish(.failure(failure))
    }
  }

  func reply(requestId: Int, response: String) {
    queue.async {
      guard self.waitingForTool, let request = self.requests.first, request.id == requestId,
            let runtime = self.runtime, let context = self.context else { return }
      if let failure = self.stopReason {
        self.finish(.failure(failure))
        return
      }

      JS_UpdateStackTop(runtime)
      self.waitingForTool = false
      self.requests.removeFirst()
      var argument = Self.makeString(context, response)
      let result = JS_IsException(argument) == 0
        ? JS_Call(context, request.resolve, Self.unusedValue, 1, &argument) : argument
      let failed = JS_IsException(result) != 0
      JS_FreeValue(context, argument)
      JS_FreeValue(context, result)
      JS_FreeValue(context, request.resolve)
      if failed {
        self.finish(.failure(self.stopReason ?? .script))
      } else {
        self.advance(runtime, context)
      }
    }
  }

  func cancel() {
    lock.withLock { cancelled = true }
    queue.async { self.finish(.failure(.cancelled)) }
  }

  private var stopReason: Failure? {
    if lock.withLock({ cancelled }) { return .cancelled }
    return DispatchTime.now() >= deadline ? .timeout : nil
  }

  private func evaluate(_ source: String, memoryLimit: Int, stackLimit: Int) {
    if finished { return }
    if let failure = stopReason {
      finish(.failure(failure))
      return
    }
    guard let runtime = JS_NewRuntime() else {
      finish(.failure(.script))
      return
    }
    self.runtime = runtime
    JS_SetMemoryLimit(runtime, memoryLimit)
    JS_SetMaxStackSize(runtime, stackLimit)

    let pointer = Unmanaged.passUnretained(self).toOpaque()
    JS_SetInterruptHandler(runtime, { _, pointer in
      guard let pointer else { return 1 }
      return Unmanaged<QuickJSExecution>.fromOpaque(pointer).takeUnretainedValue().stopReason == nil ? 0 : 1
    }, pointer)

    guard let context = JS_NewContext(runtime) else {
      finish(.failure(.script))
      return
    }
    self.context = context
    JS_SetContextOpaque(context, pointer)
    let global = JS_GetGlobalObject(context)
    let bridge = JS_NewCFunction(context, { context, _, count, arguments in
      guard let context, let pointer = JS_GetContextOpaque(context) else { return QuickJSExecution.unusedValue }
      let execution = Unmanaged<QuickJSExecution>.fromOpaque(pointer).takeUnretainedValue()
      guard count == 2, let arguments,
            let name = QuickJSExecution.readString(context, arguments[0]),
            let text = QuickJSExecution.readString(context, arguments[1]) else {
        return JS_Throw(context, QuickJSExecution.makeString(context, "工具参数无效。"))
      }
      var functions = [QuickJSExecution.unusedValue, QuickJSExecution.unusedValue]
      let promise = JS_NewPromiseCapability(context, &functions)
      JS_FreeValue(context, functions[1])
      if JS_IsException(promise) == 0 {
        execution.nextRequestId += 1
        execution.requests.append(Request(
          id: execution.nextRequestId, name: name, argumentsText: text, resolve: functions[0]
        ))
      } else {
        JS_FreeValue(context, functions[0])
      }
      return promise
    }, "callTool", 2)
    let installed = JS_SetPropertyStr(context, global, "callTool", bridge)
    JS_FreeValue(context, global)
    guard installed >= 0 else {
      finish(.failure(.script))
      return
    }

    program = source.utf8CString.withUnsafeBufferPointer { bytes in
      JS_Eval(context, bytes.baseAddress, bytes.count - 1, "code_exec.js", JS_EVAL_TYPE_GLOBAL)
    }
    advance(runtime, context)
  }

  private func advance(_ runtime: OpaquePointer, _ context: OpaquePointer) {
    guard let program, JS_IsException(program) == 0 else {
      finish(.failure(stopReason ?? .script))
      return
    }
    while true {
      if let failure = stopReason {
        finish(.failure(failure))
        return
      }
      switch JS_PromiseState(context, program) {
      case JS_PROMISE_FULFILLED:
        let value = JS_PromiseResult(context, program)
        let output = Self.readString(context, value)
        JS_FreeValue(context, value)
        finish(output.map { .success($0) } ?? .failure(.script))
        return
      case JS_PROMISE_PENDING:
        if JS_IsJobPending(runtime) != 0 {
          var jobContext: OpaquePointer?
          if JS_ExecutePendingJob(runtime, &jobContext) < 0 {
            finish(.failure(stopReason ?? .script))
            return
          }
          continue
        }
        guard let request = requests.first else {
          finish(.failure(.stalled))
          return
        }
        waitingForTool = true
        requestTool(request.id, request.name, request.argumentsText)
        return
      default:
        finish(.failure(.script))
        return
      }
    }
  }

  private func finish(_ result: Result<String, Failure>) {
    guard !finished else { return }
    finished = true
    if let runtime {
      JS_UpdateStackTop(runtime)
      if let context {
        if let program { JS_FreeValue(context, program) }
        for request in requests { JS_FreeValue(context, request.resolve) }
        JS_FreeContext(context)
      }
      JS_FreeRuntime(runtime)
    }
    context = nil
    runtime = nil
    program = nil
    requests.removeAll()
    complete(result)
  }

  // The Promise resolver ignores its receiver. An immediate value also makes a safe placeholder.
  private static let unusedValue = JS_NewInt32(nil, 0)

  private static func makeString(_ context: OpaquePointer, _ text: String) -> JSValue {
    text.utf8CString.withUnsafeBufferPointer { bytes in
      JS_NewStringLen(context, bytes.baseAddress, bytes.count - 1)
    }
  }

  private static func readString(_ context: OpaquePointer, _ value: JSValue) -> String? {
    guard JS_IsString(value) != 0 else { return nil }
    var size = 0
    guard let chars = JS_ToCStringLen(context, &size, value) else { return nil }
    defer { JS_FreeCString(context, chars) }
    return String(decoding: UnsafeRawBufferPointer(start: chars, count: size), as: UTF8.self)
  }
}
