"use client";

import { useEffect, useState } from "react";

type AdminToastState = { id: number; message: string; sticky?: boolean } | null;

/**
 * Shared state/behavior for the admin console's bottom-center toast (`.adm-toast` in
 * admin-console.css). Auto-dismisses after 1.8s unless `sticky`; click also dismisses.
 */
export function useAdminToast() {
  const [toast, setToast] = useState<AdminToastState>(null);

  const showToast = (message: string, sticky = false) =>
    setToast({ id: Date.now(), message, sticky });
  const dismiss = () => setToast(null);

  useEffect(() => {
    if (!toast || toast.sticky) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, showToast, dismiss };
}

export function AdminToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="adm-toast" onClick={onDismiss} role="status">
      {message}
    </div>
  );
}
