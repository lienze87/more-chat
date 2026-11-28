import {useCallback, useEffect, useRef, useState} from 'react';
import {
  FlatList,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type {ChatMessage} from '../../domain/chat/types';
import {resolveFollowing} from './chatScroll';

/**
 * 消息列表的“跟随最新消息”行为。
 *
 * 封装滚动容器 ref、rAF 合并、用户滚动判定和回到底部按钮的状态；页面只负责
 * 把返回的回调接到 `FlatList` 上。
 */
export function useChatAutoScroll() {
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoScroll = useRef(true);
  const lastOffset = useRef(0);
  const userScrolling = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  const [following, setFollowing] = useState(true);

  const scrollToBottom = useCallback(() => {
    if (
      !autoScroll.current ||
      userScrolling.current ||
      scrollFrame.current !== null
    ) {
      return;
    }
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      if (autoScroll.current && !userScrolling.current) {
        listRef.current?.getNativeScrollRef()?.scrollToEnd({animated: false});
      }
    });
  }, []);

  useEffect(
    () => () => {
      if (scrollFrame.current !== null) {
        cancelAnimationFrame(scrollFrame.current);
      }
    },
    [],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
      const distance =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const movingUp = contentOffset.y < lastOffset.current;
      lastOffset.current = contentOffset.y;
      const next = resolveFollowing({
        distance,
        movingUp,
        following: autoScroll.current,
        userScrolling: userScrolling.current,
        web: Platform.OS === 'web',
      });
      if (next === null) {
        return;
      }
      autoScroll.current = next;
      setFollowing(next);
    },
    [],
  );

  const beginUserScroll = useCallback(() => {
    userScrolling.current = true;
  }, []);

  const stopUserScroll = useCallback(() => {
    userScrolling.current = false;
    scrollToBottom();
  }, [scrollToBottom]);

  const resumeFollowing = useCallback(() => {
    userScrolling.current = false;
    autoScroll.current = true;
    setFollowing(true);
    scrollToBottom();
  }, [scrollToBottom]);

  const resetFollowing = useCallback(() => {
    userScrolling.current = false;
    autoScroll.current = true;
    lastOffset.current = 0;
    setFollowing(true);
  }, []);

  return {
    listRef,
    following,
    scrollToBottom,
    handleScroll,
    beginUserScroll,
    stopUserScroll,
    resumeFollowing,
    resetFollowing,
  };
}
