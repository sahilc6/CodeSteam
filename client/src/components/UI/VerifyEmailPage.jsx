import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/runtimeConfig";

const API = getApiBaseUrl();

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function verify() {
      const token = searchParams.get("token");

      if (!token) {
        setError("Verification token is missing");
        setLoading(false);
        return;
      }

      try {
        const { data } = await axios.get(
          `${API}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
        setMessage(data.message || "Email verified successfully");
      } catch (err) {
        setError(err.response?.data?.error || "Email verification failed");
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-editor-bg text-editor-text flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-editor-sidebar border border-editor-border rounded-xl p-6 shadow-xl">
        <h1 className="text-xl font-semibold mb-4">Email Verification</h1>

        {loading && (
          <p className="text-sm text-editor-muted">Verifying your email...</p>
        )}

        {!loading && message && (
          <div className="space-y-4">
            <p className="text-sm text-green-300 bg-green-900/20 border border-green-900/30 rounded px-3 py-3">
              {message}
            </p>
            <Link to="/" className="text-sm text-editor-accent hover:underline">
              Go to home
            </Link>
          </div>
        )}

        {!loading && error && (
          <div className="space-y-4">
            <p className="text-sm text-editor-red bg-red-900/20 border border-red-900/30 rounded px-3 py-3">
              {error}
            </p>
            <Link to="/" className="text-sm text-editor-accent hover:underline">
              Go to home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
