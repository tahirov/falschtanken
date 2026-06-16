import { useNavigate, useLocation } from 'react-router-dom'
import { MessagesSquare, ListChecks } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { clearChat } from '@/lib/chatSession'
import { clearDispatch } from '@/lib/dispatchSession'

/**
 * Segmented control at the top of the intake. Two ways into the same funnel:
 * the conversational AI chat (default, route "/") and the guided step-by-step
 * wizard (route "/intake"). Switching just navigates; each screen owns its content.
 */
export function IntakeTabs() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const lang = useAppStore((s) => s.lang)
  const setOrderId = useAppStore((s) => s.setOrderId)
  const t = translations[lang].tabs

  // The AI tab is "active" on the landing hero and the chat itself.
  const aiActive = pathname === '/' || pathname === '/chat'
  const stepsActive = pathname === '/intake'

  function go(to: string) {
    if ((to === '/' && aiActive) || (to === '/intake' && stepsActive)) return
    clearChat()
    clearDispatch()
    setOrderId(null)
    navigate(to)
  }

  const tabs = [
    { to: '/', label: t.ai, icon: MessagesSquare, active: aiActive },
    { to: '/intake', label: t.steps, icon: ListChecks, active: stepsActive },
  ]

  return (
    <div className="px-4 pt-3 pb-1">
      {/* Translucent dark tint (not bg-muted) so the track reads as a distinct
          "well" on BOTH the muted landing page and the white wizard page —
          bg-muted would blend into the landing's matching background. */}
      <div className="grid grid-cols-2 gap-1 rounded-full bg-black/[0.06] p-1 border border-black/5">
        {tabs.map(({ to, label, icon: Icon, active }) => (
          <button
            key={to}
            type="button"
            onClick={() => go(to)}
            className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
