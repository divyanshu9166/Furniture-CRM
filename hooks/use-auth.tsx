"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

interface AuthUser {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    staffId?: number | null;
    created_at?: string | null;
}

interface Profile {
    id: string;
    user_id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    role: string | null;
}

interface AuthContextValue {
    user: AuthUser | null;
    profile: Profile | null;
    loading: boolean;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async (userId: string) => {
        const supabase = createClient();
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, user_id, full_name, email, avatar_url, role")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) {
                console.error("[useAuth] fetchProfile error:", {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                });
                return;
            }

            if (data) setProfile(data as Profile);
        } catch (err) {
            console.error("[useAuth] fetchProfile threw:", err);
        }
    }, []);

    useEffect(() => {
        const supabase = createClient();
        let mounted = true;

        const safetyTimer = setTimeout(() => {
            if (mounted) {
                console.warn("[useAuth] getSession() timed out after 3s");
                setLoading(false);
            }
        }, 3000);

        const init = async () => {
            try {
                const {
                    data: { session },
                    error,
                } = await supabase.auth.getSession();

                if (error) console.error("[useAuth] getSession error:", error.message);

                if (!mounted) return;
                const currentUser = (session?.user ?? null) as AuthUser | null;
                setUser(currentUser);

                if (currentUser) {
                    fetchProfile(currentUser.id);
                } else {
                    setProfile(null);
                }
            } catch (err) {
                console.error("[useAuth] init threw:", err);
            } finally {
                if (mounted) setLoading(false);
                clearTimeout(safetyTimer);
            }
        };

        init();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) return;
            const currentUser = (session?.user ?? null) as AuthUser | null;
            setUser(currentUser);

            if (currentUser) {
                fetchProfile(currentUser.id);
            } else {
                setProfile(null);
            }

            setLoading(false);
        });

        return () => {
            mounted = false;
            clearTimeout(safetyTimer);
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const signOut = useCallback(async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        window.location.href = "/login";
    }, []);

    const refreshProfile = useCallback(async () => {
        if (!user?.id) return;
        await fetchProfile(user.id);
    }, [user?.id, fetchProfile]);

    return (
        <AuthContext.Provider
            value={{ user, profile, loading, signOut, refreshProfile }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        return {
            user: null,
            profile: null,
            loading: false,
            signOut: async () => {
                window.location.href = "/login";
            },
            refreshProfile: async () => { },
        };
    }
    return ctx;
}
