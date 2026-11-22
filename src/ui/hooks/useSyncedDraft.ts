import {useState, type Dispatch, type SetStateAction} from 'react';

/**
 * 外部值变化时同步本地草稿，供受控输入在“编辑中”与“已保存值”之间切换。
 *
 * 采用 React 推荐的渲染期调整 state 写法，避免在 effect 里 setState 触发
 * 级联渲染。设置页的 API Key、文本设置项等共用。
 */
export function useSyncedDraft<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [synced, setSynced] = useState(value);
  const [draft, setDraft] = useState(value);

  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  return [draft, setDraft];
}
