import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { peopleApi } from '../services/api';
import { Person, Newsroom } from '../types';
import { formatDate, formatDateRange, formatWeekdayDate, formatDateForInput, normalizeDateForDB } from '../utils/dateFormat';
import {
  Calendar,
  Plus,
  Edit,
  Trash2,
  Clock,
  User,
  Building2,
  Save,
  X,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ScheduleEntry {
  id?: number;
  person_id: number;
  date: string;
  shift_start: string;
  shift_end: string;
  shift_type: string;
  notes: string;
  person_name?: string;
  role?: string;
  newsroom_name?: string;
}

const Schedule: React.FC = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Person[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleEntry | null>(null);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [formData, setFormData] = useState<ScheduleEntry>({
    person_id: 0,
    date: '',
    shift_start: '',
    shift_end: '',
    shift_type: '',
    notes: ''
  });

  const days = ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja'];
  const shiftTypes = [
    'JUTARNJI STUDIO 6.00',
    '8-16h',
    '7-15 + LINK',
    '12-20h LINK+Z',
    '11-19h STD13-21h+Z',
    'SLOBODNI',
    'GODIŠNJI'
  ];

  useEffect(() => {
    loadData();
  }, [currentWeek]);

  const loadData = async () => {
    try {
      setLoading(true);
      const startDate = getWeekStart(currentWeek);
      const endDate = getWeekEnd(currentWeek);
      
      const [employeesRes, schedulesRes] = await Promise.all([
        peopleApi.getAll(),
        peopleApi.getSchedules(normalizeDateForDB(startDate), normalizeDateForDB(endDate))
      ]);
      
      // console.log('Employees response:', employeesRes.data);
      // console.log('Schedules response:', schedulesRes.data);
      
      // Check if response has success property and data array
      let allEmployees = [];
      if (employeesRes.data.success) {
        allEmployees = employeesRes.data.data;
      } else {
        allEmployees = employeesRes.data;
      }
      
      // Filter employees based on user role
      const filteredEmployees = allEmployees.filter((employee: any) => {
        // CHIEF_CAMERA can only see employees from KAMERMANI newsroom
        if (user?.role === 'CHIEF_CAMERA') {
          return employee.newsroom_id === 8; // KAMERMANI newsroom ID
        }
        // Other roles can only see employees from their newsroom
        return employee.newsroom_id === user?.newsroom_id;
      });
      
      setEmployees(filteredEmployees);
      
      if (schedulesRes.data.success) {
        setSchedules(schedulesRes.data.data);
      } else {
        setSchedules(schedulesRes.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Greška prilikom učitavanja podataka');
    } finally {
      setLoading(false);
    }
  };

  const getWeekStart = (date: Date) => {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay() + 1);
    return formatDateForInput(start);
  };

  const getWeekEnd = (date: Date) => {
    const end = new Date(date);
    end.setDate(date.getDate() - date.getDay() + 7);
    return formatDateForInput(end);
  };

  const getWeekDates = () => {
    const start = getWeekStart(currentWeek);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      dates.push(formatDateForInput(date));
    }
    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // console.log('Submitting form data:', formData);
      // console.log('shift_type value:', formData.shift_type);
      // console.log('shift_type type:', typeof formData.shift_type);
      
      // Normalize date for database storage
      const normalizedFormData = {
        ...formData,
        date: normalizeDateForDB(formData.date)
      };
      
      
      if (editingSchedule?.id) {
        await peopleApi.updateSchedule(editingSchedule.id, normalizedFormData);
        toast.success('Raspored je uspešno ažuriran');
      } else {
        await peopleApi.createSchedule(normalizedFormData);
        toast.success('Raspored je uspešno kreiran');
      }
      setShowModal(false);
      setEditingSchedule(null);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja podataka');
    }
  };

  const handleEdit = (schedule: ScheduleEntry) => {
    setEditingSchedule(schedule);
    setFormData(schedule);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Da li ste sigurni da želite obrisati ovaj raspored?')) {
      try {
        await peopleApi.deleteSchedule(id);
        toast.success('Raspored je uspešno obrisan');
        loadData();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      person_id: 0,
      date: '',
      shift_start: '',
      shift_end: '',
      shift_type: '',
      notes: ''
    });
  };

  const getScheduleForDate = (date: string) => {
    return schedules.filter(s => s.date === date);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    const weekDates = getWeekDates();
    const csvContent = [
      ['Datum', 'Ime', 'Uloga', 'Smjena', 'Početak', 'Kraj', 'Napomene'],
      ...weekDates.flatMap(date => {
        const daySchedules = getScheduleForDate(date);
        return daySchedules.map(schedule => [
          formatDate(date),
          schedule.person_name || '',
          schedule.role || '',
          schedule.shift_type || '',
          schedule.shift_start || '',
          schedule.shift_end || '',
          schedule.notes || ''
        ]);
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raspored_${getWeekStart(currentWeek)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(newWeek);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const weekDates = getWeekDates();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raspored uposlenika</h1>
          <p className="text-gray-600">Upravljanje rasporedom rada uposlenika</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleExport}
            className="btn btn-secondary flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Izvezi CSV
          </button>
          <button
            onClick={handlePrint}
            className="btn btn-secondary flex items-center"
          >
            <Printer className="w-4 h-4 mr-2" />
            Štampaj
          </button>
          <button
            onClick={() => {
              setEditingSchedule(null);
              resetForm();
              setShowModal(true);
            }}
            className="btn btn-primary flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novi raspored
          </button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
        <button
          onClick={() => navigateWeek('prev')}
          className="btn btn-secondary flex items-center"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Prethodna sedmica
        </button>
        
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {formatDateRange(weekDates[0], weekDates[6])}
          </h2>
        </div>
        
        <button
          onClick={() => navigateWeek('next')}
          className="btn btn-secondary flex items-center"
        >
          Sljedeća sedmica
          <ChevronRight className="w-4 h-4 ml-2" />
        </button>
      </div>

      {/* Schedule Grid */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dan
                </th>
                {weekDates.map((date, index) => (
                  <th key={date} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div>
                      <div className="font-semibold">{days[index]}</div>
                      <div className="text-sm text-gray-400">
                        {formatDate(date)}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-600" />
                        </div>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {employee.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {employee.role}
                        </div>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const daySchedules = getScheduleForDate(date).filter(s => s.person_id === employee.id);
                    return (
                      <td key={date} className="px-6 py-4 text-center">
                        {daySchedules.map((schedule) => (
                          <div key={schedule.id} className="mb-2 p-2 bg-blue-50 rounded border">
                            <div className="text-xs font-medium text-blue-900">
                              {schedule.shift_type}
                            </div>
                            {schedule.shift_start && schedule.shift_end && (
                              <div className="text-xs text-blue-700">
                                {schedule.shift_start} - {schedule.shift_end}
                              </div>
                            )}
                            {schedule.notes && (
                              <div className="text-xs text-blue-600 mt-1">
                                {schedule.notes}
                              </div>
                            )}
                            <div className="flex justify-end mt-2 space-x-1">
                              <button
                                onClick={() => handleEdit(schedule)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                <Edit className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDelete(schedule.id!)}
                                className="text-red-600 hover:text-red-900"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {daySchedules.length === 0 && (
                          <button
                            onClick={() => {
                              setFormData({
                                person_id: employee.id,
                                date: date,
                                shift_start: '',
                                shift_end: '',
                                shift_type: '',
                                notes: ''
                              });
                              setEditingSchedule(null);
                              setShowModal(true);
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingSchedule ? 'Uredi raspored' : 'Dodaj novi raspored'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Uposlenik *
                  </label>
                  <select
                    required
                    value={formData.person_id}
                    onChange={(e) => setFormData({ ...formData, person_id: parseInt(e.target.value) })}
                    className="input"
                  >
                    <option value={0}>Odaberite uposlenika</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} ({employee.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Datum *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Tip smjene *
                  </label>
                  <select
                    required
                    value={formData.shift_type}
                    onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                    className="input"
                  >
                    <option value="">Odaberite tip smjene</option>
                    {shiftTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Početak
                    </label>
                    <input
                      type="time"
                      value={formData.shift_start}
                      onChange={(e) => setFormData({ ...formData, shift_start: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Kraj
                    </label>
                    <input
                      type="time"
                      value={formData.shift_end}
                      onChange={(e) => setFormData({ ...formData, shift_end: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Napomene
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Unesite napomene"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Otkaži
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {editingSchedule ? 'Ažuriraj' : 'Kreiraj'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;
