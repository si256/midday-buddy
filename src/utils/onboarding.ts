import { Community, UserProfile } from '../types/index.ts';

export function extractEmailDomain(email: string): string {
  const trimmed = (email || '').trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) return '';
  return trimmed.slice(atIdx + 1);
}

export function normalizeDomainList(domains?: string[] | string): string[] {
  if (!domains) return [];
  const arr = Array.isArray(domains) ? domains : domains.split(',');
  return Array.from(
    new Set(
      arr
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter((d) => d.includes('.') && !d.includes(' '))
    )
  );
}

export interface AutoApproveResult {
  autoApprove: boolean;
  reason: 'verified_domain' | 'invite_code' | 'manual_review';
}

export function evaluateOnboardingApproval(params: {
  email: string;
  inviteCode?: string;
  community?: Pick<Community, 'verifiedDomains' | 'inviteCode'> | null;
}): AutoApproveResult {
  const domain = extractEmailDomain(params.email);
  const verifiedDomains = normalizeDomainList(params.community?.verifiedDomains);

  if (domain && verifiedDomains.includes(domain)) {
    return { autoApprove: true, reason: 'verified_domain' };
  }

  const submittedCode = (params.inviteCode || '').trim().toUpperCase();
  const communityCode = (params.community?.inviteCode || '').trim().toUpperCase();

  if (submittedCode && communityCode && submittedCode === communityCode) {
    return { autoApprove: true, reason: 'invite_code' };
  }

  return { autoApprove: false, reason: 'manual_review' };
}

export function sanitizeUserForClient(user: UserProfile): Omit<UserProfile, 'password'> {
  const { password: _p, ...safe } = user as UserProfile & { passwordHash?: string };
  delete (safe as any).passwordHash;
  delete (safe as any).password_hash;
  return safe;
}

export function sanitizeCommunityForClient(community: Community, includeAdminSecrets: boolean): Community {
  const hasWebhook = Boolean(community.webhookUrl && community.webhookUrl.trim());
  const hasInviteCode = Boolean(community.inviteCode && community.inviteCode.trim());
  if (includeAdminSecrets) {
    return {
      ...community,
      hasWebhook,
      hasInviteCode,
    };
  }
  const { webhookUrl: _w, inviteCode: _c, ...publicComm } = community;
  return {
    ...publicComm,
    hasWebhook,
    hasInviteCode,
  };
}
