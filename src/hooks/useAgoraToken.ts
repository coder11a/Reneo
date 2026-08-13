import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface AgoraTokenResponse {
  token: string;
  uid: number;
  appId: string;
}

export function useAgoraToken() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchToken = async (channelName: string, role: 'host' | 'audience'): Promise<AgoraTokenResponse> => {
    setLoading(true);
    setError(null);
    try {
      if (!user) {
        throw new Error('You must be logged in to join a live session');
      }

      const { data, error: fnError } = await supabase.functions.invoke('generate-agora-token', {
        body: { channelName, role, userId: user.id },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (!data?.token) throw new Error('No token returned from server');

      return { token: data.token, uid: data.uid, appId: data.appId };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate Agora token';
      console.error('Agora token error:', errorMessage);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return { fetchToken, loading, error };
}
