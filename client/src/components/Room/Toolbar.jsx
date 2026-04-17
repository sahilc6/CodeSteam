import { Copy, Play, ChevronDown, Wifi, WifiOff, TerminalSquare, Home, Loader2, X, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const LANGUAGES = [
  { value: 'javascript',  label: 'JavaScript' },
  { value: 'typescript',  label: 'TypeScript' },
  { value: 'python',      label: 'Python'     },
  { value: 'java',        label: 'Java'       },
  { value: 'cpp',         label: 'C++'        },
  { value: 'c',           label: 'C'          },
  { value: 'go',          label: 'Go'         },
  { value: 'rust',        label: 'Rust'       },
  { value: 'ruby',        label: 'Ruby'       },
  { value: 'php',         label: 'PHP'        },
  { value: 'bash',        label: 'Bash'       },
]

export default function Toolbar({
  roomId, language, onLanguageChange, onRun, onCopyLink, onEndRoom,
  executing, ending, connected, userCount, showOutput, onToggleOutput,
  showChat, onToggleChat,
}) {
  const navigate = useNavigate()

  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-editor-sidebar border-b border-editor-border shrink-0 select-none">

      {/* Logo / home */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-editor-accent font-bold text-sm tracking-tight hover:opacity-80 transition-opacity mr-1"
        title="Go home"
      >
        <Home size={14} />
        CodeSteam
      </button>

      <div className="w-px h-4 bg-editor-border" />

      {/* Room ID chip */}
      <button
        onClick={onCopyLink}
        title="Copy room link"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-editor-muted text-xs hover:text-editor-text hover:bg-editor-border transition-colors font-mono"
      >
        <span className="truncate max-w-[130px]">{roomId}</span>
        <Copy size={11} />
      </button>

      <div className="flex-1" />

      {/* Language picker */}
      <div className="relative">
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          className="appearance-none bg-editor-bg border border-editor-border text-editor-text text-xs rounded px-2.5 py-1.5 pr-6 cursor-pointer focus:outline-none focus:border-editor-accent hover:border-editor-accent transition-colors"
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <ChevronDown
          size={11}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-editor-muted pointer-events-none"
        />
      </div>

      {/* Output toggle */}
      <button
        onClick={onToggleOutput}
        title="Toggle output panel"
        className={`p-1.5 rounded transition-colors ${
          showOutput
            ? 'text-editor-accent bg-editor-border'
            : 'text-editor-muted hover:text-editor-text hover:bg-editor-border'
        }`}
      >
        <TerminalSquare size={15} />
      </button>

      {/* Chat toggle */}
      <button
        onClick={onToggleChat}
        title="Toggle chat panel"
        className={`p-1.5 rounded transition-colors ${
          showChat
            ? 'text-editor-accent bg-editor-border'
            : 'text-editor-muted hover:text-editor-text hover:bg-editor-border'
        }`}
      >
        <MessageCircle size={15} />
      </button>

      {/* Run button */}
      <button
        onClick={onRun}
        disabled={executing}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-editor-accent text-editor-bg text-xs font-medium rounded hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {executing
          ? <><Loader2 size={13} className="animate-spin" /> Running…</>
          : <><Play size={13} /> Run</>
        }
      </button>

      <button
        onClick={onEndRoom}
        disabled={ending}
        title="End room"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {ending
          ? <><Loader2 size={13} className="animate-spin" /> Ending…</>
          : <><X size={13} /> End</>
        }
      </button>

      <div className="w-px h-4 bg-editor-border" />

      {/* Connection + user count */}
      <div className="flex items-center gap-1.5 text-xs text-editor-muted pr-1">
        {connected
          ? <Wifi    size={13} className="text-editor-green" />
          : <WifiOff size={13} className="text-editor-red animate-pulse" />
        }
        <span>{userCount} online</span>
      </div>
    </header>
  )
}
