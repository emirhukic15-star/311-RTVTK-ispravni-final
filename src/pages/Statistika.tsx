import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { peopleApi, statisticsApi, newsroomsApi } from '../services/api';
import { Person, TaskFlag, Newsroom } from '../types';
import {
  Users,
  Filter,
  Download,
  BarChart3,
  TrendingUp,
  FileText,
  Clock,
  Camera,
  CheckCircle,
  Percent,
  Video
} from 'lucide-react';
import toast from 'react-hot-toast';

interface StatisticsData {
  totalTasks: number;
  tasksByFlag: Record<TaskFlag, number>;
  tasksByNewsroom: Array<{
    name: string;
    count: number;
  }>;
  tasksByNewsroomDetailed: Array<{
    name: string;
    total: number;
    flags: Record<TaskFlag, number>;
  }>;
  tasksByFlags?: Array<{
    flag: string;
    count: number;
  }>;
  tasksByCoverageType?: Array<{
    type: string;
    count: number;
  }> | Record<string, number>;
  tasksByAttachmentType?: Array<{
    type: string;
    count: number;
  }> | Record<string, number>;
  mostActiveNewsroom?: string;
  dateRange: {
    from: string;
    to: string;
  };
  newsroomFilter: string | null;
}

interface CameramanStatistics {
  cameramen: Array<{
    cameramanId: number;
    cameramanName: string;
    totalTasks: number;
    completedTasks: number;
    cancelledTasks: number;
    successRate: number;
    taskTypes: {
      TEMA: number;
      UŽIVO: number;
      REŽIJA: number;
      PACKAGE: number;
      "VIBER/SKYPE": number;
      "SLUŽBENI PUT": number;
      EMISIJA: number;
      HITNO: number;
    };
    newsroomStats: Record<string, number>;
    tasks: Array<{
      id: number;
      title: string;
      date: string;
      timeStart: string;
      timeEnd: string;
      status: string;
      flags: string[];
      newsroomName: string;
    }>;
  }>;
  overall: {
    totalCameramen: number;
    totalTasks: number;
    totalCompleted: number;
    totalCancelled: number;
    averageSuccessRate: number;
    mostActiveCameraman: {
      totalTasks: number;
      cameramanName: string;
    };
  };
  timeline: Array<{
    date: string;
    count: number;
  }>;
  dateRange: {
    from: string;
    to: string;
  };
}

