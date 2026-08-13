import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { hashPassword, verifyPassword } from '../lib/auth';
import { Profile, UserRole } from '../types';
import toast from 'react-hot-toast';

/** Minimal user object (replaces Supabase Auth User) */
interface AppUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SESSION_KEY = 'reneo-session';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from localStorage
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const saved = localStorage.getItem(SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { userId: string; email: string };
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', parsed.userId)
            .single();

          if (data && !error) {
            setUser({ id: data.id, email: data.email });
            setProfile(data as Profile);
          } else {
            // Session invalid — clear it
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const signUp = async (email: string, password: string, name: string, role: UserRole) => {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      throw new Error('An account with this email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(password, normalizedEmail);

    // Insert new profile
    const { data, error } = await supabase
      .from('profiles')
      .insert([{ email: normalizedEmail, password_hash: passwordHash, name, role }])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Set session
    const appUser: AppUser = { id: data.id, email: data.email };
    setUser(appUser);
    setProfile(data as Profile);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: data.id, email: data.email }));
    toast.success('Account created!');
  };

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    // Fetch profile by email
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (error || !data) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await verifyPassword(password, normalizedEmail, data.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Set session
    const appUser: AppUser = { id: data.id, email: data.email };
    setUser(appUser);
    setProfile(data as Profile);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: data.id, email: data.email }));
    toast.success('Signed in!');
  };

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    localStorage.removeItem(SESSION_KEY);
    toast.success('Signed out');
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
