'use client'

import React from "react"

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X } from 'lucide-react'
import { useState } from 'react'

interface User {
  id: string
  username: string
  name: string
  role: 'Admin' | 'Call Center' | 'Asesor' | 'Supervisor'
  email: string
  active: boolean
  joinDate: string
  supervisorId?: string | null
  supervisorName?: string | null
}

interface SupervisorOption {
  id: string
  name: string
}

interface UserModalProps {
  user: User | null
  onClose: () => void
  onSaved?: () => void
  supervisors?: SupervisorOption[]
}

export function UserModal({ user, onClose, onSaved, supervisors = [] }: UserModalProps) {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || 'Asesor',
    password: '',
    confirmPassword: '',
    supervisorId: user?.supervisorId || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supervisorId = formData.role === 'Asesor' ? formData.supervisorId || null : null
    if (user) {
      await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          username: formData.username,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          supervisorId,
        }),
      })
    } else {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password,
          supervisorId,
        }),
      })
    }
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground">
            {user ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Usuario</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="juan.perez"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Nombre Completo</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Juan Pérez"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="juan@maquiplus.com"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Rol</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
            >
              <option value="Asesor">Asesor</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Call Center">Call Center</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          {formData.role === 'Asesor' && supervisors.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Supervisor</label>
              <select
                name="supervisorId"
                value={formData.supervisorId}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Sin supervisor</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {!user && (
            <>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Contraseña</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Confirmar Contraseña</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </>
          )}

          {user && (
            <div className="bg-secondary/50 border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                Para cambiar la contraseña, solicita un restablecimiento de contraseña
              </p>
            </div>
          )}
        </form>

        <div className="p-6 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {user ? 'Actualizar Usuario' : 'Crear Usuario'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
