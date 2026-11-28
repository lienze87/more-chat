import {CHAT_SCROLL_BOTTOM_TOLERANCE} from '../../config/appConfig';

export interface FollowingInput {
  /** 距离内容底部的像素数。 */
  distance: number;
  /** 本次滚动是否向上（离开底部）。 */
  movingUp: boolean;
  /** 当前是否仍跟随最新消息。 */
  following: boolean;
  /** 用户是否正在主动拖动/惯性滚动。 */
  userScrolling: boolean;
  /** Web 端没有原生惯性滚动，按滚动方向直接判断。 */
  web: boolean;
}

/**
 * 根据一次滚动事件决定是否切换“跟随最新消息”。
 *
 * 返回 `null` 表示保持现状。原生端只有用户主动滚动时才停止跟随，避免内容
 * 增高触发的程序化滚动误判。
 */
export function resolveFollowing({
  distance,
  movingUp,
  following,
  userScrolling,
  web,
}: FollowingInput): boolean | null {
  if (distance <= CHAT_SCROLL_BOTTOM_TOLERANCE && !following && !movingUp) {
    return true;
  }
  if (
    distance > CHAT_SCROLL_BOTTOM_TOLERANCE &&
    movingUp &&
    following &&
    (userScrolling || web)
  ) {
    return false;
  }
  return null;
}