const Statistika: React.FC = () => {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [newsrooms, setNewsrooms] = useState<Newsroom[]>([]);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [cameramanStats, setCameramanStats] = useState<CameramanStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    newsroomId: '', // empty means "SVE REDAKCIJE"
    employeeId: '' // empty means "SVI UPOSLENICI"
  });

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') {
      loadStatisticsByPeople(); // Use people statistics for CHIEF_CAMERA and CAMERMAN_EDITOR
    } else if (user?.role === 'PRODUCER') {
      loadStatistics(); // Use newsroom statistics for PRODUCER
    } else if (user?.role === 'EDITOR') {
      // EDITOR always uses people statistics - either for all employees in their newsroom or specific employee
      loadStatisticsByPeople();
    } else if (!['CAMERA', 'ADMIN'].includes(user?.role || '') && people.length > 0) {
      loadStatisticsByPeople(); // Use people statistics for other roles
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, people, user?.role]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      if (['CHIEF_CAMERA', 'CAMERMAN_EDITOR', 'CAMERA', 'ADMIN'].includes(user?.role || '')) {
        // For CHIEF_CAMERA, CAMERMAN_EDITOR, CAMERA, and ADMIN, we don't need to load people data
        setLoading(false);
        return;
      }
      
      // Load people data
      const peopleResponse = await peopleApi.getAll();
      
      // Handle the API response structure
      let peopleData: Person[] = [];
      if (peopleResponse.data.success) {
        peopleData = peopleResponse.data.data;
      } else if (Array.isArray(peopleResponse.data)) {
        peopleData = peopleResponse.data;
      }
      
      // For PRODUCER, show all people; for others, filter by newsroom
      const filteredPeople = user?.role === 'PRODUCER' 
        ? peopleData 
        : peopleData.filter((person: any) => person.newsroom_id === user?.newsroom_id);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('=== LOAD DATA DEBUG ===');
        console.log('User:', { role: user?.role, newsroom_id: user?.newsroom_id });
        console.log('All people:', peopleData.length);
        console.log('Filtered people:', filteredPeople.length);
        console.log('Filtered people details:', filteredPeople.map((p: any) => ({ name: p.name, role: p.role, newsroom_id: p.newsroom_id })));
      }
      
      setPeople(filteredPeople);

      // Load newsrooms data (only for PRODUCER role)
      if (user?.role === 'PRODUCER') {
        const newsroomsResponse = await newsroomsApi.getAll();
        
        let newsroomsData: Newsroom[] = [];
        if (newsroomsResponse.data.success) {
          newsroomsData = newsroomsResponse.data.data;
        } else if (Array.isArray(newsroomsResponse.data)) {
          newsroomsData = newsroomsResponse.data;
        }
        
        setNewsrooms(newsroomsData.filter((newsroom: any) => newsroom.is_active));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Greška prilikom učitavanja podataka');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      setLoading(true);
      
      const response = await statisticsApi.getStats(filters.dateFrom, filters.dateTo, filters.newsroomId);
      
      if (response.data.success) {
        console.log('Statistics response:', response.data.data);
        console.log('Coverage types:', response.data.data.tasksByCoverageType);
        console.log('Attachment types:', response.data.data.tasksByAttachmentType);
        setStatistics(response.data.data);
      } else {
        toast.error('Greška prilikom učitavanja statistika');
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
      toast.error('Greška prilikom učitavanja statistika');
    } finally {
      setLoading(false);
    }
  };

  const loadStatisticsByPeople = async () => {
    try {
      setLoading(true);
      
      // For EDITOR: don't pass newsroomId (backend will filter by user's newsroom automatically)
      // For other roles: pass newsroomId if selected
      const newsroomIdParam = user?.role === 'EDITOR' ? undefined : (filters.newsroomId || undefined);
      const employeeIdParam = user?.role === 'EDITOR' && filters.employeeId ? filters.employeeId : undefined;
      
      
      const response = await statisticsApi.getPeopleStats(filters.dateFrom, filters.dateTo, newsroomIdParam, employeeIdParam);
      
      if (response.data.success) {
        const data = response.data.data;
        console.log('People statistics response:', data);
        console.log('Coverage types:', data.tasksByCoverageType);
        console.log('Coverage types type:', typeof data.tasksByCoverageType, Array.isArray(data.tasksByCoverageType));
        console.log('Attachment types:', data.tasksByAttachmentType);
        console.log('Attachment types type:', typeof data.tasksByAttachmentType, Array.isArray(data.tasksByAttachmentType));
        
        // For CHIEF_CAMERA and CAMERMAN_EDITOR, set cameramanStats instead of statistics
        if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') {
          // Transform people statistics to cameraman statistics format
          setCameramanStats({
            cameramen: data.tasksByPeopleDetailed.map((person: any, index: number) => ({
              cameramanId: index + 1, // Use index as ID for unique keys
              cameramanName: person.name,
              totalTasks: person.total,
              completedTasks: person.completed || 0,
              cancelledTasks: person.cancelled || 0,
              successRate: person.successRate || 0,
              taskTypes: {
                TEMA: person.flags?.['TEMA'] || 0,
                UŽIVO: person.flags?.['UŽIVO'] || 0,
                REŽIJA: person.flags?.['REŽIJA'] || 0,
                PACKAGE: person.flags?.['PACKAGE'] || 0,
                "VIBER/SKYPE": person.flags?.['VIBER/SKYPE'] || 0,
                "SLUŽBENI PUT": person.flags?.['SLUŽBENI PUT'] || 0,
                EMISIJA: person.flags?.['EMISIJA'] || 0,
                HITNO: person.flags?.['HITNO'] || 0
              },
              newsroomStats: {},
              tasks: []
            })),
            overall: data.overall,
            timeline: [],
            dateRange: { from: filters.dateFrom, to: filters.dateTo }
          });
          } else {
          // Update statistics to show people instead of newsrooms
          setStatistics({
            totalTasks: data.totalTasks,
            tasksByFlag: {
              TEMA: 0,
              UŽIVO: 0,
              REŽIJA: 0,
              "VIBER/SKYPE": 0,
              PACKAGE: 0,
              "SLUŽBENI PUT": 0,
              EMISIJA: 0,
              HITNO: 0,
              "POTVRĐENO": 0,
              RAZMJENA: 0
            }, // Empty for people statistics
            tasksByNewsroom: data.tasksByPeople,
            tasksByNewsroomDetailed: data.tasksByPeopleDetailed,
            tasksByFlags: data.tasksByFlags,
            tasksByCoverageType: data.tasksByCoverageType,
            tasksByAttachmentType: data.tasksByAttachmentType,
            mostActiveNewsroom: data.mostActivePerson,
            dateRange: { from: filters.dateFrom, to: filters.dateTo },
            newsroomFilter: null
          });
        }
      } else {
        toast.error('Greška prilikom učitavanja statistika');
      }
    } catch (error: any) {
      console.error('Error loading statistics by people:', error);
      console.error('Error details:', error.response?.data);
      toast.error('Greška prilikom učitavanja statistika');
    } finally {
      setLoading(false);
    }
  };


  const handleExport = () => {
    if (!statistics) return;

    const csvContent = [
      // Header
      ['Datum od', 'Datum do', user?.role === 'PRODUCER' ? 'Redakcija' : 'Uposlenik', 'Oznaka', 'Ukupno zadataka', 'Zadaci sa oznakom'].join(','),
      // Data
      ...statistics.tasksByNewsroomDetailed.flatMap((newsroom: any) => 
        ['TEMA', 'UŽIVO', 'REŽIJA', 'VIBER/SKYPE', 'PACKAGE', 'SLUŽBENI PUT', 'EMISIJA', 'HITNO'].map((flag: any) => [
          filters.dateFrom,
          filters.dateTo,
          newsroom.name,
          flag,
          newsroom.total,
          newsroom.flags[flag as TaskFlag] || 0
        ].join(','))
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `statistika_${user?.role === 'PRODUCER' ? 'redakcije' : 'uposlenici'}_${filters.dateFrom}_${filters.dateTo}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Statistika je uspešno izvezena!');
  };

  const handleCameramanExport = () => {
    if (!cameramanStats) return;

    const csvContent = [
      // Header
      ['Kamerman', 'Ukupno zadataka', 'Snimljeno', 'Otkazano', 'Stopa uspjeha (%)', 'Studio', 'Teren', 'Uživo', 'Online', 'Ostalo'].join(','),
      // Data
      ...(cameramanStats?.cameramen || []).map((cameraman: any) => [
        cameraman.cameramanName,
        cameraman.totalTasks,
        cameraman.completedTasks,
        cameraman.cancelledTasks,
        cameraman.successRate,
        cameraman.taskTypes.STUDIO,
        cameraman.taskTypes.TEREN,
        cameraman.taskTypes.UŽIVO,
        cameraman.taskTypes.ONLINE,
        cameraman.taskTypes.OSTALO
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `kamerman_statistika_${filters.dateFrom}_${filters.dateTo}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Kamerman statistika je uspešno izvezena!');
  };

  const getFlagColor = (flag: TaskFlag) => {
    const colors: Record<TaskFlag, string> = {
      'TEMA': 'bg-blue-100 text-blue-800',
      'UŽIVO': 'bg-green-100 text-green-800',
      'REŽIJA': 'bg-purple-100 text-purple-800',
      'VIBER/SKYPE': 'bg-orange-100 text-orange-800',
      'PACKAGE': 'bg-red-100 text-red-800',
      'SLUŽBENI PUT': 'bg-yellow-100 text-yellow-800',
      'EMISIJA': 'bg-indigo-100 text-indigo-800',
      'HITNO': 'bg-red-100 text-red-800',
      'POTVRĐENO': 'bg-green-100 text-green-800',
      'RAZMJENA': 'bg-cyan-100 text-cyan-800'
    };
    return colors[flag] || 'bg-gray-100 text-gray-800';
  };

  const getTaskTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'TEMA': 'bg-blue-100 text-blue-800',
      'UŽIVO': 'bg-red-100 text-red-800',
      'REŽIJA': 'bg-purple-100 text-purple-800',
      'PACKAGE': 'bg-green-100 text-green-800',
      'VIBER/SKYPE': 'bg-yellow-100 text-yellow-800',
      'SLUŽBENI PUT': 'bg-indigo-100 text-indigo-800',
      'EMISIJA': 'bg-pink-100 text-pink-800',
      'HITNO': 'bg-red-200 text-red-900'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getCoverageBadge = (type: string) => {
    const coverageClasses: Record<string, string> = {
      'ENG': 'coverage-eng',
      'IFP': 'coverage-ifp',
      'EFP': 'coverage-efp',
      'SNG': 'coverage-sng',
      'LIVE': 'coverage-live',
      'STUDIO': 'coverage-studio',
      'OB': 'coverage-ob',
      'IP Live': 'coverage-ip-live'
    };
    return coverageClasses[type] || 'coverage-eng';
  };

  const getAttachmentBadge = (type: string) => {
    if (!type) return 'attachment-default';
    const normalizedType = String(type).trim().toUpperCase();
    const attachmentClasses: Record<string, string> = {
      'PACKAGE': 'attachment-package',
      'VO': 'attachment-vo',
      'VO/SOT': 'attachment-vo-sot',
      'SOT': 'attachment-sot',
      'FEATURE': 'attachment-feature',
      'NATPKG': 'attachment-natpkg'
    };
    return attachmentClasses[normalizedType] || 'attachment-default';
  };

  if (loading && !statistics && !cameramanStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Show cameraman statistics for CHIEF_CAMERA and CAMERMAN_EDITOR
  if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Camera className="w-8 h-8 mr-3 text-primary-600 dark:text-primary-400" />
                Kamerman Statistika
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Analiza performansi kamermana po zadacima i redakcijama
              </p>
            </div>
            <button
              onClick={handleCameramanExport}
              className="btn btn-secondary flex items-center"
              disabled={!cameramanStats}
            >
              <Download className="w-4 h-4 mr-2" />
              Izvezi CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center mb-4">
            <Filter className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filteri</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Datum od
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="input"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Datum do
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                className="input"
              />
            </div>
          </div>
        </div>

        {cameramanStats && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Camera className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ukupno kamermana</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{cameramanStats?.overall?.totalCameramen || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Video className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ukupno zadataka</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{cameramanStats?.overall?.totalTasks || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Snimljeno</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{cameramanStats?.overall?.totalCompleted || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Percent className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Prosječna stopa uspjeha</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{cameramanStats?.overall?.averageSuccessRate || 0}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Cameraman Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Detalji po kamermanima</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Kamerman
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Ukupno
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Snimljeno
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Otkazano
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Stopa uspjeha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Tipovi zadataka
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {(cameramanStats?.cameramen || []).map((cameraman) => (
                      <tr key={cameraman.cameramanId} className="dark:bg-gray-800">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {cameraman.cameramanName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {cameraman.totalTasks}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {cameraman.completedTasks}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {cameraman.cancelledTasks}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            cameraman.successRate >= 80 ? 'bg-green-100 text-green-800' :
                            cameraman.successRate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {cameraman.successRate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <div className="flex space-x-1">
                            {Object.entries(cameraman.taskTypes).map(([type, count]) => (
                              count > 0 && (
                                <span key={type} className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTaskTypeColor(type)}`}>
                                  {type}: {count}
                                </span>
                              )
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Regular statistics for other users
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <BarChart3 className="w-8 h-8 mr-3 text-primary-600 dark:text-primary-400" />
              Statistika
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {user?.role === 'PRODUCER'
                ? 'Analiza zadataka po redakcijama, uposlenicima i oznakama'
                : user?.role === 'EDITOR'
                ? 'Analiza zadataka po uposlenicima u vašoj redakciji'
                : 'Analiza zadataka po uposlenicima i oznakama'
              }
            </p>
          </div>
          <button
            onClick={handleExport}
            className="btn btn-secondary flex items-center"
            disabled={!statistics}
          >
            <Download className="w-4 h-4 mr-2" />
            Izvezi CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center mb-4">
          <Filter className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filteri</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Datum od
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              className="input"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Datum do
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              className="input"
            />
          </div>

          {user?.role === 'PRODUCER' && (
            <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Redakcija
            </label>
              <select
                value={filters.newsroomId}
                onChange={(e) => setFilters(prev => ({ ...prev, newsroomId: e.target.value }))}
                className="input"
              >
                <option value="">Sve redakcije</option>
                {newsrooms.map(newsroom => (
                  <option key={newsroom.id} value={newsroom.id}>
                    {newsroom.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {user?.role === 'EDITOR' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uposlenik
              </label>
              <select
                value={filters.employeeId}
                onChange={(e) => setFilters(prev => ({ ...prev, employeeId: e.target.value }))}
                className="input"
              >
                <option value="">Svi uposlenici</option>
                {people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {!['PRODUCER', 'EDITOR', 'CHIEF_CAMERA', 'CAMERMAN_EDITOR', 'CAMERA', 'ADMIN'].includes(user?.role || '') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uposlenik
              </label>
              <select
                value={filters.newsroomId}
                onChange={(e) => setFilters(prev => ({ ...prev, newsroomId: e.target.value }))}
                className="input"
              >
                <option value="">Svi uposlenici</option>
                {people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {statistics && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ukupno zadataka</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{statistics.totalTasks}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{user?.role === 'PRODUCER' ? 'Redakcija' : 'Uposlenik'}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{statistics.tasksByNewsroom?.length || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{user?.role === 'PRODUCER' ? 'Najaktivnija redakcija' : 'Najaktivniji uposlenik'}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {statistics.tasksByNewsroom?.[0]?.name || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Period</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {Math.ceil((new Date(filters.dateTo).getTime() - new Date(filters.dateFrom).getTime()) / (1000 * 60 * 60 * 24))} dana
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tasks by Newsrooms */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{user?.role === 'PRODUCER' ? 'Zadaci po redakcijama' : 'Zadaci po uposlenicima'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(statistics.tasksByNewsroom || []).map((newsroom, index) => (
                <div key={newsroom.name} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{newsroom.name}</h3>
                    <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">{newsroom.count}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {newsroom.count === 1 ? '1 zadatak' : `${newsroom.count} zadataka`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks by Flags */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Zadaci po oznakama</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {['TEMA', 'UŽIVO', 'REŽIJA', 'VIBER/SKYPE', 'PACKAGE', 'SLUŽBENI PUT', 'EMISIJA', 'HITNO'].map(flag => {
                // For people statistics, use tasksByFlags from backend, otherwise use tasksByFlag
                const flagCount = statistics.tasksByFlags 
                  ? statistics.tasksByFlags.find(f => f.flag === flag)?.count || 0
                  : statistics.tasksByFlag[flag as TaskFlag] || 0;
                
                return (
                  <div key={flag} className="text-center">
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getFlagColor(flag as TaskFlag)}`}>
                      {flag}
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                      {flagCount}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tasks by Coverage Type */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Zadaci po tipu pokrivanja</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {(() => {
                const coverageTypes = ['ENG', 'IFP', 'EFP', 'SNG', 'LIVE', 'STUDIO', 'OB', 'IP Live'];
                let coverageData: Array<{ type: string; count: number }> = [];
                
                if (statistics.tasksByCoverageType) {
                  if (Array.isArray(statistics.tasksByCoverageType)) {
                    coverageData = statistics.tasksByCoverageType;
                  } else {
                    coverageData = Object.entries(statistics.tasksByCoverageType).map(([type, count]) => ({ 
                      type, 
                      count: count as number 
                    }));
                  }
                }
                
                return coverageTypes.map(type => {
                  const typeData = coverageData.find(c => c.type === type);
                  const count = typeData ? typeData.count : 0;
                  
                  return (
                    <div key={type} className="text-center">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium badge ${getCoverageBadge(type)}`}>
                        {type}
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                        {count}
                      </p>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Tasks by Attachment Type */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Zadaci po tipu priloga</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {(() => {
                const attachmentTypes = ['PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG'];
                let attachmentData: Array<{ type: string; count: number }> = [];
                
                if (statistics.tasksByAttachmentType) {
                  if (Array.isArray(statistics.tasksByAttachmentType)) {
                    attachmentData = statistics.tasksByAttachmentType;
                  } else {
                    attachmentData = Object.entries(statistics.tasksByAttachmentType).map(([type, count]) => ({ 
                      type, 
                      count: count as number 
                    }));
                  }
                }
                
                return attachmentTypes.map(type => {
                  const typeData = attachmentData.find(a => a.type === type);
                  const count = typeData ? typeData.count : 0;
                  
                  return (
                    <div key={type} className="text-center">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium badge ${getAttachmentBadge(type)}`}>
                        {type}
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                        {count}
                      </p>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Detailed Statistics by Newsroom */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{user?.role === 'PRODUCER' ? 'Detaljna statistika po redakcijama' : 'Detaljna statistika po uposlenicima'}</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      {user?.role === 'PRODUCER' ? 'Redakcija' : 'Uposlenik'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ukupno
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Snimljeno
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Otkazano
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stopa uspjeha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      TEMA
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      UŽIVO
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      REŽIJA
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VIBER/SKYPE
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PACKAGE
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SLUŽBENI PUT
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      EMISIJA
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      HITNO
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      RAZMJENA
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {statistics.tasksByNewsroomDetailed?.map((newsroom: any) => (
                    <tr key={newsroom.name} className="dark:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {newsroom.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {newsroom.total}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {newsroom.completed !== undefined ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {newsroom.completed}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {newsroom.cancelled !== undefined ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {newsroom.cancelled}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {newsroom.successRate !== undefined ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            newsroom.successRate >= 80 ? 'bg-green-100 text-green-800' :
                            newsroom.successRate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {newsroom.successRate}%
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      {['TEMA', 'UŽIVO', 'REŽIJA', 'VIBER/SKYPE', 'PACKAGE', 'SLUŽBENI PUT', 'EMISIJA', 'HITNO', 'RAZMJENA'].map(flag => (
                        <td key={flag} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {newsroom.flags && newsroom.flags[flag as TaskFlag] > 0 ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getFlagColor(flag as TaskFlag)}`}>
                              {newsroom.flags[flag as TaskFlag]}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Statistika;
