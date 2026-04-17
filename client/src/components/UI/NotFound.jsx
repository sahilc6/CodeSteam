import { useNavigate } from 'react-router-dom'
import { Code2, Home } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-editor-bg flex flex-col items-center justify-center gap-5">
      <Code2 size={40} className="text-editor-border" />
      <div className="text-center">
        <p className="text-6xl font-bold text-editor-border tracking-tight">404</p>
        <p className="text-editor-muted text-sm mt-2">Page not found</p>
      </div>
      <button onClick={() => navigate('/')} className="btn-primary flex items-center gap-2">
        <Home size={14} /> Go home
      </button>
    </div>
  )
}
