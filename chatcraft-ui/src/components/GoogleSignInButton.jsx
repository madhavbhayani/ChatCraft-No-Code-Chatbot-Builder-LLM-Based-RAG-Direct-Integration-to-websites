/**
 * Google Sign-In button with constantly animated gradient border.
 * Uses Google brand colors: #4285f4, #34a853, #fbbc05, #ea4335
 */
export default function GoogleSignInButton({ onClick, loading = false, label = "Continue with Google" }) {
  return (
    <>
      <style>{`
        @keyframes google-gradient-spin {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .google-btn-wrapper {
          position: relative;
          border-radius: 0.5rem;
          padding: 2px;
          background: linear-gradient(270deg, #4285f4, #34a853, #fbbc05, #ea4335, #4285f4, #34a853);
          background-size: 400% 400%;
          animation: google-gradient-spin 3s ease infinite;
        }
        .google-btn-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1rem;
          background: white;
          border-radius: calc(0.5rem - 2px);
          font-weight: 600;
          font-size: 0.875rem;
          color: #374151;
          cursor: pointer;
          transition: background 0.2s;
          border: none;
        }
        .google-btn-inner:hover {
          background: #f9fafb;
        }
        .google-btn-inner:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <div className="google-btn-wrapper">
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          className="google-btn-inner"
        >
          {/* Google "G" Logo SVG */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
            <path fill="#34A853" d="M6.3 14.7l7 5.1C15.2 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.8 6.3 14.7z"/>
            <path fill="#FBBC05" d="M24 45c5.4 0 10.2-1.8 14-4.9l-6.7-5.5C29.5 36.1 27 37 24 37c-6 0-10.6-3.1-11.7-8.5l-7 5.4C8.5 40.3 15.7 45 24 45z"/>
            <path fill="#EA4335" d="M44.5 20H24v8.5h11.7c-.8 3.1-2.5 5.3-4.7 6.9l6.7 5.5C41.6 37.5 46 31 46 24c0-1.3-.2-2.7-.5-4z"/>
          </svg>
          {loading ? "Signing in..." : label}
        </button>
      </div>
    </>
  );
}

