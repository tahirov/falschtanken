import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'

interface AppShellProps {
  children: React.ReactNode
}

const routeTitles: Record<string, keyof typeof translations['de']['nav']['screenTitles']> = {
  '/': 'landing',
  '/intake': 'intake',
  '/offer': 'offer',
  '/dispatch': 'dispatch',
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang]

  const titleKey = routeTitles[pathname] ?? 'landing'
  const screenTitle = t.nav.screenTitles[titleKey]
  const showBack = pathname !== '/'

  return (
    <div className="min-h-dvh bg-background flex justify-center">
      <div className="w-full max-w-[480px] min-h-dvh flex flex-col relative">
        {/* Header */}
        <header
          className="flex items-center justify-between px-4 h-14 border-b bg-background/95 sticky top-0 z-10 backdrop-blur-sm"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-2">
            {showBack && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate(-1)}
                aria-label={t.nav.back}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            <span className="font-heading font-bold text-base">{t.appName}</span>
          </div>
          {screenTitle ? (
            <span className="text-sm text-muted-foreground font-medium">{screenTitle}</span>
          ) : null}
        </header>

        {/* Main content */}
        <main
          className="flex-1 flex flex-col overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
