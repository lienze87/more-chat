import AsyncStorage from '@react-native-async-storage/async-storage';
import {conversationRepository} from '../src/adapters/data/repositories/conversationRepository';
import {STORAGE_KEYS} from '../src/config/appConfig';
import type {Conversation, UserMessage} from '../src/domain/chat/types';

const user = (id: string): UserMessage => ({
  id,
  role: 'user',
  content: '你好',
  createdAt: 1,
  status: 'complete',
  reminder: '2026-11-22,星期日,上海,App,中文',
  envInfo: '<env_info>测试</env_info>',
});

const conversation = (id: string): Conversation => ({
  id,
  title: id,
  titleSource: 'fallback',
  createdAt: 1,
  updatedAt: 1,
  messages: [user(`u-${id}`)],
});

describe('conversationRepository', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps valid records and drops invalid ones independently', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.conversations,
      JSON.stringify([
        conversation('valid'),
        {...conversation('old-shape'), titleSource: 'legacy'},
        conversation('also-valid'),
      ]),
    );

    await expect(conversationRepository.load()).resolves.toEqual([
      conversation('valid'),
      conversation('also-valid'),
    ]);
  });

  it('does not accept old messages missing current fields', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.conversations,
      JSON.stringify([
        {
          ...conversation('missing-tool-arrays'),
          messages: [
            {
              id: 'a1',
              role: 'assistant',
              content: '',
              createdAt: 1,
              status: 'complete',
              segments: [],
              reasoning: '',
              annotations: [],
              activeStep: 0,
            },
          ],
        },
      ]),
    );

    await expect(conversationRepository.load()).resolves.toEqual([]);
  });
});
