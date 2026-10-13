import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import ChangePasswordModal from "./ChangePasswordModal";

const navItemBase =
  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors";

function NavLinks({ isOwner, onNavigate }) {
  const linkClass = ({ isActive }) =>
    `${navItemBase} ${isActive ? "bg-accent text-white" : "text-slate-300 hover:bg-panel"}`;

  return (
    <>
      <NavLink to="/dashboard" className={linkClass} onClick={onNavigate}>
        🏠 Dashboard
      </NavLink>
      <NavLink to="/pending-payments" className={linkClass} onClick={onNavigate}>
        💳 Pending Payments
      </NavLink>
      {isOwner && (
        <>
          <NavLink to="/analytics" className={linkClass} onClick={onNavigate}>
            📊 Analytics
          </NavLink>
          <NavLink to="/history" className={linkClass} onClick={onNavigate}>
            🕐 History
          </NavLink>
          <NavLink to="/settings" className={linkClass} onClick={onNavigate}>
            ⚙️ Settings
          </NavLink>
          <NavLink to="/users" className={linkClass} onClick={onNavigate}>
            👥 Users
          </NavLink>
        </>
      )}
    </>
  );
}

export default function Navbar({ activeCount = 0 }) {
  const { user, logout, isOwner } = useAuth();
  const { businessName, appTagline, logoUrl } = useBranding();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="border-b border-border bg-base sticky top-0 z-40">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-contain bg-white/5 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-accent flex items-center justify-center text-lg sm:text-2xl shrink-0">
              🎮
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
              {businessName}
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-tight hidden xs:block truncate">
              {appTagline}
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-2">
          <NavLinks isOwner={isOwner} />
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="bg-panel border border-border rounded-lg px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-white whitespace-nowrap">
            Active: {activeCount}
          </span>
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="text-right hidden md:block hover:opacity-75 transition-opacity"
            title="Change password"
          >
            <p className="text-sm font-medium text-white leading-tight">{user?.name}</p>
            <p className="text-xs text-slate-400 leading-tight capitalize">{user?.role}</p>
          </button>
          <button
            onClick={handleLogout}
            className="hidden lg:inline text-sm text-slate-300 hover:text-white border border-border hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            Logout
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-border text-slate-300 hover:bg-panel"
            aria-label="Toggle menu"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="lg:hidden border-t border-border bg-base px-3 py-3 flex flex-col gap-1">
          <NavLinks isOwner={isOwner} onNavigate={() => setMenuOpen(false)} />
          <div className="flex items-center justify-between border-t border-border mt-2 pt-3 px-2">
            <button
              onClick={() => {
                setChangePasswordOpen(true);
                setMenuOpen(false);
              }}
              className="text-left hover:opacity-75 transition-opacity"
            >
              <p className="text-sm font-medium text-white leading-tight">{user?.name}</p>
              <p className="text-xs text-slate-400 leading-tight capitalize">
                {user?.role} · change password
              </p>
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-300 hover:text-white border border-border hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              Logout
            </button>
          </div>
        </nav>
      )}

      {changePasswordOpen && (
        <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />
      )}
    </header>
  );
}
