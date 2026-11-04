/**
 * MidDay Buddy Type Definitions
 */

export type UserRole = 'user' | 'community_admin' | 'platform_admin';
export type UserApprovalStatus = 'pending_approval' | 'approved' | 'rejected' | 'suspended';

export type BreakType = 'tea' | 'lunch' | 'walk' | 'sports';
export type BreakAvailabilityStatus = 'free_now' | 'in_10m' | 'in_20m' | 'scheduled' | 'completed';
export type DietaryPreference = 'Any' | 'Pure Veg' | 'Jain' | 'Halal' | 'Non-Veg';
export type SocialBattery = 'Quiet & Chill' | 'Balanced Banter' | 'Lively & Outgoing';

export interface UserProfile {
  id: string;
  email: string;
  password?: string;
  name: string;
  roleTitle: string; // e.g. "Software Engineer", "Systems Analyst"
  campusId: string;
  avatarSeed: string;
  avatarBgColor: string;
  bio: string;
  icebreaker: string;
  interests: string[];
  dietary: DietaryPreference;
  socialBattery: SocialBattery;
  role: UserRole;
  status: UserApprovalStatus;
  rejectionReason?: string;
  registeredAt: string;
  approvedAt?: string;
}

export interface CampusLocation {
  id: string;
  communityId: string;
  name: string;
  zone: string; // e.g. "Central Spine", "Food Court 1", "FC2", "Outdoor Greens"
  description: string;
  isPopular?: boolean;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  city: string;
  description: string;
  memberCount: number;
  activeBreaksCount: number;
  locations: CampusLocation[];
}

export interface BreakPost {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userAvatarSeed: string;
  userAvatarBg: string;
  communityId: string;
  breakType: BreakType;
  status: BreakAvailabilityStatus;
  timeLabel: string; // e.g. "Free Right Now", "In 10 mins", "1:15 PM"
  durationMinutes: number;
  locationName: string;
  zone: string;
  customNote: string;
  dietary?: DietaryPreference;
  interests: string[];
  icebreaker: string;
  expiresAt: number; // Unix epoch ms
  createdAt: number;
}

export interface MeetupPing {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  breakType: BreakType;
  locationName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarBg?: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: string[];
  locationName: string;
  breakType: BreakType;
  lastMessage?: string;
  lastMessageAt: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'ping' | 'approval' | 'rejection' | 'chat';
  isRead: boolean;
  createdAt: string;
  referenceId?: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: 'APPROVE_USER' | 'REJECT_USER' | 'SUSPEND_USER' | 'REINSTATE_USER' | 'ADD_LOCATION' | 'DELETE_LOCATION';
  targetUserId?: string;
  targetUserName?: string;
  details: string;
  timestamp: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface LoginCredentials {
  email: string;
  password?: string;
}

