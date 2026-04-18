import { UserMinus, Users } from 'lucide-react'

export default function UserList({
  users,
  role,
  allowedUsers = [],
  onRemoveJoiner,
}) {
  const joiners = allowedUsers.filter(member => member.userId)

  return (
    <aside className="w-48 bg-editor-sidebar border-l border-editor-border flex flex-col shrink-0">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-editor-border">
        <Users size={12} className="text-editor-muted shrink-0" />
        <span className="text-xs text-editor-muted font-medium">
          {users.length} online
        </span>
      </div>

      <ul className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {users.map(user => (
          <li
            key={user.socketId}
            className="flex items-center gap-2 px-3 py-1.5 rounded mx-1 hover:bg-editor-border transition-colors"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/20"
              style={{ background: user.color || '#89b4fa' }}
            />
            <span className="text-xs text-editor-text truncate leading-tight">
              {user.username}
            </span>
            {role === 'creator' && user.role !== 'creator' && (
              <button
                type="button"
                onClick={() => onRemoveJoiner?.(user.userId)}
                className="ml-auto text-editor-muted hover:text-editor-red transition-colors"
                title="Remove joiner"
              >
                <UserMinus size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {role === 'creator' && joiners.length > 0 && (
        <div className="border-t border-editor-border p-2">
          <div className="text-[11px] text-editor-muted mb-1 px-1">Allowed</div>
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {joiners.map(member => (
              <div
                key={member.userId}
                className="flex items-center gap-2 px-1 py-1 rounded hover:bg-editor-border"
              >
                <span className="text-xs text-editor-text truncate">
                  {member.username}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveJoiner?.(member.userId)}
                  className="ml-auto text-editor-muted hover:text-editor-red transition-colors"
                  title="Remove joiner"
                >
                  <UserMinus size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
