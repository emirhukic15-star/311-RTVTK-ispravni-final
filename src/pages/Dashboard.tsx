import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dashboardApi, peopleApi, tasksApi, vehiclesApi } from '../services/api';
import { DashboardStats, Task, Person, Vehicle } from '../types';
import { formatWeekdayDate, getCurrentDateForInput } from '../utils/dateFormat';
import {
  Calendar,
  CheckCircle,
  Clock,
  ArrowRight,
  Plus,
  Video,
  X,
  MapPin,
  Users,
  Camera
} from 'lucide-react';
import toast from 'react-hot-toast';

const Dashboard: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateForInput());
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    taskId: number | null;
    newStatus: string | null;
    taskTitle: string;
  }>({
    isOpen: false,
    taskId: null,
    newStatus: null,
    taskTitle: ''
  });

  useEffect(() => {
    loadDashboardData();
  }, [user?.newsroom_id, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automatsko ažuriranje datuma svakih 5 minuta
  useEffect(() => {
    const updateDate = () => {
      const currentDate = getCurrentDateForInput();
      if (currentDate !== selectedDate) {
        setSelectedDate(currentDate);
      }
    };

    // Ažuriraj datum svakih 5 minuta
    const interval = setInterval(updateDate, 5 * 60 * 1000);
    
    // Očisti interval kada se komponenta unmount-uje
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Automatsko osvježavanje podataka svakih 60 sekundi
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      loadDashboardData();
    }, 60 * 1000); // 60 sekundi

    return () => clearInterval(refreshInterval);
  }, [selectedDate, user?.newsroom_id]); // eslint-disable-line react-hooks/exhaustive-deps


  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const [statsResponse, tasksResponse, peopleResponse, vehiclesResponse] = await Promise.all([
        dashboardApi.getStats(selectedDate),
        dashboardApi.getTodayTasks(selectedDate),
        peopleApi.getAll(),
        vehiclesApi.getAll()
      ]);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }

      if (tasksResponse.data.success) {
        // Parse JSON strings for arrays
        const parsedTasks = tasksResponse.data.data.map((task: any) => ({
          ...task,
          journalist_ids: typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids || '[]') : (task.journalist_ids || []),
          cameraman_ids: typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids || '[]') : (task.cameraman_ids || []),
          flags: typeof task.flags === 'string' ? JSON.parse(task.flags || '[]') : (task.flags || []),
          vehicle_id: task.vehicle_id ? (typeof task.vehicle_id === 'string' ? parseInt(task.vehicle_id) : task.vehicle_id) : undefined
        }));
        setTodayTasks(parsedTasks);
      }

      if (peopleResponse.data.success) {
        setPeople(peopleResponse.data.data);
      }

      if (vehiclesResponse.data.success) {
        setVehicles(vehiclesResponse.data.data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      DRAFT: 'status-draft',
      PLANIRANO: 'status-planned',
      DODIJELJENO: 'status-assigned',
      U_TOKU: 'status-in-progress',
      SNIMLJENO: 'status-recorded',
      OTKAZANO: 'status-cancelled',
      ARHIVIRANO: 'status-archived'
    };
    return statusClasses[status as keyof typeof statusClasses] || 'status-draft';
  };

  const getCoverageBadge = (type: string) => {
    const coverageClasses = {
      ENG: 'coverage-eng',
      IFP: 'coverage-ifp',
      EFP: 'coverage-efp',
      SNG: 'coverage-sng',
      LIVE: 'coverage-live',
      STUDIO: 'coverage-studio',
      OB: 'coverage-ob',
      'IP Live': 'coverage-ip-live'
    };
    return coverageClasses[type as keyof typeof coverageClasses] || 'coverage-eng';
  };

  const getAttachmentBadge = (type: string) => {
    if (!type) return 'attachment-default';
    const normalizedType = String(type).trim().toUpperCase();
    const attachmentClasses: { [key: string]: string } = {
      'PACKAGE': 'attachment-package',
      'VO': 'attachment-vo',
      'VO/SOT': 'attachment-vo-sot',
      'SOT': 'attachment-sot',
      'FEATURE': 'attachment-feature',
      'NATPKG': 'attachment-natpkg'
    };
    return attachmentClasses[normalizedType] || 'attachment-default';
  };

  const getPersonName = (id: number) => {
    const person = people.find(p => p.id === id);
    return person ? person.name : `ID: ${id}`;
  };

  const getVehicleName = (id: number) => {
    const vehicle = vehicles.find(v => v.id === id);
    return vehicle ? `${vehicle.name} (${vehicle.plate_number})` : `ID: ${id}`;
  };

  const handleStatusUpdate = async (taskId: number, status: string) => {
    try {
      await tasksApi.updateStatus(taskId, status);
      toast.success(`Status zadatka je ažuriran na "${status}"`);
      // Reload tasks to show updated status
      await loadDashboardData();
      // Close confirmation dialog
      setConfirmationDialog({
        isOpen: false,
        taskId: null,
        newStatus: null,
        taskTitle: ''
      });
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Greška prilikom ažuriranja statusa zadatka');
    }
  };


  const handleStatusClick = (taskId: number, newStatus: string, taskTitle: string, currentStatus: string) => {
    // CAMERMAN_EDITOR can now modify status of all tasks
    
    // If clicking on the same status, reset to PLANIRANO
    if (currentStatus === newStatus) {
      setConfirmationDialog({
        isOpen: true,
        taskId,
        newStatus: 'PLANIRANO',
        taskTitle
      });
    } else {
      // Show confirmation dialog for new status
      setConfirmationDialog({
        isOpen: true,
        taskId,
        newStatus,
        taskTitle
      });
    }
  };

  const confirmStatusUpdate = () => {
    if (confirmationDialog.taskId && confirmationDialog.newStatus) {
      handleStatusUpdate(confirmationDialog.taskId, confirmationDialog.newStatus);
    } else {
      setConfirmationDialog({ isOpen: false, taskId: null, newStatus: null, taskTitle: '' });
    }
  };

  const cancelStatusUpdate = () => {
    setConfirmationDialog({
      isOpen: false,
      taskId: null,
      newStatus: null,
      taskTitle: ''
    });
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Mobile Optimized */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
              Dobrodošli, {user?.name}!
            </h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1">
              {user?.role} • {user?.newsroom?.name || 'Administracija'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center space-x-2">
              <label htmlFor="date-picker" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                Datum:
              </label>
              <input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px]"
              />
            </div>
            {hasPermission('task.create') && user?.role !== 'CHIEF_CAMERA' && user?.role !== 'CAMERMAN_EDITOR' && (
              <Link
                to="/dispozicija"
                className="btn btn-primary flex items-center justify-center whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Novi zadatak</span>
                <span className="sm:hidden">Novi</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards - Mobile Optimized */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <div className="card p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center">
              <div className="flex-shrink-0 mb-2 md:mb-0">
                <Calendar className="h-6 w-6 md:h-8 md:w-8 text-primary-600" />
              </div>
              <div className="ml-0 md:ml-4 flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                  Planirani zadatci
                </p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.plannedTasks || 0}</p>
              </div>
            </div>
          </div>

          <div className="card p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center">
              <div className="flex-shrink-0 mb-2 md:mb-0">
                <Clock className="h-6 w-6 md:h-8 md:w-8 text-accent-600" />
              </div>
              <div className="ml-0 md:ml-4 flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                  {user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' ? 'Današnji kamermani' : 
                   user?.role === 'CAMERMAN_EDITOR' ? 'Moji dodijeljeni zadaci' :
                   user?.role === 'PRODUCER' ? 'Aktivni zadaci' : 'Današnji zadaci'}
                </p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' ? stats.activeCameramen : 
                   user?.role === 'CAMERMAN_EDITOR' ? stats.assignedTasks :
                   user?.role === 'PRODUCER' ? stats.activeTasks : stats.todayTasks}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center">
              <div className="flex-shrink-0 mb-2 md:mb-0">
                <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-success-600" />
              </div>
              <div className="ml-0 md:ml-4 flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                  {user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' ? 'Otkazani zadatci' : 
                   user?.role === 'CAMERMAN_EDITOR' ? 'Moji snimljeni zadaci' :
                   user?.role === 'PRODUCER' ? 'Završeni zadaci' : 'Aktivni zadaci'}
                </p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' ? stats.cancelledTasks : 
                   user?.role === 'CAMERMAN_EDITOR' ? stats.myCompletedTasks :
                   user?.role === 'PRODUCER' ? stats.completedTasks : stats.activeTasks}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center">
              <div className="flex-shrink-0 mb-2 md:mb-0">
                <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-success-600" />
              </div>
              <div className="ml-0 md:ml-4 flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                  {user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' ? 'Snimljeni zadatci' : 
                   user?.role === 'CAMERMAN_EDITOR' ? 'Moji otkazani zadaci' :
                   user?.role === 'PRODUCER' ? 'Aktivni kamermani' : 'Završeni zadaci'}
                </p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' ? stats.completedTasks : 
                   user?.role === 'CAMERMAN_EDITOR' ? stats.myCancelledTasks :
                   user?.role === 'PRODUCER' ? stats.activeCameramen : stats.completedTasks}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Today's Tasks */}
      <div className="grid grid-cols-1 gap-6">
        {/* All Today's Tasks */}
        <div>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Zadaci za {formatWeekdayDate(selectedDate)}
              </h2>
              <Link
                to="/dispozicija"
                className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center"
              >
                Vidi sve
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
            
            {todayTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>Nema zadataka za danas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayTasks.map((task) => {
                  // Determine background color based on status for CHIEF_CAMERA and CAMERMAN_EDITOR
                  const getTaskBackgroundColor = () => {
                    if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') {
                      switch (task.status) {
                        case 'SNIMLJENO':
                          return 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700';
                        case 'OTKAZANO':
                          return 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700';
                        default:
                          return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
                      }
                    }
                    return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
                  };

                  return (
                    <div
                      key={task.id}
                      className={`border border-gray-200 dark:border-gray-700 rounded-lg p-3 md:p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-500 ${getTaskBackgroundColor()}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 md:gap-2 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-2 mb-2">
                              <h3 className="text-sm md:text-base lg:text-lg font-semibold text-gray-900 dark:text-gray-100 break-words leading-tight">{task.title}</h3>
                              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                                <span className={`badge text-[10px] md:text-xs ${getStatusBadge(task.status)}`}>
                                  {task.status}
                                </span>
                                <span className={`badge text-[10px] md:text-xs ${getCoverageBadge(task.coverage_type)}`}>
                                  {task.coverage_type}
                                </span>
                                {task.attachment_type && task.attachment_type !== null && task.attachment_type !== undefined && String(task.attachment_type).trim() !== '' && String(task.attachment_type).toUpperCase() !== 'NULL' && (
                                  <span className={`badge text-[10px] md:text-xs ${getAttachmentBadge(task.attachment_type)}`}>
                                    {task.attachment_type}
                                  </span>
                                )}
                                {(() => {
                                  let parsedFlags: string[] = [];
                                  if (Array.isArray(task.flags)) {
                                    parsedFlags = task.flags;
                                  } else if (typeof task.flags === 'string') {
                                    try {
                                      parsedFlags = JSON.parse(task.flags || '[]');
                                    } catch {
                                      parsedFlags = [];
                                    }
                                  }
                                  parsedFlags = parsedFlags.filter((flag: any) => typeof flag === 'string' && flag.trim() !== '');
                                  
                                  return parsedFlags.map((flag: string, index: number) => (
                                    <span 
                                      key={`${task.id}-flag-${index}`} 
                                      className={`badge text-[10px] md:text-xs ${
                                        flag === 'POTVRĐENO' 
                                          ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200' 
                                          : flag === 'HITNO'
                                          ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200'
                                          : 'badge-warning'
                                      }`}
                                    >
                                      {flag === 'POTVRĐENO' ? '✅ ' : ''}{flag === 'HITNO' ? '🚨 ' : ''}{flag}
                                    </span>
                                  ));
                                })()}
                                {(user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA') && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({task.newsroom_name || 'Nepoznata redakcija'})
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4 text-xs md:text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center min-w-0">
                                <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 flex-shrink-0" />
                                <span className="truncate break-all">{task.time_start && task.time_end ? `${task.time_start} - ${task.time_end}` : 'TEMA'}</span>
                              </div>
                              <div className="flex items-center min-w-0">
                                <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 flex-shrink-0" />
                                <span className="truncate break-all">{task.location}</span>
                              </div>
                              <div className="flex items-center min-w-0">
                                <Users className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 flex-shrink-0" />
                                <span className="truncate break-all">{task.journalist_ids.map(id => getPersonName(id)).join(', ') || 'Nije dodjeljen'}</span>
                              </div>
                              <div className="flex items-start min-w-0">
                                <Camera className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 mt-0.5 flex-shrink-0" />
                                <div className="flex flex-col min-w-0 flex-1">
                                  {(task.cameraman_ids && task.cameraman_ids.length > 0 
                                    ? task.cameraman_ids.map((id, index) => (
                                        <span key={`${task.id}-cameraman-${index}`} className="text-xs md:text-sm truncate break-all">
                                          {getPersonName(id)}
                                        </span>
                                      ))
                                    : task.cameraman_id 
                                      ? <span className="text-xs md:text-sm truncate break-all">{getPersonName(task.cameraman_id)}</span>
                                      : <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Nije dodjeljen</span>)}
                                </div>
                              </div>
                            </div>

                            {task.slugline && (
                              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-2 italic break-words">"{task.slugline}"</p>
                            )}
                            
                            {task.description && (
                              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-2 break-words">
                                <p className="break-words">{task.description}</p>
                              </div>
                            )}

                            <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-4 mt-2 md:mt-3 text-[10px] md:text-xs text-gray-500 dark:text-gray-400">
                              <span className="break-words">Redakcija: {task.newsroom_name || 'Nepoznata redakcija'}</span>
                              {task.vehicle_id && (
                                <span className="break-words">
                                  Vozilo: {getVehicleName(task.vehicle_id)}
                                </span>
                              )}
                            </div>
                            
                            {/* Confirmed by info - Show if task is completed or cancelled */}
                            {(task.status === 'SNIMLJENO' || task.status === 'OTKAZANO') && task.confirmed_by_name && (
                              <div className="mt-2 md:mt-3 p-2 md:p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
                                <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2 text-xs md:text-sm">
                                  <span className="font-semibold text-blue-900 dark:text-blue-100 whitespace-nowrap">
                                    {task.status === 'SNIMLJENO' ? '✅ Potvrdio/la:' : '❌ Otkazao/la:'}
                                  </span>
                                  <span className="text-blue-700 dark:text-blue-300 font-medium break-words">{task.confirmed_by_name}</span>
                                  {task.updated_at && (
                                    <span className="text-blue-600 dark:text-blue-400 text-[10px] md:text-xs md:ml-auto whitespace-nowrap">
                                      {new Date(task.updated_at).toLocaleString('hr-HR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Status buttons for CHIEF_CAMERA, CAMERMAN_EDITOR and CAMERA */}
                        {(user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERA' || user?.role === 'CAMERMAN_EDITOR') && (
                          <div className="flex flex-col sm:flex-row gap-2 md:ml-4 md:flex-shrink-0">
                            <button
                              onClick={() => handleStatusClick(task.id, 'SNIMLJENO', task.title, task.status)}
                              className={`px-3 py-1 md:px-4 md:py-2 text-xs md:text-sm rounded-full flex items-center space-x-1 transition-colors min-h-[44px] md:min-h-0 ${
                                task.status === 'SNIMLJENO' 
                                  ? 'bg-green-600 text-white border-2 border-green-700 shadow-md' 
                                  : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                              }`}
                              title={task.status === 'SNIMLJENO' ? 'Kliknite da poništite status' : 'Označi kao snimljeno'}
                            >
                              <Video className="w-3 h-3 md:w-4 md:h-4" />
                              <span>Snimljeno</span>
                              {task.status === 'SNIMLJENO' && (
                                <span className="ml-1 text-xs">✓</span>
                              )}
                            </button>
                            <button
                              onClick={() => handleStatusClick(task.id, 'OTKAZANO', task.title, task.status)}
                              className={`px-3 py-1 md:px-4 md:py-2 text-xs md:text-sm rounded-full flex items-center space-x-1 transition-colors min-h-[44px] md:min-h-0 ${
                                task.status === 'OTKAZANO' 
                                  ? 'bg-red-600 text-white border-2 border-red-700 shadow-md' 
                                  : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'
                              }`}
                              title={task.status === 'OTKAZANO' ? 'Kliknite da poništite status' : 'Označi kao otkazano'}
                            >
                              <X className="w-3 h-3" />
                              <span>Otkazano</span>
                              {task.status === 'OTKAZANO' && (
                                <span className="ml-1 text-xs">✓</span>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmationDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                {confirmationDialog.newStatus === 'SNIMLJENO' ? (
                  <Video className="h-6 w-6 text-green-600 dark:text-green-400" />
                ) : confirmationDialog.newStatus === 'OTKAZANO' ? (
                  <X className="h-6 w-6 text-red-600 dark:text-red-400" />
                ) : (
                  <Clock className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                )}
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Potvrda promene statusa
                </h3>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Zadatak:</strong> {confirmationDialog.taskTitle}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                <strong>Novi status:</strong> {
                  confirmationDialog.newStatus === 'SNIMLJENO' ? 'Snimljeno' :
                  confirmationDialog.newStatus === 'OTKAZANO' ? 'Otkazano' :
                  'Planirano'
                }
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelStatusUpdate}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Otkaži
              </button>
              <button
                onClick={confirmStatusUpdate}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  confirmationDialog.newStatus === 'SNIMLJENO' 
                    ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                    : confirmationDialog.newStatus === 'OTKAZANO'
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                    : 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500'
                }`}
              >
                Potvrdi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
