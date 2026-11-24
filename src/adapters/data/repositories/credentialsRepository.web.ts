// 页面会话内存。刷新页面后重新输入 API Key。
let apiKey = '';

export const credentialsRepository = {
  async load(): Promise<string> {
    return apiKey;
  },

  async save(value: string): Promise<void> {
    apiKey = value;
  },
};
