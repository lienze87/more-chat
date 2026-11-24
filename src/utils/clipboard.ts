import {setStringAsync} from 'expo-clipboard';

export async function copyText(text: string): Promise<void> {
  if (!(await setStringAsync(text))) {
    throw new Error('无法写入剪贴板。');
  }
}
