import { Users } from 'lucide-react'

export default function UserList({ users }) {
  return (
    <aside className="w-44 bg-editor-sidebar border-l border-editor-border flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-editor-border">
        <Users size={12} className="text-editor-muted shrink-0" />
        <span className="text-xs text-editor-muted font-medium">
          {users.length} online
        </span>
      </div>

      {/* User list */}
      <ul className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {users.map(user => (
          <li
            key={user.socketId}
            className="flex items-center gap-2 px-3 py-1.5 rounded mx-1 hover:bg-editor-border transition-colors"
          >
            {/* Coloured dot */}
            <span
              className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/20"
              style={{ background: user.color || '#89b4fa' }}
            />
            <span className="text-xs text-editor-text truncate leading-tight">
              {user.username}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
