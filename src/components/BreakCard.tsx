import React from 'react';
import { Coffee, Utensils, Footprints, MapPin, Zap, Sparkles, Clock } from 'lucide-react';
import { BreakPost } from '../types';

interface BreakCardProps {
  post: BreakPost;
  now: number; // Current timestamp in ms for live ticking
  onSelectPost: (post: BreakPost) => void;
  onInstantConnect: (post: BreakPost) => void;
}

export const BreakCard: React.FC<BreakCardProps> = ({
  post,
  now,
  onSelectPost,
  onInstantConnect,
}) => {
  const diffMs = post.expiresAt - now;
  const isExpired = diffMs <= 0;
  const remainingMins = Math.max(0, Math.floor(diffMs / (60 * 1000)));
  const remainingSecs = Math.max(0, Math.floor((diffMs % (60 * 1000)) / 1000));

  const totalDurationMs = post.durationMinutes * 60 * 1000;
  const progressPercent = Math.min(100, Math.max(0, (diffMs / totalDurationMs) * 100));

  const getBreakIcon = (type: string) => {
    switch (type) {
      case 'tea':
        return <Coffee className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
      case 'lunch':
        return <Utensils className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />;
      case 'walk':
        return <Footprints className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />;
      default:
        return <Coffee className="h-3.5 w-3.5 text-amber-600" />;
    }
  };

  const getBreakLabel = (type: string) => {
    switch (type) {
      case 'tea':
        return 'Tea Break';
      case 'lunch':
        return 'Lunch Break';
      case 'walk':
        return 'Campus Walk';
      default:
        return 'Break';
    }
  };

  return (
    <div className={`group relative flex flex-col justify-between rounded-3xl border bg-white p-5 shadow-xs transition-all duration-200 dark:bg-slate-900/90 ${
      isExpired 
        ? 'opacity-60 border-stone-200 dark:border-slate-800' 
        : 'border-stone-200 hover:border-amber-400/80 hover:shadow-md dark:border-slate-800 dark:hover:border-amber-500/50'
    }`}>
      <div className="space-y-3.5">
        {/* Top Status & Realtime Countdown Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Break Type Indicator */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {getBreakIcon(post.breakType)}
            <span>{getBreakLabel(post.breakType)}</span>
          </div>

          {/* Real-time Ticking Countdown */}
          {!isExpired ? (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono-numbers">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>
                {remainingMins}m {remainingSecs < 10 ? `0${remainingSecs}` : remainingSecs}s left
              </span>
            </div>
          ) : (
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              Break Ended
            </span>
          )}
        </div>

        {/* Live Progress Bar */}
        {!isExpired && (
          <div className="w-full bg-stone-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* User Identity Block */}
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${post.userAvatarBg} text-sm font-bold text-white shadow-xs`}>
            {post.userName.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
              {post.userName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {post.userRole}
            </p>
          </div>
        </div>

        {/* Location Along Central Spine */}
        <div className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
          <span className="font-medium text-slate-900 dark:text-slate-200">
            {post.locationName}
          </span>
        </div>

        {/* User Note */}
        {post.customNote && (
          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 italic bg-stone-50/80 p-2.5 rounded-2xl border border-stone-100 dark:border-slate-800/80 dark:bg-slate-800/50">
            "{post.customNote}"
          </p>
        )}

        {/* Unboxed Interest Tags (Anti-Slop Zero-Pill) */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
          {post.interests.slice(0, 3).map((tag, idx) => (
            <React.Fragment key={tag}>
              <span className="font-medium text-slate-600 dark:text-slate-300">{tag}</span>
              {idx < Math.min(post.interests.length, 3) - 1 && <span aria-hidden="true">·</span>}
            </React.Fragment>
          ))}
          {post.dietary && post.dietary !== 'Any' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-700 dark:text-amber-400 font-semibold">{post.dietary}</span>
            </>
          )}
        </div>
      </div>

      {/* Action Row */}
      <div className="mt-5 flex items-center gap-2 pt-3 border-t border-stone-100 dark:border-slate-800">
        <button
          onClick={() => onInstantConnect(post)}
          disabled={isExpired}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 px-3 text-xs font-semibold text-white shadow-xs hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none"
        >
          <Zap className="h-3.5 w-3.5 fill-current" />
          <span>Connect Now</span>
        </button>

        <button
          onClick={() => onSelectPost(post)}
          className="flex items-center justify-center gap-1 rounded-xl border border-stone-200 bg-white py-2.5 px-3 text-xs font-semibold text-slate-700 hover:bg-stone-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>Interests</span>
        </button>
      </div>
    </div>
  );
};
