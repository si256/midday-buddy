import React from 'react';
import { 
  X, 
  Coffee, 
  Utensils, 
  Footprints, 
  MapPin, 
  Zap, 
  MessageSquare, 
  Sparkles, 
  Smile, 
  Heart,
  HelpCircle,
  Clock
} from 'lucide-react';
import { BreakPost } from '../types';

interface InterestModalProps {
  post: BreakPost | null;
  onClose: () => void;
  onConnect: (post: BreakPost) => void;
}

export const InterestModal: React.FC<InterestModalProps> = ({
  post,
  onClose,
  onConnect,
}) => {
  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Background */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${post.userAvatarBg} text-2xl font-bold text-white shadow-md border-2 border-white/30`}>
              {post.userName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-xs">
                  {post.breakType === 'tea' ? '☕ Tea Break' : post.breakType === 'lunch' ? '🍱 Lunch Break' : '🚶 Walk'}
                </span>
                <span className="text-xs text-amber-100 font-mono-numbers">
                  {post.timeLabel}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white tracking-tight">
                {post.userName}
              </h2>
              <p className="text-xs text-amber-100">
                {post.userRole}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Rendezvous Spot */}
          <div className="flex items-center gap-2 rounded-2xl bg-stone-50 p-3.5 dark:bg-slate-800/60 border border-stone-100 dark:border-slate-800">
            <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="text-xs">
              <span className="text-slate-500 dark:text-slate-400">Meeting Spot: </span>
              <span className="font-bold text-slate-900 dark:text-white">{post.locationName}</span>
            </div>
          </div>

          {/* User's Break Note */}
          {post.customNote && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Break Mood & Objective
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 italic bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-900/40">
                "{post.customNote}"
              </p>
            </div>
          )}

          {/* Conversation Sparker / Icebreaker Box */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50/80 to-purple-50/80 p-4 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-900/40">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Easy Conversation Starter (Icebreaker)</span>
            </div>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
              "{post.icebreaker}"
            </p>
          </div>

          {/* Passions & Shared Interests */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Passions & Interests
            </div>
            <div className="flex flex-wrap gap-2">
              {post.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  {interest}
                </span>
              ))}
              {post.dietary && post.dietary !== 'Any' && (
                <span className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300">
                  {post.dietary}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="border-t border-stone-200 bg-stone-50 p-4 dark:border-slate-800 dark:bg-slate-900/80 flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>

          <button
            onClick={() => {
              onConnect(post);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 px-4 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
          >
            <Zap className="h-4 w-4 fill-current" />
            <span>Connect & Message {post.userName.split(' ')[0]}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
