import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { useAuthStore, adminLogin } from '@/lib/auth'
import { OrdersScreen } from '@/components/screens/OrdersScreen'

/** /admin — single page: a login form when signed out, the orders dashboard
 *  when signed in. Not linked from the customer menu (reached via URL). */
export function AdminPage() {
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang].admin
  const session = useAuthStore((s) => s.session)
  const setSession = useAuthStore((s) => s.setSession)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  if (session) return <OrdersScreen />

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
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 py-2">
          <div className="space-y-1 text-center">
            <p className="font-heading text-base font-semibold">{t.loginTitle}</p>
            <p className="text-sm text-muted-foreground">{t.loginSubtitle}</p>
          </div>
          <form className="space-y-3" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <Label htmlFor="admin-username">{t.username}</Label>
              <Input
                id="admin-username"
                autoComplete="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(false) }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">{t.password}</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false) }}
              />
            </div>
            {error && <p className="text-xs text-destructive">{t.loginError}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t.loggingIn : t.loginButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
