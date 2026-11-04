import React from 'react';
import { X, Send, MapPin, Coffee, Zap, CheckCheck } from 'lucide-react';
import { BreakPost, ChatMessage, UserProfile } from '../types';
import { ApiService } from '../services/api';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activePost: BreakPost | null;
  currentUser: UserProfile;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  activePost,
  currentUser,
}) => {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const conversationId = activePost
    ? `conv_${[currentUser.id, activePost.userId].sort().join('_')}`
    : '';

  // Load real messages from backend API & poll while drawer is open
  React.useEffect(() => {
    if (!activePost || !isOpen || !conversationId) return;

    let isMounted = true;

    const fetchChatMessages = async () => {
      try {
        const msgs = await ApiService.getMessages(conversationId);
        if (isMounted) {
          if (msgs.length === 0) {
            // First time connection: post real system welcome message
            const sysMsg = await ApiService.sendMessage(conversationId, {
              senderId: 'system',
              senderName: 'MidDay Buddy',
              text: `🤝 Real-time break coordination started for ${activePost.locationName}!`,
              isSystem: true,
            });
            const firstGreeting = await ApiService.sendMessage(conversationId, {
              senderId: currentUser.id,
              senderName: currentUser.name,
              text: `👋 Hey ${activePost.userName.split(' ')[0]}! Up for ${activePost.breakType === 'tea' ? 'chai' : 'lunch'}? Let's catch up at ${activePost.locationName.split('(')[0].trim()}.`,
            });
            setMessages([sysMsg, firstGreeting]);
          } else {
            setMessages(msgs);
          }
        }
      } catch (err) {
        console.error('Failed to fetch chat messages:', err);
      }
    };

    fetchChatMessages();

    // Live polling every 2.5s while chat drawer is open
    const interval = setInterval(async () => {
      try {
        const fresh = await ApiService.getMessages(conversationId);
        if (isMounted && fresh.length > 0) {
          setMessages(fresh);
        }
      } catch (err) {
        // silent fail during poll
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activePost, isOpen, conversationId]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen || !activePost) return null;

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text || !conversationId || isSending) return;

    setIsSending(true);
    try {
      const savedMsg = await ApiService.sendMessage(conversationId, {
        senderId: currentUser.id,
        senderName: currentUser.name,
        text,
      });

      setMessages((prev) => [...prev, savedMsg]);
      if (!textToSend) setInputVal('');
    } catch (err: any) {
      alert(`Could not deliver message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const quickReplies = [
    "On my way down now!",
    "I'm near the juice counter",
    "Wearing a dark blue shirt",
    "Order me a hot filter coffee please!",
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
      <div 
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900 border-l border-stone-200 dark:border-slate-800 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-stone-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${activePost.userAvatarBg} text-sm font-bold text-white shadow-xs`}>
              {activePost.userName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {activePost.userName}
                </span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activePost.userRole}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-stone-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Break Context Card */}
        <div className="border-b border-stone-200 bg-stone-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Coffee className="h-4 w-4 text-orange-600" />
              <span>{activePost.breakType.toUpperCase()} Break</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-orange-600 dark:text-orange-400">
              <Zap className="h-3 w-3 fill-current" />
              <span>{activePost.timeLabel}</span>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{activePost.locationName} ({activePost.zone})</span>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.id;

            if (msg.isSystem) {
              return (
                <div key={msg.id} className="my-2 text-center">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                    isMe
                      ? 'bg-orange-600 text-white rounded-br-xs'
                      : 'bg-stone-100 text-slate-900 dark:bg-slate-800 dark:text-white rounded-bl-xs'
                  }`}
                >
                  {msg.text}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                  <span>{msg.timestamp}</span>
                  {isMe && <CheckCheck className="h-3 w-3 text-orange-600 dark:text-orange-400" />}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="border-t border-stone-100 px-4 pt-2 dark:border-slate-800">
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
            {quickReplies.map((r, i) => (
              <button
                key={i}
                disabled={isSending}
                onClick={() => handleSend(r)}
                className="shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-slate-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="border-t border-stone-200 p-3.5 dark:border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={`Message ${activePost.userName.split(' ')[0]}...`}
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isSending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-xs hover:bg-orange-700 disabled:opacity-40 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
