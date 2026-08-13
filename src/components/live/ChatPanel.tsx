import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ChatMessage } from '../../types';

interface ChatPanelProps {
  sessionId: string;
}

export function ChatPanel({ sessionId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuth();

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (data && !error) {
      setMessages(data as ChatMessage[]);
    }
  };

  useEffect(() => {
    fetchMessages();

    const channel = supabase.channel(`chat:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user || !profile) return;

    const newMessage = {
      session_id: sessionId,
      sender_id: user.id,
      sender_name: profile.name,
      message: inputValue.trim(),
    };

    setInputValue('');
    await supabase.from('chat_messages').insert([newMessage]);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return 'older';
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        Live Chat
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-8)' }}>
            No messages yet. Be the first to say hi! 👋
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-message">
              <span className="chat-message-sender">
                {msg.sender_name}
              </span>
              <span className="chat-message-text">{msg.message}</span>
              <span className="chat-message-time">{formatTime(msg.created_at)}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 'var(--space-2)', flex: 1 }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="chat-input"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || !user}
            className="chat-send-btn"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
