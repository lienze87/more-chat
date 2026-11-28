import {useEffect, useState} from 'react';
import {Keyboard, Platform} from 'react-native';

/**
 * 键盘与输入区底部的避让状态。
 *
 * 原生端监听键盘事件；Web 端用 `visualViewport` 估算软键盘占用的高度，仅在
 * 输入框聚焦且页面未缩放时生效。
 */
export function useKeyboardInset() {
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => Platform.OS !== 'web' && Keyboard.isVisible(),
  );
  const [webKeyboardInset, setWebKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const viewport = window.visualViewport;
      if (!viewport) {
        return;
      }
      const update = () => {
        const inputFocused =
          document.activeElement instanceof HTMLTextAreaElement;
        setWebKeyboardInset(
          inputFocused && viewport.scale === 1
            ? Math.max(
                0,
                window.innerHeight - viewport.height - viewport.offsetTop,
              )
            : 0,
        );
      };
      const reset = () => setWebKeyboardInset(0);
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
      document.addEventListener('focusout', reset);
      return () => {
        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
        document.removeEventListener('focusout', reset);
      };
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return {keyboardVisible, webKeyboardInset};
}
