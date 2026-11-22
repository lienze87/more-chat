import {create} from 'zustand';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogPrompt {
  label?: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  submitText?: string;
  cancelText?: string;
  onSubmit: (value: string) => void;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  prompt?: DialogPrompt;
  tone?: 'info' | 'danger';
}

interface DialogState {
  current: DialogRequest | null;
  queue: DialogRequest[];
  open: (request: Omit<DialogRequest, 'id'>) => void;
  dismiss: (id: number, button?: DialogButton) => void;
}

let nextId = 1;

/**
 * 应用内对话框队列。
 *
 * 原生 `Alert` 与 `window.confirm/prompt` 观感不一致（Web 上还是非阻塞的原生
 * 弹窗），这里把确认框、操作菜单都收敛成同一套 React 组件，三端表现一致。
 */
export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  queue: [],
  open: request => {
    const next: DialogRequest = {...request, id: nextId++};
    const {current, queue} = get();
    if (current) {
      set({queue: [...queue, next]});
      return;
    }
    set({current: next});
  },
  dismiss: (id, button) => {
    const {current, queue} = get();
    if (!current || current.id !== id) {
      return;
    }
    // 先出队再执行回调：回调里可能立刻打开下一个对话框（例如操作菜单 →
    // 二次确认），此时应当成为新的 current，而不是被这里的 set 覆盖掉。
    const [next, ...rest] = queue;
    set({current: next ?? null, queue: rest});
    button?.onPress?.();
  },
}));

/** 命令式打开确认框（标题 + 说明 + 若干按钮）。 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
): void {
  useDialogStore.getState().open({
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{text: '确定'}],
  });
}

/** 命令式打开输入框（重命名等单行文本场景）。 */
export function openPrompt(options: {
  title: string;
  message?: string;
  prompt: DialogPrompt;
}): void {
  useDialogStore.getState().open({
    title: options.title,
    message: options.message,
    buttons: [],
    prompt: options.prompt,
  });
}

/** 命令式打开操作菜单（标题 + 若干动作 + 取消）。 */
export function openActionMenu(
  title: string,
  actions: DialogButton[],
  options?: {message?: string; tone?: DialogRequest['tone']},
): void {
  useDialogStore.getState().open({
    title,
    message: options?.message,
    tone: options?.tone,
    buttons: [...actions, {text: '取消', style: 'cancel'}],
  });
}
