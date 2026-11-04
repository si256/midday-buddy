import React from 'react';
import { X, CloudLightning, CheckCircle2, Copy, Check, Terminal, Shield, Database, Globe } from 'lucide-react';

interface ZeroCostArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ZeroCostArchitectureModal: React.FC<ZeroCostArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedWrangler, setCopiedWrangler] = React.useState(false);

  if (!isOpen) return null;

  const sampleWrangler = `name = "midday-buddy"
main = "src/server/index.ts"
compatibility_date = "2026-03-01"
compatibility_flags = ["nodejs_compat"]

[site]
bucket = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "midday-buddy-prod"
database_id = "your-d1-database-id"

[vars]
ENVIRONMENT = "production"
JWT_SECRET = "your-secure-secret-token"`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sampleWrangler);
    setCopiedWrangler(true);
    setTimeout(() => setCopiedWrangler(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div 
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
              <CloudLightning className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">100% Zero-Cost Cloudflare Prototype Blueprint</h2>
              <p className="text-xs text-emerald-100">Verified production deployment with $0.00 infrastructure bill</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Free Tier Breakdown Table */}
          <div className="rounded-2xl border border-stone-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-stone-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Cloudflare Component</th>
                  <th className="py-2.5 px-3">Free Tier Allowance</th>
                  <th className="py-2.5 px-3">Prototype Demand</th>
                  <th className="py-2.5 px-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <td className="py-2.5 px-3 font-semibold flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-500" />
                    Cloudflare Pages
                  </td>
                  <td className="py-2.5 px-3">Unlimited bandwidth, 500 builds/mo</td>
                  <td className="py-2.5 px-3">~20 builds/mo</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-600 text-right">$0.00</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-orange-500" />
                    Cloudflare Workers
                  </td>
                  <td className="py-2.5 px-3">100,000 requests/day, 10ms CPU/req</td>
                  <td className="py-2.5 px-3">~1,500 req/day</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-600 text-right">$0.00</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-purple-500" />
                    Cloudflare D1 (SQL)
                  </td>
                  <td className="py-2.5 px-3">5,000,000 read rows/day, 5 GB storage</td>
                  <td className="py-2.5 px-3">&lt; 30,000 reads/day</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-600 text-right">$0.00</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-500" />
                    Turnstile & SSL
                  </td>
                  <td className="py-2.5 px-3">Free automated SSL & bot mitigation</td>
                  <td className="py-2.5 px-3">Unlimited</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-600 text-right">$0.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Zero-Cost Real-Time Architecture */}
          <div className="rounded-2xl bg-stone-50 p-4 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              How Real-Time Operates at $0 without Paid Durable Objects
            </h4>
            <p>
              While production scale can leverage paid Durable Objects, a prototype achieves instant real-time break notifications and coordination chats via <strong>Server-Sent Events (SSE)</strong> and <strong>WebSocket Hibernation API</strong> directly over Cloudflare Workers free tier. Connections consume zero CPU while idle and stay comfortably within the 100,000 free requests per day limit.
            </p>
          </div>

          {/* Configuration Snippet */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Production wrangler.toml
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {copiedWrangler ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedWrangler ? 'Copied!' : 'Copy Config'}</span>
              </button>
            </div>
            <pre className="rounded-2xl bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed border border-slate-800">
              {sampleWrangler}
            </pre>
          </div>

          {/* Deployment Commands */}
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-white mb-2 block">
              1-Line Deployment Commands
            </span>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="rounded-xl bg-stone-100 p-2.5 dark:bg-slate-800 dark:text-slate-200 text-slate-800">
                # 1. Create D1 database<br/>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">npx wrangler d1 create midday-buddy-prod</span>
              </div>
              <div className="rounded-xl bg-stone-100 p-2.5 dark:bg-slate-800 dark:text-slate-200 text-slate-800">
                # 2. Apply initial SQL schema<br/>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">npx wrangler d1 execute midday-buddy-prod --file=./migrations/0001_initial_schema.sql</span>
              </div>
              <div className="rounded-xl bg-stone-100 p-2.5 dark:bg-slate-800 dark:text-slate-200 text-slate-800">
                # 3. Deploy Pages & Worker Edge to Cloudflare<br/>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">npm run build && npx wrangler deploy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 dark:bg-slate-900 border-t border-stone-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};
