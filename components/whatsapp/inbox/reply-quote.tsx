"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";

interface ReplyQuoteProps {
  authorLabel: string;
  preview: string;
  onDismiss?: () => void;
}

export function ReplyQuote({
  authorLabel,
  preview,
  onDismiss,
}: ReplyQuoteProps) {
  const isChip = !!onDismiss;

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-l-2 border-violet-400 px-2 py-1",
        isChip
          ? "rounded-md bg-slate-800/80"
          : "mb-1.5 rounded-md bg-slate-800/70",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-violet-300">
          {authorLabel}
        </div>
        <div className="truncate text-xs text-slate-200/80">{preview}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cancel reply"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function buildReplyPreview(message: Message): string {
  if (message.content_text) return message.content_text;

  switch (message.content_type) {
    case "image":
      return "[Image]";
    case "video":
      return "[Video]";
    case "audio":
      return "[Audio]";
    case "document":
      return "[Document]";
    case "location":
      return "[Location]";
    case "template":
      return "[Template]";
    default:
      return "[Message]";
  }
}
