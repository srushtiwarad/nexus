// nexus/frontend/src/components/projects/ProjectsPage.tsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projectsAPI } from '../../services/api';
import { format } from 'date-fns';

const PROJECT_COLORS = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444'];

const TEMPLATES = [
  {
    name: 'Product Roadmap',
    description: 'Plan upcoming releases, epics, and milestones for your product.',
    color: '#6366f1',
  },
  {
    name: 'Bug Tracker',
    description: 'Capture, triage, and resolve bugs across your projects.',
    color: '#ef4444',
  },
  {
    name: 'Sprint Board',
    description: 'Organise sprints, tasks, and reviews for your team.',
    color: '#10b981',
  },
];

function CreateProjectModal({
  onClose,
  initialName,
  initialDescription,
  initialColor = '#6366f1',
}: {
  onClose: () => void;
  initialName?: string;
  initialDescription?: string;
  initialColor?: string;
}) {
  const [name, setName] = useState(initialName || '');
  const [description, setDescription] = useState(initialDescription || '');
  const [color, setColor] = useState(initialColor);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (d: object) => projectsAPI.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-5">New project</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Project name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Website Redesign"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional project description…"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        {mutation.error && (
          <p className="text-sm text-red-400 mt-3">{(mutation.error as any)?.response?.data?.error}</p>
        )}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && mutation.mutate({ name, description, color })}
            disabled={!name.trim() || mutation.isPending}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [templateDefaults, setTemplateDefaults] = useState<{
    name?: string;
    description?: string;
    color?: string;
  } | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setTemplateDefaults(null);
      setShowCreate(true);
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsAPI.list().then(r => r.data),
  });

  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const filteredProjects = (projects as any[]).filter((p: any) => {
    if (filter === 'active') return p.status === 'active';
    if (filter === 'archived') return p.status === 'archived';
    return true;
  });

  function safeFormatDate(value: any) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, 'MMM d');
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-gray-400 mt-1">
            {filteredProjects.length} {filter === 'archived' ? 'archived' : 'active'} project
            {filteredProjects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-full bg-gray-900 border border-gray-800 px-1 py-1 text-xs">
            {(['all','active','archived'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded-full capitalize ${
                  filter === f ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setTemplateDefaults(null); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New project
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TEMPLATES.map(t => (
            <button
              key={t.name}
              onClick={() => { setTemplateDefaults(t); setShowCreate(true); }}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 text-left transition-all hover:shadow-lg hover:shadow-black/20"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                   style={{ backgroundColor: `${t.color}20` }}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
              </div>
              <h3 className="font-semibold text-white mb-1">{t.name}</h3>
              <p className="text-xs text-gray-500">{t.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p: any) => (
            <button
              key={p.id}
              onClick={() => navigate(`/dashboard/projects/${p.id}`)}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 text-left transition-all hover:shadow-lg hover:shadow-black/20 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${p.color}20` }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                </div>
                <span className="text-xs text-gray-500 font-medium capitalize">{p.my_role}</span>
              </div>
              <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">{p.name}</h3>
              {p.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>
              )}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
                <span className="text-xs text-gray-500">
                  {p.open_tasks ?? 0} open task{p.open_tasks !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-gray-600">
                  {safeFormatDate(p.updated_at || p.created_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          initialName={templateDefaults?.name}
          initialDescription={templateDefaults?.description}
          initialColor={templateDefaults?.color}
        />
      )}
    </div>
  );
}
