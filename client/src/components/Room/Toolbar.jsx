import {
  Copy,
  Play,
  ChevronDown,
  Wifi,
  WifiOff,
  TerminalSquare,
  Home,
  Loader2,
  X,
  MessageCircle,
} from "lucide-react";

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "bash", label: "Bash" },
];

export default function Toolbar({
  roomId,
  language,
  onLanguageChange,
  onRun,
  onCopyLink,
  onLeaveRoom,
  onEndRoom,
  role,
  executing,
  ending,
  connected,
  userCount,
  showOutput,
  onToggleOutput,
  showChat,
  onToggleChat,
}) {
  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-editor-sidebar border-b border-editor-border shrink-0 select-none">
      <button
        onClick={onLeaveRoom}
        className="flex items-center gap-1.5 text-editor-accent font-bold text-sm tracking-tight hover:opacity-80 transition-opacity mr-1"
        title="Leave room"
      >
        <Home size={14} />
        CodeSteam
      </button>

      <div className="w-px h-4 bg-editor-border" />

      <button
        onClick={onCopyLink}
        title="Copy room ID"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-editor-muted text-xs hover:text-editor-text hover:bg-editor-border transition-colors font-mono"
      >
        <span className="truncate max-w-[130px]">{roomId}</span>
        <Copy size={11} />
      </button>

      <div className="flex-1" />

      <div className="relative">
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="appearance-none bg-editor-bg border border-editor-border text-editor-text text-xs rounded px-2.5 py-1.5 pr-6 cursor-pointer focus:outline-none focus:border-editor-accent hover:border-editor-accent transition-colors"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={11}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-editor-muted pointer-events-none"
        />
      </div>

      <button
        onClick={onToggleOutput}
        title="Terminal"
        className={`p-1.5 rounded transition-colors ${
          showOutput
            ? "text-editor-accent bg-editor-border"
            : "text-editor-muted hover:text-editor-text hover:bg-editor-border"
        }`}
      >
        <TerminalSquare size={15} />
      </button>

      <button
        onClick={onToggleChat}
        title="Chat"
        className={`p-1.5 rounded transition-colors ${
          showChat
            ? "text-editor-accent bg-editor-border"
            : "text-editor-muted hover:text-editor-text hover:bg-editor-border"
        }`}
      >
        <MessageCircle size={15} />
      </button>

      <button
        onClick={onRun}
        disabled={executing}
        title={executing ? "Running..." : "Run code"}
        className={`p-1.5 rounded transition-colors ${
          executing
            ? "text-editor-accent bg-editor-border"
            : "text-editor-muted hover:text-editor-text hover:bg-editor-border"
        } disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {executing ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Play size={15} />
        )}
      </button>

      {role === "creator" ? (
        <>
          <button
            onClick={onLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 text-editor-muted hover:text-editor-text hover:bg-editor-border text-xs font-medium rounded transition-colors"
          >
            Leave
          </button>
          <button
            onClick={onEndRoom}
            disabled={ending}
            title="End room"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {ending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Ending...
              </>
            ) : (
              <>
                <X size={13} /> End
              </>
            )}
          </button>
        </>
      ) : (
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1.5 px-3 py-1.5 text-editor-muted hover:text-editor-text hover:bg-editor-border text-xs font-medium rounded transition-colors"
        >
          Leave
        </button>
      )}

      <div className="w-px h-4 bg-editor-border" />

      <div className="flex items-center gap-1.5 text-xs text-editor-muted pr-1">
        {connected ? (
          <Wifi size={13} className="text-editor-green" />
        ) : (
          <WifiOff size={13} className="text-editor-red animate-pulse" />
        )}
        <span>{userCount} online</span>
      </div>
    </header>
  );
}
