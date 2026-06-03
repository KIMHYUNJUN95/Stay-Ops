"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppMode } from "@/config/routes";
import { canAccessAdminWeb, canSwitchToFieldMode } from "@/config/roles";
import type { AppSession } from "@/lib/session";

type SessionContextValue = {
  canAccessAdmin: boolean;
  canSwitchMode: boolean;
  mode: AppMode;
  session: AppSession | null;
  setMode: (mode: AppMode) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type SessionProviderProps = {
  children: ReactNode;
  initialSession: AppSession | null;
};

export function SessionProvider({
  children,
  initialSession,
}: SessionProviderProps) {
  const [mode, setModeState] = useState<AppMode>(
    initialSession?.user.preferredMode ?? "mobile",
  );

  const value = useMemo<SessionContextValue>(() => {
    const canAccessAdmin = initialSession
      ? canAccessAdminWeb(initialSession.user.role)
      : false;
    const canSwitchMode = initialSession
      ? canSwitchToFieldMode(initialSession.user.role)
      : false;

    return {
      canAccessAdmin,
      canSwitchMode,
      mode,
      session: initialSession,
      setMode(nextMode) {
        if (nextMode === "admin" && !canAccessAdmin) {
          return;
        }

        if (nextMode === "mobile" && !canSwitchMode) {
          return;
        }

        setModeState(nextMode);
      },
    };
  }, [initialSession, mode]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return context;
}
