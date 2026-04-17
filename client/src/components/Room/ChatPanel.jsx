import { useState, useEffect, useRef } from 'react'
import { Send, X, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ChatPanel({ socket, roomId, username, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load chat history and listen for new messages
  useEffect(() => {
    if (!socket) return

    // Request chat history
    socket.emit('chat-history', { roomId }, (history) => {
      setMessages(history || [])
      setLoading(false)
    })

    // Listen for new messages from others
    socket.on('chat-message', (msg) => {
      setMessages(prev => [...prev, msg])
    })

    return () => {
      socket.off('chat-message')
    }
  }, [socket, roomId])

  const handleSendMessage = (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    const message = {
      username,
      text: trimmed,
      timestamp: new Date().toISOString(),
    }

    socket?.emit('chat-message', { roomId, message }, (ack) => {
      if (ack?.ok) {
        setText('')
      } else {
        toast.error('Failed to send message')
      }
    })
  }

  return (
    <div className="flex flex-col w-72 bg-editor-sidebar border-l border-editor-border h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-editor-accent" />
          <span className="text-xs font-medium text-editor-text">Chat</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-editor-muted hover:text-editor-text transition-colors"
          title="Close chat"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {loading ? (
          <p className="text-xs text-editor-muted text-center">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-editor-muted text-center">No messages yet</p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className="text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="font-medium text-editor-accent truncate flex-shrink-0">
                  {msg.username}
                </span>
                <span className="text-editor-muted text-[10px] flex-shrink-0">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-editor-text break-words whitespace-pre-wrap mt-0.5">
                {msg.text}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSendMessage}
        className="border-t border-editor-border p-2 shrink-0 flex gap-1.5"
      >
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Message…"
          className="flex-1 text-xs px-2 py-1.5 bg-editor-bg border border-editor-border text-editor-text rounded focus:outline-none focus:border-editor-accent"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="p-1.5 bg-editor-accent text-editor-bg rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          title="Send message"
        >
          <Send size={12} />
        </button>
      </form>
    </div>
  )
}
