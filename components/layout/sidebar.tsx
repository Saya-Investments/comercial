'use client'

import { Users, ListChecks as ListTasks, Mail, MessageSquare, Users2, Calendar, LogOut, DollarSign, Settings, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  activeModule: string
  onModuleChange: (module: any) => void
  isMobile?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ activeModule, onModuleChange, isMobile, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { user, logout } = useAuth()

  const modules = [
    {
      id: 'leads',
      label: 'Leads',
      icon: MessageSquare,
    },
    {
      id: 'tasks',
      label: 'Tareas',
      icon: ListTasks,
    },
    {
      id: 'campaigns',
      label: 'Campañas',
      icon: Mail,
    },
    {
      id: 'calendar',
      label: 'Calendario',
      icon: Calendar,
    },
    {
      id: 'templates',
      label: 'Plantillas',
      icon: Mail,
    },
    {
      id: 'advisors-activity',
      label: 'Asesores',
      icon: TrendingUp,
    },
    {
      id: 'bot-cost',
      label: 'Costo Bot',
      icon: DollarSign,
    },
    {
      id: 'routing-rules',
      label: 'Reglas Enrutamiento',
      icon: Settings,
    },
    {
      id: 'users',
      label: 'Usuarios',
      icon: Users2,
    },
  ]

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-primary text-primary-foreground flex flex-col border-r border-border h-screen transition-all duration-300`}>
      <div className={`${collapsed ? 'p-3' : 'p-4 md:p-6'} border-b border-sidebar-border`}>
        <div className="flex items-center justify-center md:justify-start gap-3">
          <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-accent-foreground" />
          </div>
          {!collapsed && <span className="hidden md:inline text-xl md:text-2xl font-bold">maqui+</span>}
        </div>
      </div>

      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-2 md:p-4'} space-y-1 md:space-y-2 overflow-y-auto`}>
        {modules.map((module) => {
          const Icon = module.icon
          const isActive = activeModule === module.id

          return (
            <button
              key={module.id}
              onClick={() => onModuleChange(module.id)}
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-center md:justify-start'} gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
              title={module.label}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="hidden md:inline font-medium text-sm md:text-base">{module.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className={`${collapsed ? 'p-2' : 'p-3 md:p-4'} border-t border-sidebar-border space-y-2`}>
        {!collapsed && (
          <div className="mb-2 hidden md:block">
            <p className="text-xs md:text-sm text-primary-foreground/80 truncate">{user?.name}</p>
            <p className="text-xs text-primary-foreground/60">{user?.role}</p>
          </div>
        )}
        <Button
          onClick={logout}
          variant="outline"
          className="w-full flex items-center justify-center md:justify-center gap-1 md:gap-2 border-primary-foreground text-primary-foreground hover:bg-primary/80 bg-transparent text-xs md:text-sm px-2 md:px-4 py-2"
          title="Cerrar Sesión"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="hidden md:inline">Salir</span>}
        </Button>

        {/* Botón toggle para desktop */}
        {!isMobile && onToggleCollapse && (
          <Button
            onClick={onToggleCollapse}
            variant="outline"
            className="w-full flex items-center justify-center border-primary-foreground text-primary-foreground hover:bg-primary/80 bg-transparent text-xs md:text-sm px-2 md:px-4 py-2"
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span className="hidden md:inline ml-2">Colapsar</span>}
          </Button>
        )}
      </div>
    </aside>
  )
}
