import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={key++} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-4 my-1 space-y-0.5`}>
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{renderInline(item)}</li>
          ))}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const ulMatch = line.match(/^[-*•]\s+(.+)/);
    const olMatch = line.match(/^\d+[.)]\s+(.+)/);

    if (ulMatch) {
      if (listType === 'ol') flushList();
      listType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      if (listType === 'ul') flushList();
      listType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();

    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1.5" />);
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      elements.push(<p key={key++} className="font-semibold text-sm mt-1.5 mb-0.5">{renderInline(h3Match[1])}</p>);
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      elements.push(<p key={key++} className="font-bold text-sm mt-2 mb-0.5">{renderInline(h2Match[1])}</p>);
      continue;
    }
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      elements.push(<p key={key++} className="font-bold text-[15px] mt-2 mb-1">{renderInline(h1Match[1])}</p>);
      continue;
    }

    elements.push(<p key={key++} className="text-sm leading-relaxed">{renderInline(line)}</p>);
  }

  flushList();
  return <>{elements}</>;
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    let firstMatch: { index: number; length: number; type: string; content: string } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      firstMatch = { index: boldMatch.index, length: boldMatch[0].length, type: 'bold', content: boldMatch[1] };
    }
    if (italicMatch && italicMatch.index !== undefined) {
      if (!firstMatch || italicMatch.index < firstMatch.index) {
        firstMatch = { index: italicMatch.index, length: italicMatch[0].length, type: 'italic', content: italicMatch[1] };
      }
    }
    if (codeMatch && codeMatch.index !== undefined) {
      if (!firstMatch || codeMatch.index < firstMatch.index) {
        firstMatch = { index: codeMatch.index, length: codeMatch[0].length, type: 'code', content: codeMatch[1] };
      }
    }

    if (!firstMatch) {
      parts.push(remaining);
      break;
    }

    if (firstMatch.index > 0) {
      parts.push(remaining.substring(0, firstMatch.index));
    }

    if (firstMatch.type === 'bold') {
      parts.push(<strong key={k++} className="font-semibold">{firstMatch.content}</strong>);
    } else if (firstMatch.type === 'italic') {
      parts.push(<em key={k++}>{firstMatch.content}</em>);
    } else if (firstMatch.type === 'code') {
      parts.push(<code key={k++} className="px-1 py-0.5 rounded bg-foreground/10 text-xs font-mono">{firstMatch.content}</code>);
    }

    remaining = remaining.substring(firstMatch.index + firstMatch.length);
  }

  return parts;
}

interface AIChatBotProps {
  rollNo: string | null;
  studentName?: string;
}

const RATE_LIMIT_MS = 3000;

export function AIChatBot({ rollNo, studentName }: AIChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setMessages([]);
  }, [rollNo]);

  const sendMessageDirect = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !rollNo || isLoading) return;

    const now = Date.now();
    if (now - lastSentAt < RATE_LIMIT_MS) return;
    setLastSentAt(now);

    const userMessage = messageText.trim();
    setInput("");

    const currentMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(currentMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rollNo,
          message: userMessage,
          history: currentMessages.slice(-8),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || "Something went wrong. Try again." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [rollNo, isLoading, messages, lastSentAt]);

  const sendMessage = useCallback(() => {
    sendMessageDirect(input);
  }, [input, sendMessageDirect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = [
    "Mera attendance kaisa hai?",
    "Kya main clear kar paunga?",
    "Kitne classes miss kar sakta hoon?",
    "This week ka status?",
  ];

  if (!rollNo) return null;

  return createPortal(
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-[9999] w-12 h-12 rounded-full shadow-xl bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        data-testid="button-chat-toggle"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {isOpen && (
        <Card className="fixed bottom-20 right-5 z-[9999] w-[calc(100vw-2.5rem)] max-w-sm flex flex-col shadow-2xl border overflow-visible"
          style={{ height: "min(70vh, 500px)" }}
        >
          <div className="flex items-center gap-2 p-3 border-b bg-primary/5 rounded-t-md">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="text-chat-title">PEP AI Assistant</p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-chat-student">
                {studentName || rollNo}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3" data-testid="chat-messages">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground text-center" data-testid="text-chat-welcome">
                  Hi {studentName?.split(' ')[0] || 'there'}! Ask me anything about your PEP attendance.
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {quickQuestions.map((q, i) => (
                    <Badge
                      key={q}
                      variant="outline"
                      className="cursor-pointer text-xs"
                      onClick={() => sendMessageDirect(q)}
                      data-testid={`button-quick-q-${i}`}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md text-sm whitespace-pre-wrap"
                      : "bg-muted rounded-bl-md"
                  }`}
                  data-testid={`chat-message-${msg.role}-${i}`}
                >
                  {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-md">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your attendance..."
                disabled={isLoading}
                className="text-sm"
                data-testid="input-chat-message"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>,
    document.body
  );
}
