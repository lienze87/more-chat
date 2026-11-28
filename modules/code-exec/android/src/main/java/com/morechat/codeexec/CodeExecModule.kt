package com.morechat.codeexec

import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.QuickJsInterruptedException
import com.dokar.quickjs.binding.asyncFunction
import com.dokar.quickjs.evaluate
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout

class CodeExecModule : Module() {
  private class Execution {
    val replies = ConcurrentHashMap<Int, CompletableDeferred<String>>()
    lateinit var job: Job
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val executions = ConcurrentHashMap<Int, Execution>()

  override fun definition() = ModuleDefinition {
    Name("MoreChatCodeExec")
    Events("toolRequest")

    AsyncFunction("evaluate") {
      runId: Int, program: String, memoryLimit: Int, stackLimit: Int, timeoutMs: Int, promise: Promise ->
      val execution = Execution()
      execution.job = scope.launch(start = CoroutineStart.LAZY) {
        try {
          val result = withTimeout(timeoutMs.toLong()) {
            evaluate(runId, execution, program, memoryLimit, stackLimit, timeoutMs)
          }
          promise.resolve(result)
        } catch (error: TimeoutCancellationException) {
          promise.reject("ERR_CODE_EXEC_TIMEOUT", "JavaScript 执行超时。", error)
        } catch (error: QuickJsInterruptedException) {
          promise.reject("ERR_CODE_EXEC_TIMEOUT", "JavaScript 执行超时。", error)
        } catch (error: CancellationException) {
          throw error
        } catch (error: Exception) {
          promise.reject("ERR_CODE_EXEC", "脚本执行失败。", error)
        }
      }
      executions[runId] = execution
      execution.job.invokeOnCompletion { cause ->
        executions.remove(runId, execution)
        if (cause is CancellationException) {
          promise.reject("ERR_CODE_EXEC_CANCELLED", "JavaScript 执行已停止。", cause)
        }
      }
      execution.job.start()
    }

    AsyncFunction("reply") { runId: Int, requestId: Int, response: String ->
      executions[runId]?.replies?.remove(requestId)?.complete(response)
      Unit
    }

    AsyncFunction("cancel") { runId: Int ->
      executions[runId]?.job?.cancel()
    }

    OnDestroy { scope.cancel() }
  }

  private suspend fun evaluate(
    runId: Int,
    execution: Execution,
    program: String,
    memoryLimit: Int,
    stackLimit: Int,
    timeoutMs: Int,
  ): String {
    val vm = QuickJs.create(Dispatchers.Default.limitedParallelism(1))
    val toolLock = Mutex()
    var nextRequestId = 0
    try {
      vm.memoryLimit = memoryLimit.toLong()
      vm.maxStackSize = stackLimit.toLong()
      vm.evaluationTimeoutMillis = timeoutMs.toLong()
      vm.asyncFunction("callTool") { args ->
        toolLock.withLock {
          val requestId = ++nextRequestId
          val reply = CompletableDeferred<String>()
          execution.replies[requestId] = reply
          try {
            sendEvent(
              "toolRequest",
              mapOf(
                "runId" to runId,
                "requestId" to requestId,
                "name" to args[0] as String,
                "argumentsText" to args[1] as String,
              ),
            )
            reply.await()
          } finally {
            execution.replies.remove(requestId)
          }
        }
      }
      // QuickJS-KT returns the script's completion value. Await the inner Promise explicitly.
      return vm.evaluate<String>("await $program", filename = "code_exec.js")
    } finally {
      vm.close()
    }
  }
}
