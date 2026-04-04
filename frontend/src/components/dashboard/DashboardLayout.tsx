import { useMemo, useState } from 'react';
import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { projectsAPI, authAPI } from '@/services/api';

function Avatar({ name, size = 8 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['bg-indigo-500','bg-violet-500','bg-pink-500','bg-emerald-500','bg-amber-500'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-${size} h-${size} ${color} rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

const navItems = [
  { to: '/dashboard', end: true, label: 'Dashboard',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/> },
  { to: '/dashboard/projects', label: 'Projects',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/> },
  { to: '/dashboard/team', label: 'Team',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-4-4h-1m-6 6H2v-2a4 4 0 014-4h5m4-8a4 4 0 11-8 0 4 4 0 018 0zM23 7a4 4 0 01-6 3.464" /> },
  { to: '/dashboard/profile', label: 'Profile',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/> },
];

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectQuery, setProjectQuery] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsAPI.list().then(r => r.data),
  });

  const activeProjects = useMemo(() => {
    const list = (projects as any[]).filter((p: any) => p.status === 'active');
    const q = projectQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p: any) => String(p.name || '').toLowerCase().includes(q));
  }, [projects, projectQuery]);

  async function handleLogout() {
    try {
      await authAPI.logout();
    } catch {
      /* ignore logout network errors */
    }
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200`}>
        {/* Brand */}
        <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {sidebarOpen && <span className="font-bold text-white tracking-tight flex-1">Nexus</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-white transition-colors ml-auto">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? "M11 19l-7-7 7-7M18 19l-7-7 7-7" : "M13 5l7 7-7 7M6 5l7 7-7 7"} />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-0.5">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{item.icon}</svg>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}

          {/* Projects section */}
          {sidebarOpen && (
            <>
              <div className="mt-5 mb-1 px-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Projects</p>
                  <Link to="/dashboard/projects?create=1" className="text-xs text-indigo-400 hover:text-indigo-300">New</Link>
                </div>
              </div>
              <div className="px-3 mb-2">
                <input
                  value={projectQuery}
                  onChange={e => setProjectQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
              {activeProjects.slice(0, 8).map((p: any) => (
                <NavLink key={p.id} to={`/dashboard/projects/${p.id}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                  <span className="truncate">{p.name}</span>
                </NavLink>
              ))}
              {activeProjects.length > 8 && (
                <Link to="/dashboard/projects" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-gray-700" />
                  <span className="truncate">View all</span>
                </Link>
              )}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-2 py-3 border-t border-gray-800">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer group">
            {user && <Avatar name={user.fullName} size={7} />}
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <button onClick={handleLogout}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-700 transition-all" title="Sign out">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6a2 2 0 012 2v1" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
