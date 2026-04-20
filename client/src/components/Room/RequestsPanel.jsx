import { UserCheck, X } from 'lucide-react'

export default function RequestsPanel({
  requests = [],
  onDecideRequest,
  onClose,
}) {
  return (
    <div className="flex flex-col w-72 bg-editor-sidebar border-l border-editor-border h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="text-editor-accent" />
          <span className="text-xs font-medium text-editor-text">Requests</span>
          {requests.length > 0 && (
            <span className="text-[10px] text-editor-bg bg-editor-accent rounded px-1.5 py-0.5">
              {requests.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-editor-muted hover:text-editor-text transition-colors"
          title="Close requests"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {requests.length === 0 ? (
          <p className="text-xs text-editor-muted text-center">No pending requests</p>
        ) : (
          requests.map((request) => (
            <div
              key={request.userId}
              className="border border-editor-border rounded-lg p-2.5 bg-editor-bg"
            >
              <p className="text-xs text-editor-text truncate mb-2">
                {request.username}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onDecideRequest?.(request.userId, true)}
                  className="flex-1 px-2 py-1.5 rounded bg-editor-accent text-editor-bg text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => onDecideRequest?.(request.userId, false)}
                  className="flex-1 px-2 py-1.5 rounded text-editor-muted hover:text-editor-text hover:bg-editor-border text-xs transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
