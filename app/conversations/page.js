'use client';

import { useState } from 'react';
import { MessageSquare, Instagram, Globe, Bot, User, Search, Filter } from 'lucide-react';
import { conversations, channelFilters } from '@/data/conversations';

const channelIcons = {
  WhatsApp: MessageSquare,
  Instagram: Instagram,
  Website: Globe,
};

const channelColors = {
  WhatsApp: 'text-success bg-success-light',
  Instagram: 'text-pink bg-pink-light',
  Website: 'text-teal bg-teal-light',
};

const statusColors = {
  'AI Handled': 'bg-success-light text-success',
  'Needs Human': 'bg-warning-light text-warning',
};

export default function ConversationsPage() {
  const [selectedConvo, setSelectedConvo] = useState(conversations[0]);
  const [channelFilter, setChannelFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c =>
    (channelFilter === 'All' || c.channel === channelFilter) &&
    c.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-[fade-in_0.5s_ease-out]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Conversations</h1>
        <p className="text-sm text-muted mt-1">AI-powered customer chat across all channels</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 glass-card overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
        {/* Conversation List */}
        <div className="border-r border-border flex flex-col">
          {/* Search & Filters */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-surface rounded-xl border border-border text-sm" />
            </div>
            <div className="flex gap-1">
              {channelFilters.map(f => (
                <button key={f} onClick={() => setChannelFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${channelFilter === f ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{f}</button>
              ))}
            </div>
          </div>

          {/* Conversation items */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map(convo => {
              const ChannelIcon = channelIcons[convo.channel];
              const isSelected = selectedConvo?.id === convo.id;
              const lastMsg = convo.messages[convo.messages.length - 1];

              return (
                <div
                  key={convo.id}
                  onClick={() => setSelectedConvo(convo)}
                  className={`flex items-start gap-3 p-4 cursor-pointer border-b border-border transition-colors ${
                    isSelected ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface-hover border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent flex-shrink-0">
                    {convo.customer.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">{convo.customer}</p>
                      <span className="text-[10px] text-muted flex-shrink-0">{convo.date}</span>
                    </div>
                    <p className="text-xs text-muted truncate mb-1.5">{lastMsg.text.slice(0, 60)}...</p>
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${channelColors[convo.channel]}`}>
                        <ChannelIcon className="w-3 h-3" />
                      </div>
                      <span className={`badge text-[10px] ${statusColors[convo.status]}`}>{convo.status}</span>
                      {convo.unread > 0 && (
                        <span className="ml-auto w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">{convo.unread}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Window */}
        <div className="lg:col-span-2 flex flex-col">
          {selectedConvo ? (
            <>
              {/* Chat Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent">
                    {selectedConvo.customer.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{selectedConvo.customer}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">via {selectedConvo.channel}</span>
                      <span className={`badge text-[10px] ${statusColors[selectedConvo.status]}`}>{selectedConvo.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {selectedConvo.messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.from === 'bot' ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.from === 'bot' ? 'bg-accent/20' : 'bg-teal-light'
                    }`}>
                      {msg.from === 'bot' ? <Bot className="w-4 h-4 text-accent" /> : <User className="w-4 h-4 text-teal" />}
                    </div>
                    <div className={`max-w-[75%] ${msg.from === 'bot' ? '' : 'text-right'}`}>
                      <div className={`inline-block p-3.5 rounded-2xl text-sm leading-relaxed ${
                        msg.from === 'bot'
                          ? 'bg-surface border border-border text-foreground rounded-tl-md'
                          : 'bg-accent/10 border border-accent/20 text-foreground rounded-tr-md'
                      }`}>
                        <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                      </div>
                      <p className={`text-[10px] text-muted mt-1 ${msg.from === 'bot' ? '' : 'text-right'}`}>{msg.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <div className="px-5 py-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <input type="text" placeholder="Type a reply or let AI handle it..." className="flex-1 py-2.5 px-4 bg-surface rounded-xl border border-border text-sm" />
                  <button className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2">
                    Send
                  </button>
                </div>
                <p className="text-[10px] text-muted mt-2 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> AI is actively monitoring this conversation
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
