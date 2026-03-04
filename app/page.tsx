'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { LoginForm } from '@/components/auth/login-form'
import { Sidebar } from '@/components/layout/sidebar'
import { LeadsModule } from '@/components/modules/leads-module'
import { TasksModule } from '@/components/modules/tasks-module'
import { CampaignsModule } from '@/components/modules/campaigns-module'
import { CalendarModule } from '@/components/modules/calendar-module'
import { TemplatesModule } from '@/components/modules/templates-module'
import { UsersModule } from '@/components/modules/users-module'
import { BotCostModule } from '@/components/modules/bot-cost-module'
import { RoutingRulesModule } from '@/components/modules/routing-rules-module'
import { AdvisorsActivityModule } from '@/components/modules/advisors-activity-module'
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'

type ModuleType = 'leads' | 'tasks' | 'campaigns' | 'calendar' | 'templates' | 'users' | 'bot-cost' | 'routing-rules' | 'advisors-activity'

export default function Home() {
  const { isAuthenticated, loading } = useAuth()
  const [activeModule, setActiveModule] = useState<ModuleType>('leads')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-4xl font-bold text-primary mb-4">maqui+</div>
          <div className="text-muted-foreground">Cargando...</div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar Desktop */}
      <div className="hidden md:block">
        <Sidebar 
          activeModule={activeModule} 
          onModuleChange={setActiveModule}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Sidebar Mobile - Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed md:relative left-0 top-0 h-full z-50 transform transition-transform md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="md:hidden">
          <Sidebar 
            activeModule={activeModule} 
            onModuleChange={() => setSidebarOpen(false)} 
            isMobile
            collapsed={false}
          />
        </div>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Mobile Header */}
        <div className="md:hidden bg-primary text-primary-foreground p-4 flex items-center justify-between border-b border-border">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-primary/80 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="text-xl font-bold">maqui+</div>
          <div className="w-10" /> {/* Spacer */}
        </div>

        <div className="flex-1 overflow-auto">
          {activeModule === 'leads' && <LeadsModule />}
          {activeModule === 'tasks' && <TasksModule />}
          {activeModule === 'campaigns' && <CampaignsModule />}
          {activeModule === 'calendar' && <CalendarModule />}
          {activeModule === 'templates' && <TemplatesModule />}
          {activeModule === 'users' && <UsersModule />}
          {activeModule === 'advisors-activity' && <AdvisorsActivityModule />}
          {activeModule === 'bot-cost' && <BotCostModule initialLeads={150} />}
          {activeModule === 'routing-rules' && <RoutingRulesModule />}
        </div>
      </main>
    </div>
  )
}
