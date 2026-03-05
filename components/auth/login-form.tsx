'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

type Step = 'login' | 'setup'

export function LoginForm() {
  const { login, setupPassword, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('login')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Por favor completa todos los campos')
      return
    }

    try {
      const result = await login(email, password)
      if (result.setupRequired) {
        setStep('setup')
        setPassword('')
        setError('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesion')
    }
  }

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password || !confirmPassword) {
      setError('Por favor completa todos los campos')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    try {
      await setupPassword(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al configurar contraseña')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 p-4">
      <Card className="w-full max-w-md bg-white shadow-xl">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="text-3xl font-bold text-primary mb-2">maqui+</div>
            <h1 className="text-2xl font-bold text-foreground">CRM Comercial</h1>
            <p className="text-muted-foreground mt-2">
              {step === 'login'
                ? 'Gestión de Leads y Campañas'
                : 'Configura tu contraseña'}
            </p>
          </div>

          {step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Contraseña
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-2"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>

              <div className="mt-4 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => { setStep('setup'); setError(''); setPassword('') }}
                  className="text-sm text-primary hover:underline w-full text-center"
                >
                  Es mi primer ingreso
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSetupPassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Nueva contraseña
                </label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Confirmar contraseña
                </label>
                <Input
                  type="password"
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-2"
              >
                {loading ? 'Configurando...' : 'Configurar contraseña'}
              </Button>

              <div className="mt-4 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => { setStep('login'); setError(''); setPassword(''); setConfirmPassword('') }}
                  className="text-sm text-primary hover:underline w-full text-center"
                >
                  Ya tengo contraseña, iniciar sesión
                </button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  )
}
