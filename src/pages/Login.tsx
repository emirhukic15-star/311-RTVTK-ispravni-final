import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Shield } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
      return;
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!username.trim() || !password.trim()) {
      setError('Molimo unesite korisničko ime i lozinku');
      return false;
    }

    setError(null);
    setLoading(true);
    
    try {
      const success = await login({ username, password });
      if (success) {
        setError(null);
        navigate('/dashboard');
        return false;
      } else {
        // Login failed - set error message
        const errorMsg = 'Pogrešno korisničko ime ili lozinka';
        console.log('Login failed, setting error:', errorMsg);
        setError(errorMsg);
        // Force a small delay to ensure state is set
        setTimeout(() => {
          console.log('Error state should be set now');
        }, 100);
        return false;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      // Extract error message
      let errorMessage = 'Pogrešno korisničko ime ili lozinka';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      console.log('Setting error from catch:', errorMessage);
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center">
            <img 
              src="/rtvtk-logo.jpg" 
              alt="RTVTK Logo" 
              className="h-16 w-auto object-contain rounded-lg"
            />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            RTVTK Planner
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Web aplikacija za dispoziciju, raspored i wallboard
          </p>
        </div>


        {/* Login Form */}
        <div className="bg-white py-8 px-6 shadow-lg rounded-lg">
          <form 
            className="space-y-6" 
            onSubmit={handleSubmit}
            noValidate
          >
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg flex items-center shadow-md">
                <svg className="w-5 h-5 mr-2 flex-shrink-0 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold">{error}</span>
              </div>
            )}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                RTVTK PLANER LOGIN
              </label>
              <div className="mt-1 relative">
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    // Clear error when user starts typing
                    if (error) setError(null);
                  }}
                  className="input"
                  placeholder="Unesite USER"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Lozinka
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    // Clear error when user starts typing
                    if (error) setError(null);
                  }}
                  className="input pr-10"
                  placeholder="Unesite PASSWORD"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Unesite USER I PASSWORD
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Prijavi se
                  </>
                )}
              </button>
            </div>
          </form>

        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            © 2025 RTV Tuzlanskog kantona. Sva prava zadržana.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;