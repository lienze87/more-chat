import {useCallback, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';

type Result<T> = {status: 'error'} | {status: 'ready'; value: T};

export function useWorkspaceQuery<T>(load: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    load: typeof load;
    revision: number;
    result: Result<T>;
  }>();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const query = async () => {
        let result: Result<T>;
        try {
          result = {status: 'ready', value: await load()};
        } catch {
          result = {status: 'error'};
        }
        if (active) {
          setResponse({load, revision, result});
        }
      };
      void query();
      return () => {
        active = false;
      };
    }, [load, revision]),
  );

  return {
    result:
      response?.load === load && response.revision === revision
        ? response.result
        : ({status: 'loading'} as const),
    reload: () => setRevision(value => value + 1),
  };
}
