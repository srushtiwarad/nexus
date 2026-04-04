import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function OAuthSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setTokens = useAuthStore((s) => s.setTokens);

  const [error, setError] = useState<string>('');

  useEffect(() => {
    const access = searchParams.get('access');
    const refresh = searchParams.get('refresh');

    if (!access || !refresh) {
      setError('Missing OAuth tokens. Please try again.');
      return;
    }

    // Save tokens first so axios interceptor can attach Authorization.
    setTokens(access, refresh);

    (async () => {
      try {
        const { data: rawUser } = await authAPI.me();
        // Map API user (snake_case) to frontend User shape.
        const user = {
          id: rawUser.id,
          email: rawUser.email,
          fullName: rawUser.full_name ?? rawUser.fullName ?? '',
          role: rawUser.role,
          avatarUrl: rawUser.avatar_url ?? undefined,
          bio: rawUser.bio ?? undefined,
          emailVerified: !!rawUser.email_verified,
        };
        setAuth(user, access, refresh);
        navigate('/dashboard', { replace: true });
      } catch (e: any) {
        setError(e?.response?.data?.error || 'OAuth verification failed.');
        navigate('/login', { replace: true });
      }
    })();
  }, [navigate, searchParams, setAuth, setTokens]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-950 text-white">
      <div className="glass-card rounded-2xl p-8 text-center max-w-md">
        <h1 className="text-xl font-semibold mb-3">Signing you in…</h1>
        <p className="text-sm text-gray-400">
          {error || 'Please wait while we complete authentication.'}
        </p>
      </div>
    </div>
  );
}

