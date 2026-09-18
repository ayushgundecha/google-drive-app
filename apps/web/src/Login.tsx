import { useLocation } from 'react-router-dom';
import { Cloud, ShieldCheck } from 'lucide-react';
import { DriveMark } from './components';
export function Login() {
  const params = new URLSearchParams(useLocation().search);
  const error = params.get('authError');
  const signedOut = params.get('signedOut') === '1';
  return (
    <div className="login-page">
      <header>
        <DriveMark />
        <span>Drive</span>
      </header>
      <main className="login-card">
        <div className="login-symbol">
          <Cloud size={54} strokeWidth={1.3} />
        </div>
        <div className="eyebrow">A LITTLE SPACE FOR EVERYTHING</div>
        <h1>
          Your files.
          <br />
          Right where you need them.
        </h1>
        <p>
          A private home for your documents, ideas, and everyday essentials. Keep them together.
          Share them with your people.
        </p>
        {signedOut && (
          <p role="status" className="signed-out-message">
            You’ve signed out of Drive.
          </p>
        )}
        <a className="google-button" href="/auth/google">
          <img src="/brand/google.png" alt="" width="24" height="24" />
          Continue with Google
        </a>
        {error && (
          <p role="alert" className="inline-error">
            {error === 'unconfigured'
              ? 'Google sign-in has not been configured on this server yet.'
              : 'We couldn’t complete sign-in. Please try again with a verified Google account.'}
          </p>
        )}
        <div className="login-note">
          <ShieldCheck size={16} />
          Private by default. Shared only by you.
        </div>
      </main>
      <footer>One place. A little more organized.</footer>
    </div>
  );
}
