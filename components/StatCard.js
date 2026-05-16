import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ title, value, change, changeType, icon: Icon, color = 'accent', trendText = 'vs last week' }) {
  const colorMap = {
    accent:  { bg: 'bg-accent-light',   text: 'text-accent',   border: 'border-accent/20' },
    teal:    { bg: 'bg-teal-light',     text: 'text-teal',     border: 'border-teal/20' },
    purple:  { bg: 'bg-purple-light',   text: 'text-purple',   border: 'border-purple/20' },
    success: { bg: 'bg-success-light',  text: 'text-success',  border: 'border-success/20' },
    info:    { bg: 'bg-info-light',     text: 'text-info',     border: 'border-info/20' },
    pink:    { bg: 'bg-pink-light',     text: 'text-pink',     border: 'border-pink/20' },
  };

  const c = colorMap[color] || colorMap.accent;

  return (
    <div className="glass-card p-3 md:p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-2.5 animate-[slide-up_0.3s_ease-out] cursor-default active:scale-[0.98] transition-transform">
      {/* Mobile: icon row + value stacked */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider leading-tight">{title}</p>
        <div className={`p-2 rounded-xl ${c.bg} ${c.border} border`}>
          <Icon className={`w-3.5 h-3.5 ${c.text}`} />
        </div>
      </div>

      <div className="space-y-0.5 md:space-y-1.5 min-w-0">
        {/* Desktop title */}
        <p className="hidden md:block text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</p>
        <p className="text-xl md:text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
        {change && (
          <div className={`flex items-center gap-1 text-[10px] md:text-xs font-medium ${changeType === 'up' ? 'text-success' : 'text-danger'}`}>
            {changeType === 'up'
              ? <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5 flex-shrink-0" />
              : <TrendingDown className="w-3 h-3 md:w-3.5 md:h-3.5 flex-shrink-0" />}
            <span>{change}</span>
            {trendText && <span className="text-muted ml-0.5 hidden sm:inline">{trendText}</span>}
          </div>
        )}
      </div>

      {/* Desktop icon */}
      <div className={`hidden md:flex p-2.5 rounded-xl ${c.bg} flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
    </div>
  );
}
