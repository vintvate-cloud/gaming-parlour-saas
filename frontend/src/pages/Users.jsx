import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/users");
    setUsers(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/users", { name, username, password, role });
      setName("");
      setUsername("");
      setPassword("");
      setRole("employee");
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(u) {
    if (!confirm(`Remove ${u.name}'s account? They will no longer be able to log in.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Could not delete user");
    }
  }

  const [resettingId, setResettingId] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { username, temporaryPassword }

  async function handleResetPassword(u) {
    if (!confirm(`Generate a new temporary password for ${u.name}?`)) return;
    setResettingId(u.id);
    setResetResult(null);
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      setResetResult({ name: u.name, ...res.data });
    } catch (err) {
      alert(err.response?.data?.error || "Could not reset password");
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-base">
      <Navbar />
      <main className="px-6 py-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">User Management</h1>

        <div className="bg-panel border border-border rounded-xl p-6 mb-6">
          <h3 className="font-bold text-white mb-4">Add New User</h3>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
              >
                <option value="employee">Employee (Dashboard only)</option>
                <option value="owner">Owner (Full access)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
              >
                {submitting ? "Creating..." : "+ Create User"}
              </button>
            </div>
          </form>
        </div>

        <h3 className="font-bold text-white mb-4">Existing Users</h3>

        {resetResult && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-green-300 font-medium">
                New temporary password for {resetResult.name}:
              </p>
              <p className="text-2xl font-mono font-bold text-white mt-1">
                {resetResult.temporaryPassword}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Username: {resetResult.username} · Share this with them now - it won't be shown
                again. They can change it after logging in.
              </p>
            </div>
            <button
              onClick={() => setResetResult(null)}
              className="text-slate-400 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="bg-panel border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3"
              >
                <div>
                  <p className="font-bold text-white">
                    {u.name}{" "}
                    {u.id === currentUser.id && (
                      <span className="text-xs text-slate-500">(you)</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-400">@{u.username}</p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <span
                    className={`text-xs font-semibold rounded-full px-3 py-1 capitalize ${
                      u.role === "owner"
                        ? "bg-accent/20 text-accent"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {u.role}
                  </span>
                  <button
                    onClick={() => handleResetPassword(u)}
                    disabled={resettingId === u.id}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {resettingId === u.id ? "..." : "Reset Password"}
                  </button>
                  {u.id !== currentUser.id && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-lg p-2"
                      title="Remove user"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
