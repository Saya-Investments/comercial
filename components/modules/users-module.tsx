'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { UserModal } from './modals/user-modal'

interface User {
  id: string
  username: string
  name: string
  role: 'Admin' | 'Manager' | 'Agente'
  email: string
  active: boolean
  joinDate: string
}

const mockUsers: User[] = [
  {
    id: '1',
    username: 'jperez',
    name: 'Juan Pérez',
    role: 'Admin',
    email: 'juan@maquiplus.com',
    active: true,
    joinDate: '2024-01-01',
  },
  {
    id: '2',
    username: 'mrodriguez',
    name: 'María Rodríguez',
    role: 'Manager',
    email: 'maria@maquiplus.com',
    active: true,
    joinDate: '2024-01-15',
  },
  {
    id: '3',
    username: 'cmartinez',
    name: 'Carlos Martínez',
    role: 'Agente',
    email: 'carlos@maquiplus.com',
    active: true,
    joinDate: '2024-02-01',
  },
]

export function UsersModule() {
  const [users, setUsers] = useState(mockUsers)
  const [showModal, setShowModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const handleDelete = (id: string) => {
    setUsers(users.filter((u) => u.id !== id))
  }

  const handleToggleActive = (id: string) => {
    setUsers(
      users.map((u) =>
        u.id === id ? { ...u, active: !u.active } : u
      )
    )
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-accent/10 text-accent border border-accent/20'
      case 'Manager':
        return 'bg-primary/10 text-primary border border-primary/20'
      case 'Agente':
        return 'bg-blue-50 text-blue-700 border border-blue-200'
      default:
        return ''
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Usuarios</h1>
            <p className="text-muted-foreground mt-1">Gestión de usuarios del sistema</p>
          </div>
          <Button
            onClick={() => {
              setSelectedUser(null)
              setShowModal(true)
            }}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="px-6 py-3 text-left font-semibold text-foreground">Usuario</th>
                  <th className="px-6 py-3 text-left font-semibold text-foreground">Nombre</th>
                  <th className="px-6 py-3 text-left font-semibold text-foreground">Email</th>
                  <th className="px-6 py-3 text-left font-semibold text-foreground">Rol</th>
                  <th className="px-6 py-3 text-left font-semibold text-foreground">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold text-foreground">Fecha Ingreso</th>
                  <th className="px-6 py-3 text-right font-semibold text-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-foreground">{user.username}</td>
                    <td className="px-6 py-4 font-medium text-foreground">{user.name}</td>
                    <td className="px-6 py-4 text-foreground">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleColor(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(user.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          user.active
                            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                        }`}
                      >
                        {user.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-foreground">{user.joinDate}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user)
                            setShowModal(true)
                          }}
                          className="text-foreground hover:bg-secondary"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                          className="text-accent hover:bg-accent/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {users.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No hay usuarios registrados</p>
            <Button onClick={() => setShowModal(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Crear Primer Usuario
            </Button>
          </div>
        )}
      </div>

      {showModal && (
        <UserModal
          user={selectedUser}
          onClose={() => {
            setShowModal(false)
            setSelectedUser(null)
          }}
        />
      )}
    </div>
  )
}
