import React from 'react';
import { Bell, CheckCheck, Clock, ShieldCheck, Zap, X } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  isOpen: boolean;
  onClose: () => void;
  onSelectNotification?: (notif: AppNotification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onMarkAllRead,
  isOpen,
  onClose,
  onSelectNotification,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div 
      className="absolute right-2 sm:right-0 top-14 w-[calc(100vw-24px)] max-w-sm rounded-3xl border border-stone-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in-50 zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-orange-500" />
          <h3 className="font-bold text-xs text-slate-900 dark:text-white">
            Campus Activity & Pings
          </h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 p-1"
              title="Mark all as read"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-stone-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No notifications yet
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => onSelectNotification && onSelectNotification(notif)}
              className={`py-3 px-1 text-xs cursor-pointer transition-colors ${
                !notif.isRead
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 rounded-xl px-2.5 my-1'
                  : 'hover:bg-stone-50/50 dark:hover:bg-slate-800/40 rounded-xl px-2'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5">
                  {notif.type === 'approval' ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <Zap className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {notif.title}
                    </span>
                    {!notif.isRead && (
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-600 shrink-0"></span>
                    )}
                  </div>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400 text-[11px] line-clamp-2">
                    {notif.body}
                  </p>
                  <span className="mt-1 block text-[10px] text-slate-400 font-mono-numbers">
                    {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
