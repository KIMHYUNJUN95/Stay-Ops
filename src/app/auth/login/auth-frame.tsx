import "./auth-console.css";
import { LanguageSheet } from "@/app/auth/login/language-sheet";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { ReactNode } from "react";

/* Brand-panel feature icons (warm gold on the espresso panel). */
const Zap = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
);
const Shield = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 2.5v5.2c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Layers = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4l8 4-8 4-8-4 8-4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M4 12l8 4 8-4M4 16l8 4 8-4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
);

/**
 * AuthFrame — the desktop console auth surface frame (split layout).
 * Left: warm espresso/clay brand panel. Right: language pill + the auth card.
 * Ported from the "Stay Ari Admin Console" handoff. Brand copy is localized.
 * See docs/product/05-admin-web-ia.md → "Admin Login Screen".
 */
export function AuthFrame({
  locale,
  next,
  view,
  help,
  children,
}: {
  locale: Locale;
  next: string;
  view?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  const c = getDictionary(locale).auth.console;
  const feats = [
    { ic: Zap, t: c.feat1T, s: c.feat1S },
    { ic: Shield, t: c.feat2T, s: c.feat2S },
    { ic: Layers, t: c.feat3T, s: c.feat3S },
  ];

  return (
    <div className="authx">
      <div className="auth">
        <aside className="auth-brand">
          <div className="auth-brand__deco a" />
          <div className="auth-brand__deco b" />
          <div className="auth-brand__deco c" />
          <div className="auth-brand__top">
            <span className="auth-brand__mark" aria-hidden="true" />
            <div>
              <div className="auth-brand__wm">Stay Ops</div>
              <div className="auth-brand__role">{c.role}</div>
            </div>
          </div>
          <div className="auth-brand__mid">
            <h1 className="auth-brand__head">{c.head}</h1>
            <p className="auth-brand__lede">{c.lede}</p>
            <div className="auth-brand__feats">
              {feats.map((f, i) => (
                <div className="auth-feat" key={i}>
                  <span className="auth-feat__ic"><span className="ic">{f.ic}</span></span>
                  <div>
                    <div className="auth-feat__t">{f.t}</div>
                    <div className="auth-feat__s">{f.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="auth-brand__foot">
            <span>{c.foot1}</span>
            <span className="dot" />
            <span>{c.foot2}</span>
            <span className="dot" />
            <span>{c.foot3}</span>
          </div>
        </aside>

        <div className="auth-action">
          <div className="auth-topbar">
            <span className="grow" />
            {help ? <span className="auth-help">{help}</span> : null}
            <LanguageSheet locale={locale} next={next} view={view} />
          </div>
          <div className="auth-stage">{children}</div>
        </div>
      </div>
    </div>
  );
}
