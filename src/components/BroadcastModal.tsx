import React from 'react';
import { X, Coffee, Utensils, Footprints, MapPin, Clock, Sparkles } from 'lucide-react';
import { BreakType, BreakAvailabilityStatus, CampusLocation, UserProfile } from '../types';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  locations: CampusLocation[];
  onBroadcast: (postData: {
    breakType: BreakType;
    durationMinutes: number;
    locationName: string;
    zone: string;
    customNote: string;
  }) => void;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  locations,
  onBroadcast,
}) => {
  const [breakType, setBreakType] = React.useState<BreakType>('tea');
  const [durationMinutes, setDurationMinutes] = React.useState<number>(15);
  const [selectedLocationId, setSelectedLocationId] = React.useState(locations[0]?.id || '');
  const [customNote, setCustomNote] = React.useState('');

  if (!isOpen) return null;

  // Auto-set recommended duration based on break type
  const handleSelectType = (type: BreakType) => {
    setBreakType(type);
    if (type === 'tea') setDurationMinutes(15);
    else if (type === 'lunch') setDurationMinutes(30);
    else if (type === 'walk') setDurationMinutes(20);
    else if (type === 'sports') setDurationMinutes(45);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];

    onBroadcast({
      breakType,
      durationMinutes,
      locationName: loc ? loc.name : 'Central Spine Kiosk',
      zone: loc ? loc.zone : 'Central Spine',
      customNote: customNote.trim() || `Stepping out for a quick ${breakType} break!`,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 p-6 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Broadcast Your Break
            </h2>
            <p className="text-xs text-slate-500">
              Post availability so campus colleagues along the Spine can join.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-slate-500 hover:bg-stone-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 1. Break Type Segmented Controls */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              1. Break Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectType('tea')}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-xs font-semibold transition-all ${
                  breakType === 'tea'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 shadow-xs'
                    : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Coffee className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span>Tea Break</span>
                <span className="text-[10px] text-slate-400 font-normal">15 min</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectType('lunch')}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-xs font-semibold transition-all ${
                  breakType === 'lunch'
                    ? 'border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200 shadow-xs'
                    : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Utensils className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <span>Lunch Break</span>
                <span className="text-[10px] text-slate-400 font-normal">30 min</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectType('walk')}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-xs font-semibold transition-all ${
                  breakType === 'walk'
                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200 shadow-xs'
                    : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Footprints className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <span>Campus Walk</span>
                <span className="text-[10px] text-slate-400 font-normal">20 min</span>
              </button>
            </div>
          </div>

          {/* 2. Duration */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              2. How long are you stepping out?
            </label>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {[15, 20, 30, 45].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMinutes(mins)}
                  className={`rounded-xl border p-2.5 font-semibold transition-colors ${
                    durationMinutes === mins
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'border-stone-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  {mins} mins
                </button>
              ))}
            </div>
          </div>

          {/* 3. Spot Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              3. Meeting Spot along Central Spine / Cafeteria
            </label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white p-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.zone})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Quick Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              4. Note / Cuisine Craving (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Heading for ginger tea and fresh air before my 3 PM meeting!"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              className="w-full rounded-xl border border-stone-200 p-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
            >
              Broadcast My Break
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
