"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Conversation, Message, Contact, ConversationStatus } from "@/types";
import { useRealtime } from "@/hooks/use-realtime";
import { ConversationList } from "@/components/whatsapp/inbox/conversation-list";
import { MessageThread } from "@/components/whatsapp/inbox/message-thread";
import { ContactSidebar } from "@/components/whatsapp/inbox/contact-sidebar";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function InboxTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * `?c=<id>` deep-link support. Used when landing here from the
   * dashboard's recent-conversations list so the right thread opens
   * automatically instead of showing the empty center panel.
   */
  const deepLinkConvId = searchParams.get("c");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null
  );

  // Fire the deep-link auto-select exactly once per URL — subsequent
  // list refreshes (realtime, manual refetch) must not snap the user
  // back to the deep-linked conversation if they've already clicked
  // elsewhere.
  const autoSelectedForDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/whatsapp/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setWhatsappConnected(data?.connected === true))
      .catch(() => setWhatsappConnected(false));
  }, []);

  // ── Realtime event handlers ────────────────────────────────────────────

  const handleMessageEvent = useCallback(
    (event: { eventType: string; new: Message; old: Partial<Message> }) => {
      const newMsg = event.new;
      if (!newMsg) return;

      if (event.eventType === "INSERT") {
        // Add to messages if it belongs to the currently active conversation
        if (activeConversation && newMsg.conversation_id === activeConversation.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic bubble if one exists
            const withoutOptimistic = prev.filter((m) => !m.id.startsWith("temp-"));
            return [...withoutOptimistic, newMsg];
          });
        }

        // Always update the conversation list preview for any conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === newMsg.conversation_id
              ? {
                  ...c,
                  last_message_text: newMsg.content_text ?? "",
                  last_message_at: newMsg.created_at,
                  unread_count:
                    activeConversation?.id === newMsg.conversation_id
                      ? 0
                      : (c.unread_count ?? 0) + 1,
                }
              : c
          )
        );
      }

      if (event.eventType === "UPDATE") {
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [activeConversation]
  );

  const handleConversationEvent = useCallback(
    (event: { eventType: string; new: Conversation; old: Partial<Conversation> }) => {
      const conv = event.new;
      if (!conv) return;

      if (event.eventType === "INSERT") {
        setConversations((prev) => {
          if (prev.some((c) => c.id === conv.id)) return prev;
          return [conv, ...prev];
        });
      }

      if (event.eventType === "UPDATE") {
        setConversations((prev) =>
          prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c))
        );
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) => (prev ? { ...prev, ...conv } : prev));
        }
      }
    },
    [activeConversation]
  );

  // Wire up the WebSocket gateway
  useRealtime({
    channelName: "inbox-realtime",
    onMessageEvent: handleMessageEvent,
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);
      if (
        deepLinkConvId &&
        autoSelectedForDeepLinkRef.current !== deepLinkConvId &&
        loaded.length > 0
      ) {
        autoSelectedForDeepLinkRef.current = deepLinkConvId;
        if (activeConversation?.id === deepLinkConvId) return;
        const match = loaded.find((c) => c.id === deepLinkConvId);
        if (match) {
          setActiveConversation(match);
          setActiveContact(match.contact ?? null);
          setMessages([]);
        }
      }
    },
    [deepLinkConvId, activeConversation?.id]
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      if (activeConversation?.id === conv.id) return;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setMessages([]);
      autoSelectedForDeepLinkRef.current = conv.id;
      router.replace(`/whatsapp-marketing?tab=inbox&c=${conv.id}`, { scroll: false });
    },
    [activeConversation?.id, router]
  );

  const handleCloseConversation = useCallback(() => {
    setActiveConversation(null);
    setActiveContact(null);
    setMessages([]);
    autoSelectedForDeepLinkRef.current = null;
    router.replace("/whatsapp-marketing?tab=inbox", { scroll: false });
  }, [router]);

  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages(loaded);
  }, []);

  const handleNewMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  const handleNeedsHumanChange = useCallback(
    (conversationId: string, needsHuman: boolean) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, needs_human: needsHuman } : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev ? { ...prev, needs_human: needsHuman } : prev
        );
      }
    },
    [activeConversation]
  );

  const hasActiveConv = !!activeConversation;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* WhatsApp connection banner */}
      {whatsappConnected === false && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <WifiOff className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-400">
            WhatsApp® is not connected. Go to Settings to connect your account.
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel: Conversation list */}
        <div
          className={cn(
            "h-full min-h-0 min-w-0 flex-col",
            "w-full lg:w-[320px] lg:flex-none",
            hasActiveConv ? "hidden lg:flex" : "flex",
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
          />
        </div>

        {/* Center panel: Message thread */}
        <div
          className={cn(
            "h-full min-h-0 min-w-0 flex-1 flex-col",
            hasActiveConv ? "flex" : "hidden lg:flex",
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onNeedsHumanChange={handleNeedsHumanChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only */}
        <div className="hidden h-full min-h-0 flex-col shrink-0 lg:flex">
          <ContactSidebar contact={activeContact} />
        </div>
      </div>
    </div>
  );
}
