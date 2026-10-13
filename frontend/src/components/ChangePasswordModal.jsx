import { useState } from "react";
import Modal from "./Modal";
import api from "../utils/api";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/users/change-password", { currentPassword, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Could not change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Change Password" onClose={onClose} maxWidth="max-w-sm">
      {success ? (
        <div className="text-center py-4">
          <p className="text-green-400 font-medium mb-4">✓ Password changed successfully</p>
          <button
            onClick={onClose}
            className="bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2 font-medium transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-panelLight border border-border rounded-lg px-3 py-2.5 text-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent hover:bg-accentDark text-white rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-60"
          >
            {submitting ? "Changing..." : "Change Password"}
          </button>
        </form>
      )}
    </Modal>
  );
}
