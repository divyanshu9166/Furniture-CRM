'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext({
  data: null,
  status: 'loading',
  update: () => {},
});

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const router = useRouter();

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      } else {
        setSession(null);
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setSession(null);
    } finally {
      setStatus('authenticated'); // Even if null, we've finished checking
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const value = {
    data: session,
    status: session ? 'authenticated' : (status === 'loading' ? 'loading' : 'unauthenticated'),
    update: fetchSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSession() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useSession must be used within an AuthProvider');
  }
  return context;
}

export async function signOut({ callbackUrl = '/login' } = {}) {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = callbackUrl;
  } catch (error) {
    console.error('Logout failed:', error);
    window.location.href = callbackUrl;
  }
}
