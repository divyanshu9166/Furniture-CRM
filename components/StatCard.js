import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ title, value, change, changeType, icon: Icon, color = 'accent' }) {
  const colorMap = {
    accent: { bg: 'bg-accent-light', text: 'text-accent' },
    teal: { bg: 'bg-teal-light', text: 'text-teal' },
    purple: { bg: 'bg-purple-light', text: 'text-purple' },
    success: { bg: 'bg-success-light', text: 'text-success' },
    info: { bg: 'bg-info-light', text: 'text-info' },
    pink: { bg: 'bg-pink-light', text: 'text-pink' },
  };

  const c = colorMap[color] || colorMap.accent;

  return (
    <div className="glass-card p-3 md:p-5 flex items-start justify-between animate-[slide-up_0.3s_ease-out] cursor-default">
      <div className="space-y-1 md:space-y-1.5 min-w-0">
        <p className="text-[10px] md:text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</p>
        <p className="text-lg md:text-2xl font-bold text-foreground tracking-tight">{value}</p>
        {change && (
          <div className={`flex items-center gap-1 text-[10px] md:text-xs font-medium ${changeType === 'up' ? 'text-success' : 'text-danger'}`}>
            {changeType === 'up' ? <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5" /> : <TrendingDown className="w-3 h-3 md:w-3.5 md:h-3.5" />}
            <span>{change}</span>
            <span className="text-muted ml-1 hidden sm:inline">vs last week</span>
          </div>
        )}
      </div>
      <div className={`p-2 md:p-2.5 rounded-xl ${c.bg}`}>
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${c.text}`} />
      </div>
    </div>
  );
}
