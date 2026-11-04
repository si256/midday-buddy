import { BreakPost, UserApprovalStatus } from '../types';

export function canAccessBreakDirectory(status: UserApprovalStatus): boolean {
  return status === 'approved';
}

export function filterBreaks(
  posts: BreakPost[],
  options: {
    communityId: string;
    breakType: string;
    onlyFreeNow: boolean;
    zone: string;
  }
): BreakPost[] {
  return posts.filter((post) => {
    if (post.communityId !== options.communityId) return false;
    if (options.breakType !== 'all' && post.breakType !== options.breakType) return false;
    if (options.onlyFreeNow && post.status !== 'free_now') return false;
    if (options.zone !== 'all' && post.zone !== options.zone) return false;
    return true;
  });
}

export function getRemainingMinutes(expiresAt: number, currentNow: number = Date.now()): number {
  const diffMs = expiresAt - currentNow;
  return Math.max(0, Math.ceil(diffMs / (60 * 1000)));
}
