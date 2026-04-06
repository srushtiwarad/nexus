import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { api, dashboardAPI, notificationsAPI, projectsAPI } from '../../services/api';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';

function StatCard({ label, value, icon, color, sub }: { label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function dueDateText(date: string) {
  const d = parseISO(date);
  if (isToday(d)) return { text: 'Today', cls: 'text-amber-400' };
  if (isTomorrow(d)) return { text: 'Tomorrow', cls: 'text-yellow-400' };
  if (isPast(d)) return { text: `Overdue · ${format(d, 'MMM d')}`, cls: 'text-red-400' };
  return { text: format(d, 'MMM d'), cls: 'text-gray-500' };
}

function safeFormatDate(value: any) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'MMM d');
}

function barColor(pct: number) {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-indigo-500';
  if (pct >= 25) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function DashboardHome() {
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsAPI.list().then(r => r.data),
  });

  // Aggregate projects for simple insights
  const allProjects = projects as any[];
  const activeProjects = allProjects.filter((p: any) => p.status === 'active');
  const archivedProjects = allProjects.filter((p: any) => p.status === 'archived');

  const { data: activity = [] } = useQuery({
    queryKey: ['audit', 'me', 8],
    queryFn: () => api.get('/audit', { params: { limit: 8 } }).then(r => r.data?.data ?? r.data ?? []),
  });

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardAPI.summary().then(r => r.data),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsAPI.unread().then(r => r.data ?? []),
  });

  const focus = (() => {
    const withDue = activeProjects.filter((p: any) => !!p.due_date);
    if (withDue.length > 0) {
      const next = [...withDue].sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
      return { kind: 'due', project: next };
    }
    const lastUpdated = [...activeProjects]
      .sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0];
    if (lastUpdated) return { kind: 'updated', project: lastUpdated };
    return { kind: 'none' } as const;
  })();

  const summary = summaryQuery.data;
  const health = summary?.projectHealth || null;
  const perProject = (summary?.perProject || []) as any[];
  const calendar = (summary?.calendar || []) as any[];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          {greeting}, {user?.fullName?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-400 mt-1 text-sm">Here&apos;s what&apos;s happening with your projects today.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Projects"
          value={activeProjects.length}
          color="bg-indigo-500/10 border border-indigo-500/20"
          icon={<svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>}
        />
        <StatCard
          label="Total Projects"
          value={(projects as any[]).length}
          color="bg-violet-500/10 border border-violet-500/20"
          icon={<svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>}
        />
        <StatCard
          label="Completed"
          value={(projects as any[]).filter((p: any) => p.status === 'archived').length}
          color="bg-emerald-500/10 border border-emerald-500/20"
          icon={<svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <StatCard
          label="Team Member"
          value={user?.role === 'admin' ? 'Admin' : 'Member'}
          color="bg-amber-500/10 border border-amber-500/20"
          icon={<svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent + Recently Updated Projects */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Projects</h2>
            <Link to="/dashboard/projects" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
          </div>
          {activeProjects.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">No active projects yet.</p>
              <Link to="/dashboard/projects" className="mt-3 inline-flex text-indigo-400 text-sm hover:text-indigo-300">Create your first project →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeProjects.slice(0, 5).map((p: any) => (
                <Link key={p.id} to={`/dashboard/projects/${p.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors group">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors truncate">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-500 truncate">{p.description}</p>}
                  </div>
                  {p.due_date && (() => { const d = dueDateText(p.due_date); return (
                    <span className={`text-xs flex-shrink-0 ${d.cls}`}>{d.text}</span>
                  );})()}
                  <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions + Status + Account */}
        <div className="space-y-4">
          {/* Project health */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Project Health</h2>
              <span className="text-xs text-gray-600">All active</span>
            </div>

            {summaryQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : summaryQuery.isError ? (
              <div className="text-sm text-red-400">
                <p>Couldn&apos;t load project health.</p>
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {(summaryQuery.error as any)?.response?.data?.error || (summaryQuery.error as any)?.message || 'Request failed'}
                </p>
                <button
                  onClick={() => summaryQuery.refetch()}
                  className="mt-3 px-3 py-1.5 text-xs rounded-lg border border-red-900/40 text-red-300 hover:bg-red-900/20 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : !health ? (
              <p className="text-sm text-gray-500">No health data yet.</p>
            ) : (
              <>
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-400">Progress</span>
                    <span className="text-white font-semibold">{health.progressPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div className={`h-full ${barColor(health.progressPct)} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, health.progressPct))}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Overdue</p>
                    <p className="text-lg font-bold text-red-300">{health.overdueCount}</p>
                  </div>
                  <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Blockers</p>
                    <p className="text-lg font-bold text-amber-300">{health.blockersCount}</p>
                  </div>
                  <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Workload</p>
                    <p className="text-lg font-bold text-indigo-300">
                      {(health.workload?.todo || 0) + (health.workload?.in_progress || 0) + (health.workload?.in_review || 0)}
                    </p>
                  </div>
                </div>

                {perProject.length > 0 && (
                  <div className="space-y-2">
                    {perProject.slice(0, 4).map((p: any) => (
                      <Link
                        key={p.projectId}
                        to={`/dashboard/projects/${p.projectId}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/40 transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-200 truncate">{p.name}</p>
                          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden mt-1">
                            <div className={`h-full ${barColor(p.progressPct || 0)} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, p.progressPct || 0))}%` }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-400">{p.progressPct || 0}%</p>
                          <p className="text-[10px] text-gray-600">{(p.overdue || 0) > 0 ? `${p.overdue} overdue` : (p.blockers || 0) > 0 ? `${p.blockers} blockers` : 'OK'}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Notifications</h2>
              <span className="text-xs text-gray-600">{(notifications as any[]).length} unread</span>
            </div>
            {(notifications as any[]).length === 0 ? (
              <p className="text-sm text-gray-500">No unread notifications.</p>
            ) : (
              <div className="space-y-2">
                {(notifications as any[]).slice(0, 6).map((n: any) => (
                  <Link
                    key={n.id}
                    to={n.link || '/dashboard'}
                    className="block p-3 rounded-lg bg-gray-800/30 border border-gray-700/40 hover:bg-gray-800/50 transition-colors"
                  >
                    <p className="text-xs text-gray-500">{n.type}</p>
                    <p className="text-sm text-gray-200 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.body}</p>}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Calendar / timeline */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Calendar</h2>
              <span className="text-xs text-gray-600">Due dates & milestones</span>
            </div>
            {calendar.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming dates.</p>
            ) : (
              <div className="space-y-2">
                {calendar.slice(0, 8).map((e: any, idx: number) => (
                  <Link
                    key={`${e.type}-${e.date}-${idx}`}
                    to={e.link || '/dashboard'}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{e.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{e.type.replace('_', ' ')}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {safeFormatDate(e.date) || e.date}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Focus */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-2">Focus</h2>
            {focus.kind === 'none' ? (
              <p className="text-sm text-gray-500">Create a project to start tracking work.</p>
            ) : (
              <div className="flex items-start gap-3">
                <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: (focus as any).project?.color || '#6366f1' }} />
                <div className="min-w-0">
                  <p className="text-sm text-gray-300">
                    {focus.kind === 'due' ? 'Upcoming deadline' : 'Most recently updated'}
                  </p>
                  <Link
                    to={`/dashboard/projects/${(focus as any).project?.id}`}
                    className="text-sm font-medium text-white hover:text-indigo-300 truncate block"
                  >
                    {(focus as any).project?.name}
                  </Link>
                  <p className="text-xs text-gray-500 mt-1">
                    {focus.kind === 'due'
                      ? ((focus as any).project?.due_date ? `Due ${(dueDateText((focus as any).project.due_date).text)}` : '')
                      : (safeFormatDate((focus as any).project?.updated_at) ? `Updated ${safeFormatDate((focus as any).project.updated_at)}` : 'Updated recently')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Activity</h2>
              <span className="text-xs text-gray-600">Latest</span>
            </div>
            {(activity as any[]).length === 0 ? (
              <p className="text-sm text-gray-500">No recent activity yet.</p>
            ) : (
              <div className="space-y-2">
                {(activity as any[]).slice(0, 6).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-800/40 transition-colors">
                    <div className="w-8 h-8 bg-gray-800 border border-gray-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M12 18a6 6 0 100-12 6 6 0 000 12z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">{a.category || 'system'}</p>
                      <p className="text-sm text-gray-200 truncate">{a.action || 'Activity recorded'}</p>
                    </div>
                    {safeFormatDate(a.created_at) && (
                      <span className="text-[10px] text-gray-600 flex-shrink-0 mt-1">{safeFormatDate(a.created_at)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { label: 'New Project', to: '/dashboard/projects', icon: '＋', color: 'bg-indigo-600 hover:bg-indigo-500 text-white' },
                { label: 'View All Projects', to: '/dashboard/projects', icon: '⊞', color: 'bg-gray-800 hover:bg-gray-700 text-gray-300' },
                { label: 'Profile Settings', to: '/dashboard/profile', icon: '⚙', color: 'bg-gray-800 hover:bg-gray-700 text-gray-300' },
              ].map(a => (
                <Link key={a.label} to={a.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${a.color}`}>
                  <span className="text-base">{a.icon}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Project status summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-3">Project Status</h2>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-400">Active</span>
              <span className="text-emerald-400 font-semibold">{activeProjects.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-400">Archived</span>
              <span className="text-amber-400 font-semibold">{archivedProjects.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total</span>
              <span className="text-indigo-400 font-semibold">{allProjects.length}</span>
            </div>
          </div>

          {/* Account summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-3">Your Account</h2>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {user?.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-900/40 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
              Email verified
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
