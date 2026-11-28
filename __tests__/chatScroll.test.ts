import {resolveFollowing} from '../src/ui/hooks/chatScroll';

const input = (
  overrides: Partial<Parameters<typeof resolveFollowing>[0]> = {},
) => ({
  distance: 200,
  movingUp: true,
  following: true,
  userScrolling: true,
  web: false,
  ...overrides,
});

describe('resolveFollowing', () => {
  it('resumes following when the user returns to the bottom', () => {
    expect(
      resolveFollowing(input({distance: 0, movingUp: false, following: false})),
    ).toBe(true);
  });

  it('keeps following while already at the bottom', () => {
    expect(
      resolveFollowing(input({distance: 1, movingUp: false, following: true})),
    ).toBeNull();
  });

  it('stops following only for an active upward scroll on native', () => {
    expect(resolveFollowing(input())).toBe(false);
    expect(resolveFollowing(input({userScrolling: false}))).toBeNull();
    expect(resolveFollowing(input({web: true, userScrolling: false}))).toBe(
      false,
    );
  });

  it('does not restart following during an upward scroll', () => {
    expect(
      resolveFollowing(input({following: false, userScrolling: false})),
    ).toBeNull();
    expect(
      resolveFollowing(input({distance: 0, movingUp: true, following: false})),
    ).toBeNull();
  });

  it('does not stop following on downward programmatic scrolls', () => {
    expect(
      resolveFollowing(input({movingUp: false, userScrolling: false})),
    ).toBeNull();
    expect(resolveFollowing(input({movingUp: false, web: true}))).toBeNull();
  });
});
