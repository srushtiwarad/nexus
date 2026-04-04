import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { teamsAPI } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'indigo' | 'emerald' | 'amber' }) {
  const cls =
    tone === 'indigo'
      ? 'text-indigo-300 border-indigo-800 bg-indigo-900/20'
      : tone === 'emerald'
        ? 'text-emerald-300 border-emerald-800 bg-emerald-900/20'
        : tone === 'amber'
          ? 'text-amber-300 border-amber-800 bg-amber-900/20'
          : 'text-gray-300 border-gray-700 bg-gray-900/20';
  return <span className={`text-xs px-2 py-1 rounded-full border ${cls}`}>{children}</span>;
}

function roleTone(role: string) {
  if (role === 'owner') return 'amber';
  if (role === 'admin') return 'indigo';
  if (role === 'member') return 'emerald';
  return 'gray';
}

export default function TeamMembersPage() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [newTeamName, setNewTeamName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'member' | 'admin'>('member');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsAPI.list().then((r) => r.data),
  });

  const effectiveTeamId = useMemo(() => {
    const list = teams as any[];
    if (selectedTeamId) return selectedTeamId;
    return list?.[0]?.id ?? null;
  }, [teams, selectedTeamId]);

  const selectedTeam = useMemo(() => {
    const list = teams as any[];
    return list.find((t) => t.id === effectiveTeamId) ?? null;
  }, [teams, effectiveTeamId]);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members', effectiveTeamId],
    enabled: !!effectiveTeamId,
    queryFn: () => teamsAPI.members(effectiveTeamId!).then((r) => r.data),
  });

  const { data: pending = [] } = useQuery({
    queryKey: ['team-pending', effectiveTeamId],
    enabled: !!effectiveTeamId,
    queryFn: () => teamsAPI.pending(effectiveTeamId!).then((r) => r.data),
  });

  const createTeam = useMutation({
    mutationFn: (d: { name: string }) => teamsAPI.create(d),
    onSuccess: async ({ data }) => {
      await qc.invalidateQueries({ queryKey: ['teams'] });
      setSelectedTeamId(data.id);
      setNewTeamName('');
      setMsg({ ok: true, text: 'Team created' });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: any) => setMsg({ ok: false, text: e.response?.data?.error || 'Failed to create team' }),
  });

  const invite = useMutation({
    mutationFn: (d: { teamId: string; email: string; role: string }) => teamsAPI.invite(d.teamId, { email: d.email, role: d.role }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['team-members', effectiveTeamId] });
      await qc.invalidateQueries({ queryKey: ['team-pending', effectiveTeamId] });
      setInviteEmail('');
      setMsg({ ok: true, text: 'Invite sent/saved' });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: any) => setMsg({ ok: false, text: e.response?.data?.error || 'Invite failed' }),
  });

  const remove = useMutation({
    mutationFn: (d: { teamId: string; userId: string }) => teamsAPI.removeMember(d.teamId, d.userId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['team-members', effectiveTeamId] });
    },
  });

  const revokePending = useMutation({
    mutationFn: (d: { teamId: string; email: string }) => teamsAPI.revokePending(d.teamId, d.email),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['team-pending', effectiveTeamId] });
    },
  });

  const canManage = selectedTeam?.my_role === 'owner' || selectedTeam?.my_role === 'admin';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-sm text-gray-400 mt-1">Create teams and add members by email.</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="New team name…"
            className="w-56 px-3.5 py-2.5 bg-gray-900 border border-gray-800 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
          <button
            disabled={!newTeamName.trim() || createTeam.isPending}
            onClick={() => createTeam.mutate({ name: newTeamName.trim() })}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {createTeam.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {msg && <p className={`text-sm mb-4 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-1">Selected team</p>
            {teamsLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (teams as any[]).length === 0 ? (
              <p className="text-sm text-gray-500">No teams yet. Create one above.</p>
            ) : (
              <select
                value={effectiveTeamId ?? ''}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full max-w-sm px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(teams as any[]).map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.member_count} members)
                  </option>
                ))}
              </select>
            )}
          </div>
          {selectedTeam && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge tone={roleTone(selectedTeam.my_role)}>{String(selectedTeam.my_role || 'member')}</Badge>
              <Badge>{selectedTeam.plan || 'free'}</Badge>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Invite */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-3">Add member</h2>
          <p className="text-xs text-gray-500 mb-4">If they aren&apos;t registered yet, we&apos;ll save a pending invitation.</p>

          <div className="space-y-3">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="member@email.com"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              disabled={!effectiveTeamId || !inviteEmail.trim() || invite.isPending || !canManage}
              onClick={() => invite.mutate({ teamId: effectiveTeamId!, email: inviteEmail.trim(), role: inviteRole })}
              className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
              title={!canManage ? 'Only team admins/owners can add members' : undefined}
            >
              {invite.isPending ? 'Adding…' : 'Add member'}
            </button>
          </div>

          {(pending as any[]).length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Pending invites</h3>
                <span className="text-xs text-gray-600">{(pending as any[]).length}</span>
              </div>
              <div className="space-y-2">
                {(pending as any[]).slice(0, 6).map((p: any) => (
                  <div key={p.id || p.email} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/40">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-300 truncate">{p.email}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">Role: {p.role}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge tone={roleTone(p.role)}>{String(p.role)}</Badge>
                      {canManage && (
                        <button
                          onClick={() => {
                            const ok = confirm(`Revoke invitation for ${p.email}?`);
                            if (!ok) return;
                            revokePending.mutate({ teamId: effectiveTeamId!, email: p.email });
                          }}
                          className="text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {(pending as any[]).length > 6 && (
                <p className="text-[11px] text-gray-600 mt-2">Showing latest 6 pending invites.</p>
              )}
            </div>
          )}
        </div>

        {/* Members list */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Members</h2>
            <span className="text-xs text-gray-600">{(members as any[]).length} total</span>
          </div>

          {!effectiveTeamId ? (
            <p className="text-sm text-gray-500">Create a team to start adding members.</p>
          ) : membersLoading ? (
            <p className="text-sm text-gray-400">Loading members…</p>
          ) : (members as any[]).length === 0 ? (
            <p className="text-sm text-gray-500">No members found.</p>
          ) : (
            <div className="space-y-2">
              {(members as any[]).map((m: any) => {
                const isMe = m.id === me?.id;
                const initials = String(m.full_name || m.email || '?')
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const canRemove = isMe || canManage;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-800/40 border border-gray-700/40 rounded-lg">
                    <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {m.full_name || m.email}
                        {isMe && <span className="ml-2 text-xs text-emerald-300">(You)</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge tone={roleTone(m.role)}>{String(m.role)}</Badge>
                      {canRemove && (
                        <button
                          onClick={() => {
                            const ok = confirm(isMe ? 'Leave this team?' : `Remove ${m.email}?`);
                            if (!ok) return;
                            remove.mutate({ teamId: effectiveTeamId!, userId: m.id });
                          }}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                        >
                          {isMe ? 'Leave' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

