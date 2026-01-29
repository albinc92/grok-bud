import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

export type AuthUser = User;

class AuthService {
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private authChangeCallbacks: Set<(user: User | null) => void> = new Set();

  async initialize(): Promise<User | null> {
    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    this.currentSession = session;
    this.currentUser = session?.user ?? null;

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      this.currentSession = session;
      this.currentUser = session?.user ?? null;
      this.notifyAuthChange();
    });

    return this.currentUser;
  }

  onAuthChange(callback: (user: User | null) => void): () => void {
    this.authChangeCallbacks.add(callback);
    return () => this.authChangeCallbacks.delete(callback);
  }

  private notifyAuthChange(): void {
    this.authChangeCallbacks.forEach(cb => cb(this.currentUser));
  }

  getUser(): User | null {
    return this.currentUser;
  }

  getSession(): Session | null {
    return this.currentSession;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  async signUp(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  }

  async signIn(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  }

  async signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('[Auth] Magic link error:', error.message, error);
    }

    return { error };
  }

  async signOut(): Promise<{ error: Error | null }> {
    const { error } = await supabase.auth.signOut();
    return { error };
  }

  async resetPassword(email: string): Promise<{ error: Error | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    return { error };
  }
}

export const authService = new AuthService();
