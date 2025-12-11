import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    this.setState({
      error,
      errorInfo
    });

    // Here you could send error to logging service
    // logErrorToService(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 flex items-center justify-center">
                <AlertTriangle className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="mt-6 text-3xl font-bold text-gray-900">
                Ups! Nešto je pošlo po zlu
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Dogodila se greška u aplikaciji. Molimo pokušajte ponovo.
              </p>
            </div>

            <div className="bg-white py-8 px-6 shadow-lg rounded-lg">
              <div className="space-y-6">
                {/* Error details in development */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="flex">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <h4 className="text-sm font-medium text-red-800">
                          Greška (Development Mode)
                        </h4>
                        <p className="text-sm text-red-700 mt-1">
                          {this.state.error.message}
                        </p>
                        {this.state.errorInfo && (
                          <details className="mt-2">
                            <summary className="text-xs text-red-600 cursor-pointer">
                              Stack trace
                            </summary>
                            <pre className="text-xs text-red-600 mt-1 overflow-auto">
                              {this.state.errorInfo.componentStack}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={this.handleRetry}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Pokušaj ponovo
                  </button>
                  <button
                    onClick={this.handleGoHome}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Početna stranica
                  </button>
                </div>

                {/* Help text */}
                <div className="text-center">
                  <p className="text-xs text-gray-500">
                    Ako se greška nastavi javiti, kontaktirajte administratorski tim.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
