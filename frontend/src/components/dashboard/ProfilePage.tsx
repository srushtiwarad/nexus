import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usersAPI, authAPI } from '../../services/api';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-5">
      <h2 className="text-base font-semibold text-white mb-5">{title}</h2>
      {children}
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      <input {...props}
        className={`w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}`} />
    </div>
  );
}

export default function ProfilePage() {
  const { user, setAuth, refreshToken, accessToken } = useAuthStore();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [bio, setBio] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [profileMsg, setProfileMsg] = useState<{text:string;ok:boolean}|null>(null);
  const [pwdMsg, setPwdMsg] = useState<{text:string;ok:boolean}|null>(null);
  const [prefs, setPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem('nexus-prefs');
      return raw ? JSON.parse(raw) : { compactMode: false, reduceMotion: false };
    } catch {
      return { compactMode: false, reduceMotion: false };
    }
  });

  // Load sessions
  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => authAPI.getSessions().then(r => r.data),
  });

  const profileMutation = useMutation({
    mutationFn: (d: object) => usersAPI.updateProfile(user!.id, d),
    onSuccess: ({ data }) => {
      setAuth({ ...user!, fullName: data.full_name, ...(data.bio ? { bio: data.bio } : {}) }, accessToken!, refreshToken!);
      setProfileMsg({ text: 'Profile updated successfully', ok: true });
      setTimeout(() => setProfileMsg(null), 3000);
    },
    onError: (e: any) => setProfileMsg({ text: e.response?.data?.error || 'Update failed', ok: false }),
  });

  const pwdMutation = useMutation({
    mutationFn: (d: object) => usersAPI.changePassword(user!.id, d),
    onSuccess: () => {
      setCurrentPwd(''); setNewPwd('');
      setPwdMsg({ text: 'Password changed successfully', ok: true });
      setTimeout(() => setPwdMsg(null), 3000);
    },
    onError: (e: any) => setPwdMsg({ text: e.response?.data?.error || 'Failed', ok: false }),
  });

  const revokeSession = useMutation({
    mutationFn: (id: string) => authAPI.revokeSession(id),
    onSuccess: () => refetchSessions(),
  });

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex items-center gap-4">
        <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
          {user?.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{user?.fullName}</h1>
          <p className="text-gray-400 text-sm">{user?.email}</p>
          <span className="inline-flex items-center gap-1.5 mt-1 text-xs text-emerald-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            Email verified
          </span>
        </div>
      </div>

      {/* Personal info */}
      <Section title="Personal Information">
        <div className="space-y-4">
          <Input label="Full name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} />
          <Input label="Email" type="email" value={user?.email} disabled />
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Tell your team about yourself…"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none" />
          </div>
        </div>
        {profileMsg && (
          <p className={`text-sm mt-3 ${profileMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{profileMsg.text}</p>
        )}
        <button onClick={() => profileMutation.mutate({ fullName, bio })} disabled={profileMutation.isPending}
          className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
          {profileMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </Section>

      {/* Connected accounts */}
      <Section title="Connected Accounts">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/auth/google`}
            className="flex items-center justify-between px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v18m9-9H3" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Google</p>
                <p className="text-xs text-gray-500">Sign in with Google</p>
              </div>
            </div>
            <span className="text-xs text-gray-400">Connect</span>
          </a>

          <a
            href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/auth/github`}
            className="flex items-center justify-between px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.77.6-3.35-1.34-3.35-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.04 1.53 1.04.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.21-.25-4.54-1.11-4.54-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0112 6.8c.85 0 1.7.12 2.5.34 1.9-1.3 2.74-1.03 2.74-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.33 4.7-4.55 4.95.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0012 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">GitHub</p>
                <p className="text-xs text-gray-500">Sign in with GitHub</p>
              </div>
            </div>
            <span className="text-xs text-gray-400">Connect</span>
          </a>
        </div>
        <p className="text-xs text-gray-600 mt-3">If you already use Google/GitHub to sign in, connecting again is safe.</p>
      </Section>

      {/* Preferences */}
      <Section title="Preferences">
        <div className="space-y-3">
          {[
            {
              key: 'compactMode',
              title: 'Compact mode',
              desc: 'Tighter spacing across lists and panels.',
            },
            {
              key: 'reduceMotion',
              title: 'Reduce motion',
              desc: 'Minimise animations for accessibility.',
            },
          ].map((t: any) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                const next = { ...prefs, [t.key]: !prefs[t.key] };
                setPrefs(next);
                localStorage.setItem('nexus-prefs', JSON.stringify(next));
              }}
              className="w-full flex items-start justify-between gap-4 p-4 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700/60 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{t.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${prefs[t.key] ? 'text-emerald-300 border-emerald-800 bg-emerald-900/20' : 'text-gray-400 border-gray-700 bg-gray-900/20'}`}>
                {prefs[t.key] ? 'On' : 'Off'}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Change password */}
      <Section title="Change Password">
        <div className="space-y-4">
          <Input label="Current password" type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="••••••••" />
          <Input label="New password" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 8 characters" />
        </div>
        {pwdMsg && (
          <p className={`text-sm mt-3 ${pwdMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{pwdMsg.text}</p>
        )}
        <button onClick={() => pwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd })}
          disabled={pwdMutation.isPending || !currentPwd || !newPwd}
          className="mt-4 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
          {pwdMutation.isPending ? 'Updating…' : 'Update password'}
        </button>
      </Section>

      {/* Active sessions */}
      <Section title="Active Sessions">
        <div className="space-y-2">
          {(sessions as any[]).length === 0 ? (
            <p className="text-sm text-gray-500">No active sessions found.</p>
          ) : (sessions as any[]).map((s: any, i: number) => (
            <div key={s.id} className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
              <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{s.user_agent?.slice(0, 60) || 'Unknown device'}{i === 0 && <span className="ml-2 text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-800 px-1.5 py-0.5 rounded">Current</span>}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.ip_address} · {new Date(s.created_at).toLocaleDateString()}</p>
              </div>
              {i > 0 && (
                <button onClick={() => revokeSession.mutate(s.id)}
                  className="text-xs text-red-400 hover:text-red-300 flex-shrink-0">Revoke</button>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Danger zone */}
      <div className="bg-red-900/10 border border-red-900/30 rounded-xl p-5">
        <h2 className="text-base font-semibold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-500 mb-4">Sign out everywhere (revokes all sessions).</p>
        <button onClick={async () => { await authAPI.logoutAll(); await authAPI.logout(); }}
          className="px-4 py-2 border border-red-800 text-red-400 hover:bg-red-900/30 rounded-lg text-sm transition-colors">
          Sign out everywhere
        </button>
      </div>
    </div>
  );
}
