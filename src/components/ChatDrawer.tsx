import React from 'react';
import { X, Send, MapPin, Coffee, Zap, CheckCheck } from 'lucide-react';
import { BreakPost, ChatMessage, UserProfile } from '../types';
import { StorageService } from '../services/storage';

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
  const [isTyping, setIsTyping] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const conversationId = activePost
    ? `conv_${[currentUser.id, activePost.userId].sort().join('_')}`
    : '';

  // Load conversation messages from storage when opened
  React.useEffect(() => {
    if (activePost && isOpen && conversationId) {
      const storedMessages = StorageService.getMessages(conversationId);
      if (storedMessages.length > 0) {
        setMessages(storedMessages);
      } else {
        // Initialize new conversation
        const initialSystemMsg: ChatMessage = {
          id: `msg_sys_${Date.now()}`,
          conversationId,
          senderId: 'system',
          senderName: 'MidDay Buddy',
          text: `You connected with ${activePost.userName} for a ${activePost.breakType === 'tea' ? 'Tea Break' : 'Lunch Break'} at ${activePost.locationName}!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSystem: true,
        };

        const initialGreeting: ChatMessage = {
          id: `msg_init_${Date.now()}`,
          conversationId,
          senderId: currentUser.id,
          senderName: currentUser.name,
          text: `👋 Hey ${activePost.userName.split(' ')[0]}! Up for ${activePost.breakType === 'tea' ? 'chai' : 'lunch'}? Let's catch up at ${activePost.locationName.split('(')[0].trim()}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        StorageService.saveMessage(conversationId, initialSystemMsg);
        StorageService.saveMessage(conversationId, initialGreeting);
        setMessages([initialSystemMsg, initialGreeting]);

        // Simulate peer response after 1.5 seconds
        setIsTyping(true);
        const timer = setTimeout(() => {
          setIsTyping(false);
          const peerReply: ChatMessage = {
            id: `msg_reply_${Date.now()}`,
            conversationId,
            senderId: activePost.userId,
            senderName: activePost.userName,
            text: `Hey ${currentUser.name.split(' ')[0]}! Awesome, I'm heading down right now. I'll be there in 3 minutes!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          StorageService.saveMessage(conversationId, peerReply);
          setMessages((prev) => [...prev, peerReply]);
        }, 1500);

        return () => clearTimeout(timer);
      }
    }
  }, [activePost, isOpen, conversationId]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (!isOpen || !activePost) return null;

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text || !conversationId) return;

    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      conversationId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    StorageService.saveMessage(conversationId, newMsg);
    setMessages((prev) => [...prev, newMsg]);
    if (!textToSend) setInputVal('');

    // Trigger peer reply simulation
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const responses = [
        "Sounds perfect, see you there!",
        "Got it, looking out for you near the counter!",
        "Grabbed a quiet spot, I'm wearing a navy shirt.",
        "Nice, see you in 2 minutes!",
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      const peerMsg: ChatMessage = {
        id: `msg_reply_${Date.now()}`,
        conversationId,
        senderId: activePost.userId,
        senderName: activePost.userName,
        text: randomResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      StorageService.saveMessage(conversationId, peerMsg);
      setMessages((prev) => [...prev, peerMsg]);
    }, 1400);
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
        <div className="flex items-center justify-between border-b border-stone-200 p-4 dark:border-slate-800 bg-stone-50/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${activePost.userAvatarBg} text-sm font-bold text-white shadow-xs`}>
              {activePost.userName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {activePost.userName}
                </h3>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin className="h-3 w-3 text-orange-500" />
                <span className="truncate max-w-[200px]">{activePost.locationName}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Meeting Details Bar */}
        <div className="bg-amber-50/70 border-b border-amber-200/60 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold">
            <Coffee className="h-3.5 w-3.5 text-amber-600" />
            <span>Spontaneous Break: {activePost.breakType.toUpperCase()}</span>
          </div>
          <span className="text-[11px] font-mono-numbers opacity-80">{activePost.timeLabel}</span>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="text-center my-3">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isMe = msg.senderId === currentUser.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    isMe
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-br-xs'
                      : 'bg-stone-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded-bl-xs'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[9px] text-slate-400 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 italic px-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"></span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]"></span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]"></span>
              <span>{activePost.userName.split(' ')[0]} is typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 border-t border-stone-100 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-900/50">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => handleSend(reply)}
                className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-amber-400 hover:text-amber-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap shrink-0 transition-colors"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="border-t border-stone-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={`Message ${activePost.userName.split(' ')[0]}...`}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white disabled:opacity-40 hover:bg-orange-700 transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
