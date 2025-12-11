import React from 'react';
import { AlertTriangle, Clock, LogOut, RefreshCw } from 'lucide-react';

interface AutoLogoutWarningProps {
  timeLeft: number;
  onExtendSession: () => void;
  onLogoutNow: () => void;
}

const AutoLogoutWarning: React.FC<AutoLogoutWarningProps> = ({
  timeLeft,
  onExtendSession,
  onLogoutNow
}) => {
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">
              Sesija će uskoro isteći
            </h3>
            <p className="text-sm text-gray-600">
              Niste aktivni već neko vrijeme
            </p>
          </div>
        </div>

        {/* Countdown */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-100 rounded-full mb-3">
            <Clock className="h-8 w-8 text-orange-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatTime(timeLeft)}
          </div>
          <p className="text-sm text-gray-600">
            Automatsko odjavljivanje za
          </p>
        </div>

        {/* Warning message */}
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4 mb-6">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-orange-800">
                Upozorenje
              </h4>
              <p className="text-sm text-orange-700 mt-1">
                Vaša sesija će se automatski završiti ako ne nastavite da koristite aplikaciju.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onExtendSession}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Produži sesiju
          </button>
          <button
            onClick={onLogoutNow}
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Odjavi se sada
          </button>
        </div>

        {/* Info */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Kliknite bilo gdje ili nastavite da koristite aplikaciju da produžite sesiju
          </p>
        </div>
      </div>
    </div>
  );
};

export default AutoLogoutWarning;
