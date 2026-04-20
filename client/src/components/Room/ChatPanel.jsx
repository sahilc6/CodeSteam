import { useState, useEffect, useRef } from "react";
import { Send, X, MessageCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function ChatPanel({ socket, roomId, username, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    socket.emit("chat-history", { roomId }, (history) => {
      setMessages(history || []);
      setLoading(false);
    });

    const onChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("chat-message", onChatMessage);

    return () => {
      socket.off("chat-message", onChatMessage);
    };
  }, [socket, roomId]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const message = {
      username,
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    socket?.emit("chat-message", { roomId, message }, (ack) => {
      if (ack?.ok) {
        setText("");
      } else {
        toast.error("Failed to send message");
      }
    });
  };

  return (
    <div className="flex flex-col w-72 bg-editor-sidebar border-l border-editor-border h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={13} className="text-editor-muted" />
          <span className="text-xs font-medium text-editor-text">Chat</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-editor-muted hover:text-editor-text hover:bg-editor-border transition-colors"
          title="Close chat"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {loading ? (
          <p className="text-xs text-editor-muted text-center">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-editor-muted text-center">
            No messages yet
          </p>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.username === username;

            return (
              <div
                key={idx}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] text-xs ${
                    isMe
                      ? "text-editor-text"
                      : "text-editor-text"
                  }`}
                >
                  <div
                    className={`flex items-center gap-1.5 mb-0.5 min-w-0 ${
                      isMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isMe && (
                      <span className="font-medium text-editor-text truncate">
                        {msg.username}
                      </span>
                    )}
                    <span
                      className={`text-[10px] shrink-0 ${
                        isMe ? "text-editor-muted" : "text-editor-muted"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="break-words whitespace-pre-wrap leading-5">
                    {msg.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSendMessage}
        className="border-t border-editor-border p-2 shrink-0 flex gap-1.5"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          className="flex-1 text-xs px-2.5 py-1.5 bg-editor-bg border border-editor-border text-editor-text rounded focus:outline-none focus:border-editor-accent placeholder:text-editor-muted"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="p-1.5 bg-editor-accent text-editor-bg rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          title="Send message"
        >
          <Send size={12} />
        </button>
      </form>
    </div>
  );
}
