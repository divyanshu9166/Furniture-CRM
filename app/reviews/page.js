'use client';

import { useState } from 'react';
import { Star, AlertTriangle, Send, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
import { reviews, reviewStats } from '@/data/reviews';

const ratingColors = { 5: 'text-success', 4: 'text-teal', 3: 'text-accent', 2: 'text-warning', 1: 'text-danger' };
const ratingBarColors = { 5: 'bg-success', 4: 'bg-teal', 3: 'bg-accent', 2: 'bg-warning', 1: 'bg-danger' };

export default function ReviewsPage() {
  const [filter, setFilter] = useState('all');
  const [autoRequest, setAutoRequest] = useState(true);
  const negativeReviews = reviews.filter(r => r.rating <= 2);
  const filteredReviews = filter === 'all' ? reviews : filter === 'negative' ? reviews.filter(r => r.rating <= 2) : filter === 'positive' ? reviews.filter(r => r.rating >= 4) : reviews.filter(r => r.rating === 3);

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reviews & Reputation</h1>
          <p className="text-sm text-muted mt-1">Monitor and manage your store reputation</p>
        </div>
        <a href="#" className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-surface-hover transition-colors">
          <ExternalLink className="w-4 h-4" /> View on Google
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Rating Card */}
        <div className="glass-card p-6 text-center">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Google Rating</p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-5xl font-bold text-foreground">{reviewStats.averageRating}</span>
            <Star className="w-8 h-8 text-accent fill-accent" />
          </div>
          <p className="text-sm text-muted">Based on {reviewStats.totalReviews} reviews</p>
          <div className="flex justify-center gap-0.5 mt-3">
            {[1,2,3,4,5].map(i => <Star key={i} className={`w-5 h-5 ${i <= Math.round(reviewStats.averageRating) ? 'text-accent fill-accent' : 'text-border'}`} />)}
          </div>
        </div>

        {/* Distribution */}
        <div className="glass-card p-6">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Rating Distribution</p>
          {[{s:5,c:reviewStats.fiveStars},{s:4,c:reviewStats.fourStars},{s:3,c:reviewStats.threeStars},{s:2,c:reviewStats.twoStars},{s:1,c:reviewStats.oneStars}].map(({s,c}) => (
            <div key={s} className="flex items-center gap-3 mb-2.5">
              <span className="text-xs font-medium text-muted w-3">{s}</span>
              <Star className="w-3.5 h-3.5 text-accent fill-accent" />
              <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${ratingBarColors[s]}`} style={{width:`${(c/reviewStats.totalReviews)*100}%`}} />
              </div>
              <span className="text-xs text-muted w-8 text-right">{c}</span>
            </div>
          ))}
        </div>

        {/* Automation */}
        <div className="glass-card p-6">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Review Automation</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface">
              <div><p className="text-sm font-medium text-foreground">Auto-request reviews</p><p className="text-xs text-muted">Send after delivery</p></div>
              <button onClick={() => setAutoRequest(!autoRequest)} className="text-accent">
                {autoRequest ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-muted" />}
              </button>
            </div>
            <div className="p-3 rounded-xl bg-surface">
              <p className="text-xs text-muted mb-2">Message template</p>
              <p className="text-xs text-foreground">&quot;Thank you for your purchase! Please leave a Google review. ⭐&quot;</p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-success-light/50">
              <Send className="w-4 h-4 text-success" />
              <p className="text-xs text-success font-medium">42 review requests sent this month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Negative Alerts */}
      {negativeReviews.length > 0 && (
        <div className="glass-card p-5 border-l-4 border-l-danger">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-danger" />
            <h2 className="text-base font-semibold text-foreground">Negative Review Alerts</h2>
            <span className="badge bg-danger-light text-danger">{negativeReviews.length}</span>
          </div>
          <div className="space-y-3">
            {negativeReviews.map(r => (
              <div key={r.id} className="p-4 rounded-xl bg-surface border border-danger/10">
                <div className="flex items-start justify-between mb-2">
                  <div><p className="text-sm font-medium text-foreground">{r.customer}</p><p className="text-xs text-muted">{r.product} · {r.date}</p></div>
                  <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= r.rating ? 'text-danger fill-danger' : 'text-border'}`} />)}</div>
                </div>
                <p className="text-sm text-foreground mb-2">{r.text}</p>
                {!r.replied && <button className="text-xs text-accent hover:text-accent-hover font-medium">Reply →</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + List */}
      <div className="flex gap-2">
        {[{k:'all',l:'All'},{k:'positive',l:'4-5 ★'},{k:'neutral',l:'3 ★'},{k:'negative',l:'1-2 ★'}].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.k ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{f.l}</button>
        ))}
      </div>
      <div className="space-y-3">
        {filteredReviews.map(r => (
          <div key={r.id} className="glass-card p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent">{r.customer.split(' ').map(n => n[0]).join('')}</div>
                <div><p className="text-sm font-semibold text-foreground">{r.customer}</p><p className="text-xs text-muted">{r.product} · {r.date}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className={`w-4 h-4 ${i <= r.rating ? `${ratingColors[r.rating]} fill-current` : 'text-border'}`} />)}</div>
                {r.replied && <span className="badge bg-success-light text-success text-[10px]">Replied</span>}
              </div>
            </div>
            <p className="text-sm text-foreground">{r.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
