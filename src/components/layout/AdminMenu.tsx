import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, LogOut, ClipboardList, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { useAuthStore, adminLogin, adminLogout } from '@/lib/auth'

export function AdminMenu() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang].admin

  const session = useAuthStore((s) => s.session)
  const setSession = useAuthStore((s) => s.setSession)

  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError(false)
    const { session: s, error: err } = await adminLogin(username.trim(), password)
    setLoading(false)
    if (err || !s) {
      setError(true)
      return
    }
    setSession(s)
    setUsername('')
    setPassword('')
  }

  async function handleLogout() {
    if (session) await adminLogout(session.token)
    setSession(null)
  }

  function goToOrders() {
    setOpen(false)
    navigate('/admin/orders')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={t.menu} />}
      >
        <Menu className="size-5" />
      </SheetTrigger>

      <SheetContent side="left" className="w-[300px] sm:w-[340px]">
        {session ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                {t.ordersTitle}
              </SheetTitle>
              <SheetDescription>{t.loggedInAs(session.username)}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-2 px-4">
              <Button className="w-full justify-start gap-2" onClick={goToOrders}>
                <ClipboardList className="size-4" />
                {t.ordersLink}
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={handleLogout}
              >
                <LogOut className="size-4" />
                {t.logout}
              </Button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                {t.loginTitle}
              </SheetTitle>
              <SheetDescription>{t.loginSubtitle}</SheetDescription>
            </SheetHeader>

            <form className="flex flex-col gap-3 px-4" onSubmit={handleLogin}>
              <div className="space-y-1.5">
                <Label htmlFor="admin-username">{t.username}</Label>
                <Input
                  id="admin-username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    setError(false)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password">{t.password}</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError(false)
                  }}
                />
              </div>
              {error && <p className="text-xs text-destructive">{t.loginError}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t.loggingIn : t.loginButton}
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
