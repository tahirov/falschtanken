import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Globe } from 'lucide-react'
import { AdminMenu } from '@/components/layout/AdminMenu'
import { useAppStore } from '@/store/useAppStore'
import { translations, type Lang } from '@/lib/i18n'

const LANGS: Lang[] = ['de', 'en', 'pl']

interface AppShellProps {
  children: React.ReactNode
}

const routeTitles: Record<string, keyof typeof translations['de']['nav']['screenTitles']> = {
  '/': 'landing',
  '/intake': 'intake',
  '/chat': 'intake',
  '/offer': 'offer',
  '/dispatch': 'dispatch',
  '/admin/orders': 'orders',
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  const t = translations[lang]
  const isLanding = pathname === '/'

  const titleKey = routeTitles[pathname] ?? 'landing'
  const screenTitle = t.nav.screenTitles[titleKey]
  const showBack = pathname !== '/'

  return (
    // Desktop: content sits in a phone-sized card on a very light grey page.
    // Mobile: the card fills the screen (it is the only content area anyway).
    <div className="min-h-dvh bg-muted flex justify-center sm:items-center sm:py-6">
      <div className="w-full max-w-[480px] bg-background flex flex-col relative min-h-dvh sm:min-h-0 sm:h-[860px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:border sm:shadow-xl sm:overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center justify-between px-3 h-14 border-b bg-background/95 sticky top-0 z-10 backdrop-blur-sm"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-1">
            <AdminMenu />
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
            <span className="font-heading font-bold text-base pl-1">{t.appName}</span>
          </div>
          {isLanding ? (
            <div className="flex items-center gap-0.5">
              {LANGS.map((l) => (
                <Button
                  key={l}
                  variant={lang === l ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => setLang(l)}
                  className="uppercase font-bold text-xs px-2"
                >
                  {l}
                </Button>
              ))}
              <Globe className="size-4 text-muted-foreground ml-0.5" />
            </div>
          ) : screenTitle ? (
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
