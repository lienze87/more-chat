/** 可通过修改工具参数、检查文件或重试解决的文件操作错误。 */
export class FileToolError extends Error {
  toResponse() {
    return {type: 'error', message: this.message} as const;
  }
}
