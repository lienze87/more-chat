/** 可通过修改工具参数、检查文件或重试解决的文件操作错误。 */
export class FileToolError extends Error {
  private readonly savedPaths?: readonly string[];

  constructor(
    message: string,
    options?: ErrorOptions & {savedPaths?: readonly string[]},
  ) {
    super(message, options);
    this.savedPaths = options?.savedPaths;
  }

  toResponse() {
    return {
      type: 'error',
      message: this.message,
      ...(this.savedPaths?.length ? {saved_paths: this.savedPaths} : {}),
    } as const;
  }
}
