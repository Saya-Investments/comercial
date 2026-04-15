'use client'

import { Users, ListChecks as ListTasks, Mail, MessageSquare, Users2, Calendar, LogOut, DollarSign, Settings, ChevronLeft, ChevronRight, TrendingUp, LayoutDashboard, Headphones, RefreshCw } from 'lucide-react'
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
  const isCollapsed = !isMobile && collapsed

  const allModules = [
    { id: 'call-center-dashboard', label: 'Mi Panel', icon: Headphones, roles: ['call center'] as string[] },
    { id: 'advisor-dashboard', label: 'Mi Actividad', icon: LayoutDashboard, roles: ['asesor'] as string[] },
    { id: 'leads', label: 'Leads', icon: MessageSquare, roles: ['admin', 'asesor', 'call center', 'supervisor'] as string[] },
    { id: 'tasks', label: 'Tareas', icon: ListTasks, roles: ['admin', 'asesor', 'supervisor'] as string[] },
    { id: 'campaigns', label: 'Campañas', icon: Mail, roles: ['admin'] as string[] },
    { id: 'calendar', label: 'Calendario', icon: Calendar, roles: ['admin', 'asesor', 'call center', 'supervisor'] as string[] },
    { id: 'templates', label: 'Plantillas', icon: Mail, roles: ['admin'] as string[] },
    { id: 'advisors-activity', label: 'Asesores', icon: TrendingUp, roles: ['admin', 'supervisor'] as string[] },
    { id: 'reassignment', label: 'Reasignación', icon: RefreshCw, roles: ['admin', 'supervisor'] as string[] },
    // { id: 'bot-cost', label: 'Costo Bot', icon: DollarSign, roles: ['admin'] as string[] },
    { id: 'routing-rules', label: 'Enrutamiento', icon: Settings, roles: ['admin'] as string[] },
    { id: 'users', label: 'Usuarios', icon: Users2, roles: ['admin'] as string[] },
  ]

  const modules = allModules.filter(m => user?.role && m.roles.includes(user.role))

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-[18rem] max-w-[85vw] md:w-64'} bg-primary text-primary-foreground flex flex-col border-r border-border h-screen transition-all duration-300`}>
      <div className={`${isCollapsed ? 'p-3' : 'p-4 md:p-6'} border-b border-sidebar-border`}>
        <div className="flex items-center justify-start gap-3">
          <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-accent-foreground" />
          </div>
          {!isCollapsed && <span className="text-xl md:text-2xl font-bold">maqui+</span>}
        </div>
      </div>

      <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-3 md:p-4'} space-y-2 overflow-y-auto`}>
        {modules.map((module) => {
          const Icon = module.icon
          const isActive = activeModule === module.id

          return (
            <button
              key={module.id}
              onClick={() => onModuleChange(module.id)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-3 md:px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
              title={module.label}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium text-sm md:text-base text-left leading-tight">{module.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className={`${isCollapsed ? 'p-2' : 'p-3 md:p-4'} border-t border-sidebar-border space-y-2`}>
        {!isCollapsed && (
          <div className="mb-2">
            <p className="text-xs md:text-sm text-primary-foreground/80 truncate">{user?.name}</p>
            <p className="text-xs text-primary-foreground/60">{user?.role}</p>
          </div>
        )}
        <Button
          onClick={logout}
          variant="outline"
          className="w-full flex items-center justify-center gap-2 border-primary-foreground text-primary-foreground hover:bg-primary/80 bg-transparent text-xs md:text-sm px-2 md:px-4 py-2"
          title="Cerrar Sesión"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && <span>Salir</span>}
        </Button>

        {/* Botón toggle para desktop */}
        {!isMobile && onToggleCollapse && (
          <Button
            onClick={onToggleCollapse}
            variant="outline"
            className="w-full flex items-center justify-center border-primary-foreground text-primary-foreground hover:bg-primary/80 bg-transparent text-xs md:text-sm px-2 md:px-4 py-2"
            title={isCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!isCollapsed && <span className="hidden md:inline ml-2">Colapsar</span>}
          </Button>
        )}
      </div>
    </aside>
  )
}
