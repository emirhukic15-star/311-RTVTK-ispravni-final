import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { peopleApi, newsroomsApi } from '../services/api';
import { Person, Newsroom } from '../types';
import {
  Plus,
  Edit,
  Trash2,
  Printer,
  ChevronLeft,
  ChevronRight,
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';

// Tipovi za raspored uposlenika
interface EmployeeScheduleEntry {
  id?: number;
  person_id: number;
  date: string;
  shift_start: string;
  shift_end: string;
  shift_type: string;
  custom_shift_name?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  person?: Person;
  person_name?: string;
}

interface ScheduleNote {
  id?: number;
  date: string;
  note: string;
  created_at?: string;
}

interface ShiftType {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  newsroom_id: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const EmployeeSchedule: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [newsrooms, setNewsrooms] = useState<Newsroom[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<EmployeeScheduleEntry[]>([]);
  const [scheduleNotes, setScheduleNotes] = useState<ScheduleNote[]>([]);
  const [selectedNewsroomId, setSelectedNewsroomId] = useState<string>(''); // For PRODUCER filter
  // Uklonili smo loading state potpuno
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EmployeeScheduleEntry | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<ScheduleNote | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('weekly');

  const [formData, setFormData] = useState<{
    person_id: number | '';
    date: string;
    shift_start: string;
    shift_end: string;
    shift_type: string;
    custom_shift_name: string;
    notes: string;
  }>({
    person_id: '',
    date: '',
    shift_start: '',
    shift_end: '',
    shift_type: '',
    custom_shift_name: '', // For custom shift names when shift_type is 'CUSTOM'
    notes: ''
  });

  const [shiftFormData, setShiftFormData] = useState({
    name: '',
    newsroom_id: user?.newsroom_id ?? ''
  });

  const [noteFormData, setNoteFormData] = useState({
    date: '',
    note: ''
  });

  // Generiranje sedmičnog prikaza
  const getWeekDates = (date: Date): Date[] => {
    const week = [];
    const startDate = new Date(date);
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Ponedjeljak kao prvi dan
    startDate.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      week.push(currentDate);
    }
    return week;
  };

  const weekDates = getWeekDates(selectedDate);

  // const createDefaultShiftTypes = () => {
  //   // Ne kreiraj default tipove - svaka redakcija kreira svoje
  //   setShiftTypes([]);
  // };

  const loadData = async () => {
    try {
      // console.log('=== LOAD DATA STARTED ===');
      // console.log('User:', user);
      // console.log('User newsroom_id:', user?.newsroom_id);
      // console.log('Selected date:', selectedDate);
      // console.log('View mode:', viewMode);
      
      // Uklonili smo setLoading(true) - neće se prikazivati spinner
      const [peopleResponse, newsroomsResponse, shiftTypesResponse] = await Promise.all([
        peopleApi.getAll(),
        newsroomsApi.getAll(),
        peopleApi.getShiftTypes()
      ]);
      
      // console.log('People response:', peopleResponse);
      // console.log('Newsrooms response:', newsroomsResponse);
      // console.log('Shift types response:', shiftTypesResponse);

      // Declare filteredPeople at the top scope so it's accessible later
      let filteredPeople: Person[] = [];

      if (peopleResponse.data.success) {
        // Filter people based on user role
        filteredPeople = peopleResponse.data.data.filter((person: Person) => {
          // PRODUCER can see all people from all newsrooms
          if (user?.role === 'PRODUCER') {
            return true; // Show all people
          }
          // CHIEF_CAMERA and CAMERMAN_EDITOR can only see people from KAMERMANI newsroom
          if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') {
            return person.newsroom_id === 8; // KAMERMANI newsroom ID
          }
          // CAMERA can see all people from KAMERMANI newsroom (same as CHIEF_CAMERA)
          if (user?.role === 'CAMERA') {
            return person.newsroom_id === 8; // KAMERMANI newsroom ID
          }
          // DESK_EDITOR and other roles can only see people from their newsroom
          return person.newsroom_id === user?.newsroom_id;
        });
        // console.log('Setting people to state:', filteredPeople);
        setPeople(filteredPeople);
        // console.log('People set successfully, count:', filteredPeople.length);
      }
      
      if (newsroomsResponse.data.success) {
        // Filter newsrooms based on user role
        const filteredNewsrooms = newsroomsResponse.data.data.filter((newsroom: Newsroom) => {
          // PRODUCER can see all newsrooms
          if (user?.role === 'PRODUCER') {
            return true;
          }
          // DESK_EDITOR and other roles can only see their newsroom
          return newsroom.id === user?.newsroom_id;
        });
        // console.log('Setting newsrooms to state:', filteredNewsrooms);
        setNewsrooms(filteredNewsrooms);
        // console.log('Newsrooms set successfully, count:', filteredNewsrooms.length);
      }

      if (shiftTypesResponse.data.success) {
        // console.log('Setting shift types to state:', shiftTypesResponse.data.data);
        setShiftTypes(shiftTypesResponse.data.data);
        // console.log('Shift types set successfully, count:', shiftTypesResponse.data.data.length);
      }

      // Učitati raspored podatke
      try {
        const startDate = viewMode === 'weekly' ? formatDate(weekDates[0]) : formatDate(selectedDate);
        const endDate = viewMode === 'weekly' ? formatDate(weekDates[6]) : formatDate(selectedDate);
        
        // console.log('Loading schedule for:', startDate, 'to', endDate);
        // console.log('Current user:', user);
        // console.log('User role:', user?.role);
        // console.log('User newsroom_id:', user?.newsroom_id);
        // console.log('Making API call to getSchedules...');
        const scheduleResponse = await peopleApi.getSchedules(startDate, endDate);
        // console.log('Schedule response:', scheduleResponse.data);
        // console.log('Schedule response status:', scheduleResponse.status);
        // console.log('Schedule response headers:', scheduleResponse.headers);
        // console.log('Full API response:', scheduleResponse);
        
        if (scheduleResponse.data.success) {
        // console.log('Setting schedule entries to state...');
        let scheduleData = scheduleResponse.data.data;
        
        // Filter schedule entries for CAMERA role - show all schedules from KAMERMANI newsroom
        // CAMERA sees the same as CHIEF_CAMERA (all people from KAMERMANI newsroom)
        if (user?.role === 'CAMERA' && filteredPeople.length > 0) {
          const cameraPersonIds = filteredPeople.map((p: Person) => p.id);
          scheduleData = scheduleData.filter((entry: EmployeeScheduleEntry) => 
            cameraPersonIds.includes(entry.person_id)
          );
        }
        
        // console.log('Setting schedule entries:', scheduleData);
        setScheduleEntries(scheduleData);
        // console.log('Schedule entries loaded:', scheduleData.length);
        // console.log('Schedule entries data:', scheduleData);
        // console.log('First entry details:', scheduleData[0]);
        // console.log('Schedule entries state updated successfully');
          
      // Debug logging for all loaded data
      // console.log('=== ALL LOADED DATA ===');
      // console.log('People:', peopleResponse.data.data?.length || 0, peopleResponse.data.data);
      // console.log('Newsrooms:', newsroomsResponse.data.data?.length || 0, newsroomsResponse.data.data);
      // console.log('Shift Types:', shiftTypesResponse.data.data?.length || 0, shiftTypesResponse.data.data);
      // console.log('Schedule Entries:', scheduleData.length, scheduleData);
      // console.log('=== END LOADED DATA ===');
        } else {
          // console.log('Schedule response not successful:', scheduleResponse.data);
          // console.log('Error message:', scheduleResponse.data.message);
        }
      } catch (scheduleError) {
        // console.log('Schedule API not ready yet:', scheduleError);
        // Za sada ćemo pustiti da se stranica učita bez raspored podataka
      }

      // Učitati napomene
      try {
        const startDate = viewMode === 'weekly' ? formatDate(weekDates[0]) : formatDate(selectedDate);
        const endDate = viewMode === 'weekly' ? formatDate(weekDates[6]) : formatDate(selectedDate);
        
        const notesResponse = await peopleApi.getScheduleNotes({ 
          start: startDate, 
          end: endDate 
        });
        if (notesResponse.data.success) {
          setScheduleNotes(notesResponse.data.data);
        }
      } catch (notesError) {
        // console.log('Notes API not ready yet:', notesError);
        // Za sada ćemo pustiti da se stranica učita bez napomena
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Greška prilikom učitavanja podataka');
    } finally {
      // console.log('=== LOAD DATA COMPLETED ===');
      // console.log('People count:', people.length);
      // console.log('Schedule entries count:', scheduleEntries.length);
      // console.log('Schedule notes count:', scheduleNotes.length);
      // Uklonili smo setLoading(false) - nema više loading state-a
    }
  };

  // Automatsko učitavanje podataka kada se komponenta učita - uklonjeno da se izbjegnu višestruki pozivi

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Validacija: Osigurajmo da je person_id broj
      if (!formData.person_id || typeof formData.person_id !== 'number') {
        toast.error('Morate izabrati uposlenika');
        return;
      }

      // Convert shift type ID to shift type name
      const shiftType = shiftTypes.find(st => st.id.toString() === formData.shift_type);
      const shiftTypeName = shiftType?.name || formData.shift_type; // Fallback to original value if not found
      
      // Create the data to send to the backend with shift type name instead of ID
      const dataToSend = {
        ...formData,
        shift_type: shiftTypeName
      };
      
      // Submitting schedule data
      
      if (editingEntry) {
        // Updating schedule entry
        await peopleApi.updateSchedule(editingEntry.id!, dataToSend);
        toast.success('Raspored je uspešno ažuriran');
      } else {
        // Creating new schedule entry
        await peopleApi.createSchedule(dataToSend);
        toast.success('Raspored je uspešno kreiran');
      }
      
      setShowModal(false);
      setEditingEntry(null);
      resetForm();
      
      // Reloading data
      await loadData();
    } catch (error: any) {
      console.error('Schedule submit error:', error);
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja rasporeda');
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingNote && editingNote.id) {
        await peopleApi.updateScheduleNote(editingNote.id, noteFormData);
        toast.success('Napomena je uspešno ažurirana');
      } else {
        await peopleApi.createScheduleNote(noteFormData);
        toast.success('Napomena je uspešno sačuvana');
      }
      
      setShowNoteModal(false);
      setEditingNote(null);
      setNoteFormData({ date: '', note: '' });
      loadData();
    } catch (error: any) {
      console.error('Note submit error:', error);
      toast.error('Greška prilikom čuvanja napomene');
    }
  };

  const handleEdit = (entry: EmployeeScheduleEntry) => {
    setEditingEntry(entry);
    
    // Convert timestamp shift_type to proper shift type ID if needed
    let shiftTypeValue = entry.shift_type;
    if (entry.shift_type && entry.shift_type.match(/^\d{13}$/)) {
      // This is a timestamp, find the corresponding shift type
      const shiftType = shiftTypes.find(st => st.id.toString() === entry.shift_type);
      shiftTypeValue = shiftType?.id.toString() || '';
    }
    
    setFormData({
      person_id: entry.person_id,
      date: entry.date,
      shift_start: entry.shift_start,
      shift_end: entry.shift_end,
      shift_type: shiftTypeValue,
      custom_shift_name: entry.custom_shift_name || '',
      notes: entry.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovaj unos iz rasporeda?')) {
      try {
        await peopleApi.deleteSchedule(id);
        toast.success('Unos je uspešno obrisan');
        loadData();
      } catch (error: any) {
        console.error('Delete error:', error);
        toast.error('Greška prilikom brisanja unosa');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      person_id: '',
      date: '',
      shift_start: '',
      shift_end: '',
      shift_type: '',
      custom_shift_name: '',
      notes: ''
    });
  };

  const resetShiftForm = () => {
    setShiftFormData({
      name: '',
      newsroom_id: user?.newsroom_id ?? ''
    });
  };

  const addScheduleEntry = (date: string, shiftTypeId: string) => {
    // Adding schedule entry
    
    const shiftTime = getShiftTime(shiftTypeId);
    
    setFormData({
      person_id: '',
      date: date,
      shift_start: shiftTime.start,
      shift_end: shiftTime.end,
      shift_type: shiftTypeId, // Keep ID for now, will convert to name in handleSubmit
      custom_shift_name: '',
      notes: ''
    });
    setEditingEntry(null);
    setShowModal(true);
  };

  const getShiftTime = (shiftTypeId: string) => {
    const shiftType = shiftTypes.find(st => st.id.toString() === shiftTypeId);
    if (shiftType) {
      return { start: shiftType.start_time, end: shiftType.end_time };
    }
    return { start: '08:00', end: '16:00' };
  };

  const addNote = (date: string) => {
    setNoteFormData({
      date: date,
      note: ''
    });
    setEditingNote(null);
    setShowNoteModal(true);
  };

  const handleEditNote = (note: ScheduleNote) => {
    setEditingNote(note);
    setNoteFormData({ date: note.date, note: note.note });
    setShowNoteModal(true);
  };

  const handleDeleteNote = async (noteId: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovu napomenu?')) {
      try {
        await peopleApi.deleteScheduleNote(noteId);
        toast.success('Napomena je uspešno obrisana');
        loadData();
      } catch (error: any) {
        console.error('Delete note error:', error);
        toast.error('Greška prilikom brisanja napomene');
      }
    }
  };

  const getPersonName = (entry: EmployeeScheduleEntry): string => {
    return entry.person_name || 'Nepoznat';
  };

  const getScheduleForDateAndShift = (date: string, shiftTypeId: string): EmployeeScheduleEntry[] => {
    // Getting schedule for date and shift
    
    // Find the shift type name from the ID
    const shiftType = shiftTypes.find(st => st.id.toString() === shiftTypeId);
    const shiftTypeName = shiftType?.name || '';
    
    // Debug: Proveri sve entry-jeve i njihove datume
    // Processing schedule entries
    
    const filtered = scheduleEntries.filter(entry => {
      const dateMatch = entry.date === date;
      // Compare with shift type name, but also check if it's a custom shift name
      const shiftMatch = entry.shift_type === shiftTypeName || 
                        (entry.custom_shift_name && entry.custom_shift_name === shiftTypeName) ||
                        (entry.shift_type && entry.shift_type.includes(shiftTypeName));
      return dateMatch && shiftMatch;
    });
    return filtered;
  };

  const getNotesForDate = (date: string): ScheduleNote[] => {
    return scheduleNotes.filter(note => note.date === date);
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const formatDisplayDate = (date: Date): string => {
    const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
    return `${date.getDate()}.${months[date.getMonth()]}`;
  };

  const getDayName = (date: Date): string => {
    const days = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
    return days[date.getDay()];
  };

  const handlePrint = () => {
    // Kreiraj print-friendly sadržaj
    const printContent = document.createElement('div');
    printContent.innerHTML = `
      <div style="
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 20px;
        font-family: Arial, sans-serif;
        background: white;
        color: black;
      ">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <img src="/rtvtk-logo.jpg" alt="RTVTK Logo" style="height: 40px; width: auto; margin-right: 15px;" />
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">RASPORED UPOSLENIKA</h1>
          </div>
          <p style="margin: 5px 0 0 0; font-size: 16px; color: #666;">
            ${viewMode === 'weekly' 
              ? `Sedmica: ${formatDisplayDate(weekDates[0])} - ${formatDisplayDate(weekDates[6])}`
              : `Datum: ${formatDisplayDate(selectedDate)}`
            }
          </p>
        </div>

        <!-- Schedule Table -->
        <div style="margin-bottom: 30px;">
          <table style="
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #333;
            font-size: 12px;
          ">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Smjena</th>
                ${viewMode === 'weekly' 
                  ? weekDates.map(date => `
                    <th style="border: 1px solid #333; padding: 8px; text-align: center; font-weight: bold; min-width: 100px;">
                      ${getDayName(date)}<br/>
                      <span style="font-size: 10px; color: #666;">${formatDisplayDate(date)}</span>
                    </th>
                  `).join('')
                  : `
                    <th style="border: 1px solid #333; padding: 8px; text-align: center; font-weight: bold; min-width: 200px;">
                      ${getDayName(selectedDate)}<br/>
                      <span style="font-size: 10px; color: #666;">${formatDisplayDate(selectedDate)}</span>
                    </th>
                  `
                }
              </tr>
            </thead>
            <tbody>
              ${shiftTypes.map(shiftType => `
                <tr>
                  <td style="border: 1px solid #333; padding: 8px; font-weight: bold; background-color: #f9f9f9;">
                    ${shiftType.name || 'Bez naziva'} ${shiftType.start_time && shiftType.end_time ? `(${shiftType.start_time} - ${shiftType.end_time})` : ''}
                  </td>
                  ${viewMode === 'weekly' 
                    ? weekDates.map(date => {
                        const dateStr = formatDate(date);
                        const entries = getScheduleForDateAndShift(dateStr, shiftType.id.toString());
                        return `
                          <td style="border: 1px solid #333; padding: 8px; vertical-align: top; min-height: 60px;">
                            ${entries.map(entry => `
                              <div style="margin-bottom: 4px; padding: 2px; background-color: #e3f2fd; border-radius: 3px; font-size: 11px;">
                                <strong>${getPersonName(entry)}</strong>
                                ${entry.custom_shift_name ? `<br/><span style="color: #1976d2;">(${entry.custom_shift_name})</span>` : ''}
                                ${!entry.custom_shift_name && entry.shift_start !== entry.shift_end ? `<br/><span style="color: #666;">(${entry.shift_start}-${entry.shift_end})</span>` : ''}
                                ${entry.notes ? `<br/><span style="color: #666; font-style: italic;">${entry.notes}</span>` : ''}
                              </div>
                            `).join('')}
                          </td>
                        `;
                      }).join('')
                    : `
                      <td style="border: 1px solid #333; padding: 8px; vertical-align: top; min-height: 60px;">
                        ${getScheduleForDateAndShift(formatDate(selectedDate), shiftType.id.toString()).map(entry => `
                          <div style="margin-bottom: 4px; padding: 2px; background-color: #e3f2fd; border-radius: 3px; font-size: 11px;">
                            <strong>${getPersonName(entry)}</strong>
                            ${entry.custom_shift_name ? `<br/><span style="color: #1976d2;">(${entry.custom_shift_name})</span>` : ''}
                            ${!entry.custom_shift_name && entry.shift_start !== entry.shift_end ? `<br/><span style="color: #666;">(${entry.shift_start}-${entry.shift_end})</span>` : ''}
                            ${entry.notes ? `<br/><span style="color: #666; font-style: italic;">${entry.notes}</span>` : ''}
                          </div>
                        `).join('')}
                      </td>
                    `
                  }
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Notes Section - only show if there are notes -->
        ${(() => {
          const hasNotes = viewMode === 'weekly' 
            ? weekDates.some(date => getNotesForDate(formatDate(date)).length > 0)
            : getNotesForDate(formatDate(selectedDate)).length > 0;
          
          if (!hasNotes) return '';
          
          return `
            <div style="margin-top: 30px;">
              <h2 style="font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 5px;">NAPOMENE</h2>
              ${viewMode === 'weekly' 
                ? weekDates.map(date => {
                    const dateStr = formatDate(date);
                    const notes = getNotesForDate(dateStr);
                    if (notes.length === 0) return '';
                    return `
                      <div style="margin-bottom: 20px;">
                        <h3 style="font-size: 14px; margin-bottom: 8px; color: #333;">${getDayName(date)} ${formatDisplayDate(date)}</h3>
                        ${notes.map(note => `
                          <div style="
                            background-color: #fff3cd;
                            border: 1px solid #ffeaa7;
                            border-left: 4px solid #f39c12;
                            padding: 8px;
                            margin-bottom: 5px;
                            border-radius: 3px;
                            font-weight: bold;
                            color: #856404;
                          ">
                            ${note.note}
                          </div>
                        `).join('')}
                      </div>
                    `;
                  }).filter(html => html !== '').join('')
                : `
                  <div>
                    ${getNotesForDate(formatDate(selectedDate)).map(note => `
                      <div style="
                        background-color: #fff3cd;
                        border: 1px solid #ffeaa7;
                        border-left: 4px solid #f39c12;
                        padding: 8px;
                        margin-bottom: 5px;
                        border-radius: 3px;
                        font-weight: bold;
                        color: #856404;
                      ">
                        ${note.note}
                      </div>
                    `).join('')}
                  </div>
                `
              }
            </div>
          `;
        })()}
      </div>
    `;

    // Kreiraj novi prozor za print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Raspored uposlenika</title>
          <style>
            @media print {
              @page {
                size: A4 landscape;
                margin: 0.5in;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                background: white;
                color: black;
              }
              * {
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              background: white;
              color: black;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.focus();
      
      // Čekaj da se sadržaj učita pa printaj
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleExport = async () => {
    try {
      // Kreiraj print-friendly sadržaj
      const printContent = document.createElement('div');
      printContent.innerHTML = `
        <div style="
          width: 100%;
          max-width: 100%;
          margin: 0;
          padding: 20px;
          font-family: Arial, sans-serif;
          background: white;
          color: black;
        ">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px;">
            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
              <img src="/rtvtk-logo.jpg" alt="RTVTK Logo" style="height: 40px; width: auto; margin-right: 15px;" />
              <h1 style="margin: 0; font-size: 24px; font-weight: bold;">RASPORED UPOSLENIKA</h1>
            </div>
            <p style="margin: 5px 0 0 0; font-size: 16px; color: #666;">
              ${viewMode === 'weekly' 
                ? `Sedmica: ${formatDisplayDate(weekDates[0])} - ${formatDisplayDate(weekDates[6])}`
                : `Datum: ${formatDisplayDate(selectedDate)}`
              }
            </p>
          </div>

          <!-- Schedule Table -->
          <div style="margin-bottom: 30px;">
            <table style="
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #333;
              font-size: 12px;
            ">
              <thead>
                <tr style="background-color: #f5f5f5;">
                  <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Smjena</th>
                  ${viewMode === 'weekly' 
                    ? weekDates.map(date => `
                      <th style="border: 1px solid #333; padding: 8px; text-align: center; font-weight: bold; min-width: 100px;">
                        ${getDayName(date)}<br/>
                        <span style="font-size: 10px; color: #666;">${formatDisplayDate(date)}</span>
                      </th>
                    `).join('')
                    : `
                      <th style="border: 1px solid #333; padding: 8px; text-align: center; font-weight: bold; min-width: 200px;">
                        ${getDayName(selectedDate)}<br/>
                        <span style="font-size: 10px; color: #666;">${formatDisplayDate(selectedDate)}</span>
                      </th>
                    `
                  }
                </tr>
              </thead>
              <tbody>
                ${shiftTypes.map(shiftType => `
                  <tr>
                    <td style="border: 1px solid #333; padding: 8px; font-weight: bold; background-color: #f9f9f9;">
                      ${shiftType.name || 'Bez naziva'} ${shiftType.start_time && shiftType.end_time ? `(${shiftType.start_time} - ${shiftType.end_time})` : ''}
                    </td>
                    ${viewMode === 'weekly' 
                      ? weekDates.map(date => {
                          const dateStr = formatDate(date);
                          const entries = getScheduleForDateAndShift(dateStr, shiftType.id.toString());
                          return `
                            <td style="border: 1px solid #333; padding: 8px; vertical-align: top; min-height: 60px;">
                              ${entries.map(entry => `
                                <div style="margin-bottom: 4px; padding: 2px; background-color: #e3f2fd; border-radius: 3px; font-size: 11px;">
                                  <strong>${getPersonName(entry)}</strong>
                                  ${entry.custom_shift_name ? `<br/><span style="color: #1976d2;">(${entry.custom_shift_name})</span>` : ''}
                                  ${!entry.custom_shift_name && entry.shift_start !== entry.shift_end ? `<br/><span style="color: #666;">(${entry.shift_start}-${entry.shift_end})</span>` : ''}
                                  ${entry.notes ? `<br/><span style="color: #666; font-style: italic;">${entry.notes}</span>` : ''}
                                </div>
                              `).join('')}
                            </td>
                          `;
                        }).join('')
                      : `
                        <td style="border: 1px solid #333; padding: 8px; vertical-align: top; min-height: 60px;">
                          ${getScheduleForDateAndShift(formatDate(selectedDate), shiftType.id.toString()).map(entry => `
                            <div style="margin-bottom: 4px; padding: 2px; background-color: #e3f2fd; border-radius: 3px; font-size: 11px;">
                              <strong>${getPersonName(entry)}</strong>
                              ${entry.custom_shift_name ? `<br/><span style="color: #1976d2;">(${entry.custom_shift_name})</span>` : ''}
                              ${!entry.custom_shift_name && entry.shift_start !== entry.shift_end ? `<br/><span style="color: #666;">(${entry.shift_start}-${entry.shift_end})</span>` : ''}
                              ${entry.notes ? `<br/><span style="color: #666; font-style: italic;">${entry.notes}</span>` : ''}
                            </div>
                          `).join('')}
                        </td>
                      `
                    }
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Notes Section - only show if there are notes -->
          ${(() => {
            const hasNotes = viewMode === 'weekly' 
              ? weekDates.some(date => getNotesForDate(formatDate(date)).length > 0)
              : getNotesForDate(formatDate(selectedDate)).length > 0;
            
            if (!hasNotes) return '';
            
            return `
              <div style="margin-top: 30px;">
                <h2 style="font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 5px;">NAPOMENE</h2>
                ${viewMode === 'weekly' 
                  ? weekDates.map(date => {
                      const dateStr = formatDate(date);
                      const notes = getNotesForDate(dateStr);
                      if (notes.length === 0) return '';
                      return `
                        <div style="margin-bottom: 20px;">
                          <h3 style="font-size: 14px; margin-bottom: 8px; color: #333;">${getDayName(date)} ${formatDisplayDate(date)}</h3>
                          ${notes.map(note => `
                            <div style="
                              background-color: #fff3cd;
                              border: 1px solid #ffeaa7;
                              border-left: 4px solid #f39c12;
                              padding: 8px;
                              margin-bottom: 5px;
                              border-radius: 3px;
                              font-weight: bold;
                              color: #856404;
                            ">
                              ${note.note}
                            </div>
                          `).join('')}
                        </div>
                      `;
                    }).filter(html => html !== '').join('')
                  : `
                    <div>
                      ${getNotesForDate(formatDate(selectedDate)).map(note => `
                        <div style="
                          background-color: #fff3cd;
                          border: 1px solid #ffeaa7;
                          border-left: 4px solid #f39c12;
                          padding: 8px;
                          margin-bottom: 5px;
                          border-radius: 3px;
                          font-weight: bold;
                          color: #856404;
                        ">
                          ${note.note}
                        </div>
                      `).join('')}
                    </div>
                  `
                }
              </div>
            `;
          })()}
        </div>
      `;

      // Dodaj sadržaj u DOM
      printContent.style.position = 'absolute';
      printContent.style.left = '-9999px';
      printContent.style.top = '-9999px';
      document.body.appendChild(printContent);

      // Konvertuj u canvas
      const canvas = await html2canvas(printContent, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      // Kreiraj PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape', 'mm', 'a4');
      
      const imgWidth = 297; // A4 width in mm
      const pageHeight = 210; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Preuzmi PDF
      const fileName = `raspored-uposlenika-${viewMode === 'weekly' 
        ? `${formatDisplayDate(weekDates[0])}-${formatDisplayDate(weekDates[6])}` 
        : formatDisplayDate(selectedDate)
      }.pdf`;
      
      pdf.save(fileName);

      // Ukloni sadržaj iz DOM
      document.body.removeChild(printContent);

      toast.success('PDF je uspešno preuzet!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Greška prilikom kreiranja PDF-a');
    }
  };

  // Shift type management functions
  const handleShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Ensure newsroom_id is null if empty
      const submitData = {
        ...shiftFormData,
        newsroom_id: shiftFormData.newsroom_id || null
      };
      
      if (editingShift) {
        // Update existing shift type
        await peopleApi.updateShiftType(editingShift.id, submitData);
        toast.success('Tip smjene je uspešno ažuriran');
      } else {
        // Create new shift type
        await peopleApi.createShiftType(submitData);
        toast.success('Tip smjene je uspešno kreiran');
      }
      
      setShowShiftModal(false);
      setEditingShift(null);
      resetShiftForm();
      
      // Reload data to get updated shift types
      await loadData();
    } catch (error: any) {
      console.error('Shift submit error:', error);
      toast.error('Greška prilikom čuvanja tipa smjene');
    }
  };

  const handleEditShift = (shift: ShiftType) => {
    setEditingShift(shift);
    setShiftFormData({
      name: shift.name,
      newsroom_id: shift.newsroom_id
    });
    setShowShiftModal(true);
  };

  const handleDeleteShift = async (shiftId: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovaj tip smjene?')) {
      try {
        await peopleApi.deleteShiftType(shiftId);
        toast.success('Tip smjene je uspešno obrisan');
        
        // Reload data to get updated shift types
        await loadData();
      } catch (error: any) {
        console.error('Delete shift type error:', error);
        toast.error('Greška prilikom brisanja tipa smjene');
      }
    }
  };

  const addNewShiftType = () => {
    setEditingShift(null);
    resetShiftForm();
    setShowShiftModal(true);
  };

  // Automatsko učitavanje podataka kada se komponenta učita ili promijeni sedmica
  useEffect(() => {
    loadData();
  }, [selectedDate, viewMode, user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Mobile Optimized */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Raspored uposlenika</h1>
          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1">
            {user?.role === 'PRODUCER' 
              ? `${viewMode === 'weekly' ? 'Sedmični raspored' : 'Dnevni raspored'} - Svi rasporedi po redakcijama`
              : user?.role === 'CAMERA'
              ? `${viewMode === 'weekly' ? 'Sedmični raspored' : 'Dnevni raspored'} - Kamermani`
              : `${viewMode === 'weekly' ? 'Sedmični raspored' : 'Dnevni raspored'} - ${newsrooms.find(n => n.id === user?.newsroom_id)?.name || 'Nepoznata redakcija'}`
            }
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* View Mode Toggle - Mobile Optimized */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('daily')}
              className={`flex-1 sm:flex-none px-3 py-2 md:py-1 rounded-md text-sm font-medium transition-colors min-h-[44px] sm:min-h-0 ${
                viewMode === 'daily' 
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Dnevni
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex-1 sm:flex-none px-3 py-2 md:py-1 rounded-md text-sm font-medium transition-colors min-h-[44px] sm:min-h-0 ${
                viewMode === 'weekly' 
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Sedmični
            </button>
          </div>

          {/* Date Navigation - Mobile Optimized */}
          <div className="flex gap-2 w-full sm:w-auto">
            {viewMode === 'weekly' ? (
              <>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 7 * 24 * 60 * 60 * 1000))}
                  className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
                  title="Prethodna sedmica"
                >
                  <ChevronLeft className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Prethodna sedmica</span>
                </button>
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="btn btn-secondary flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Ova sedmica</span>
                  <span className="sm:hidden">Sedmica</span>
                </button>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 7 * 24 * 60 * 60 * 1000))}
                  className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
                  title="Sljedeća sedmica"
                >
                  <span className="hidden sm:inline">Sljedeća sedmica</span>
                  <ChevronRight className="w-4 h-4 sm:ml-1" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000))}
                  className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
                  title="Prethodni dan"
                >
                  <ChevronLeft className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Prethodni dan</span>
                </button>
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="btn btn-secondary flex-1 sm:flex-none"
                >
                  Danas
                </button>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))}
                  className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
                  title="Sljedeći dan"
                >
                  <span className="hidden sm:inline">Sljedeći dan</span>
                  <ChevronRight className="w-4 h-4 sm:ml-1" />
                </button>
              </>
            )}
          </div>

          {/* Actions - Mobile Optimized */}
          <div className="flex gap-2 w-full sm:w-auto">
            {hasPermission('schedule.manage') && (
              <button
                onClick={addNewShiftType}
                className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
                title="Dodaj tip smjene"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Dodaj tip smjene</span>
              </button>
            )}
            {hasPermission('schedule.print') && (
              <button
                onClick={handlePrint}
                className="btn btn-primary flex items-center justify-center flex-1 sm:flex-none"
                title="Print"
              >
                <Printer className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Print</span>
              </button>
            )}
            {hasPermission('schedule.export') && (
              <button
                onClick={handleExport}
                className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
                title="Izvezi"
              >
                <Download className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Izvezi</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Table */}
      {user?.role === 'PRODUCER' ? (
        // Group by newsrooms for PRODUCER
        <div className="space-y-6">
          {/* Newsroom Filter for PRODUCER */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Filtriranje po redakciji:
                </label>
                <select
                  value={selectedNewsroomId}
                  onChange={(e) => setSelectedNewsroomId(e.target.value)}
                  className="input w-full sm:w-64"
                >
                  <option value="">Sve redakcije</option>
                  {newsrooms.map(newsroom => (
                    <option key={newsroom.id} value={newsroom.id}>
                      {newsroom.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {selectedNewsroomId 
                  ? `Prikazuje se: ${newsrooms.find(n => n.id === parseInt(selectedNewsroomId))?.name || 'Nepoznata redakcija'}`
                  : `Prikazuje se: Sve redakcije (${newsrooms.length})`
                }
              </div>
            </div>
          </div>

          {newsrooms.filter(newsroom => 
            !selectedNewsroomId || newsroom.id === parseInt(selectedNewsroomId)
          ).map((newsroom) => {
            const newsroomPeople = people.filter(person => person.newsroom_id === newsroom.id);
            const newsroomShiftTypes = shiftTypes.filter(shiftType => shiftType.newsroom_id === newsroom.id);
            const newsroomScheduleEntries = scheduleEntries.filter(entry => {
              const person = people.find(p => p.id === entry.person_id);
              return person && person.newsroom_id === newsroom.id;
            });
            
       // Debug logging for all cases
       // console.log(`Newsroom: ${newsroom.name}`, {
       //   newsroomId: newsroom.id,
       //   peopleCount: newsroomPeople.length,
       //   shiftTypesCount: newsroomShiftTypes.length,
       //   scheduleEntriesCount: newsroomScheduleEntries.length,
       //   people: newsroomPeople.map(p => p.name),
       //   shiftTypes: newsroomShiftTypes.map(st => st.name),
       //   scheduleEntries: newsroomScheduleEntries.map(se => ({
       //     id: se.id,
       //     person_name: se.person_name,
       //     date: se.date,
       //     shift_type: se.shift_type,
       //     custom_shift_name: se.custom_shift_name
       //   }))
       // });
       
       // Check if we have any entries for this newsroom
       // if (newsroomScheduleEntries.length > 0) {
       //   console.log(`✅ Found ${newsroomScheduleEntries.length} schedule entries for ${newsroom.name}`);
       // } else {
       //   console.log(`❌ No schedule entries found for ${newsroom.name}`);
       // }
            
            if (newsroomPeople.length === 0) return null;
            
            return (
              <div key={newsroom.id} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-700 px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-600">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100">{newsroom.name}</h3>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {newsroomPeople.length} uposlenik{newsroomPeople.length !== 1 ? 'a' : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                          Smjena
                        </th>
                        {viewMode === 'weekly' ? (
                          weekDates.map((date) => (
                            <th key={date.toISOString()} className="px-2 md:px-4 py-2 md:py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-24 md:min-w-32">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900 dark:text-gray-100">{getDayName(date)}</span>
                                <span className="text-gray-400 dark:text-gray-500 text-xs">{formatDisplayDate(date)}</span>
                              </div>
                            </th>
                          ))
                        ) : (
                          <th className="px-2 md:px-4 py-2 md:py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-24 md:min-w-32">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-900 dark:text-gray-100">{getDayName(selectedDate)}</span>
                              <span className="text-gray-400 dark:text-gray-500 text-xs">{formatDisplayDate(selectedDate)}</span>
                            </div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {newsroomShiftTypes.map((shiftType) => (
                        <tr key={shiftType.id} className="dark:bg-gray-800">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700">
                            <div className="flex items-center justify-between">
                              <span>{shiftType.name}</span>
                              <div className="flex space-x-1">
                                {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => handleEditShift(shiftType)}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Uredi tip smjene"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                )}
                                {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => handleDeleteShift(shiftType.id)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Obriši tip smjene"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          {viewMode === 'weekly' ? (
                            weekDates.map((date) => {
                              const dateStr = formatDate(date);
                              const entries = newsroomScheduleEntries.filter(entry => {
                                const dateMatch = entry.date === dateStr;
                                // More flexible matching for shift types
                                const shiftMatch = entry.shift_type === shiftType.name || 
                                                  entry.shift_type === shiftType.id.toString() ||
                                                  (entry.custom_shift_name && entry.custom_shift_name === shiftType.name) ||
                                                  (entry.shift_type && shiftType.name && entry.shift_type.includes(shiftType.name)) ||
                                                  (shiftType.name && entry.shift_type && shiftType.name.includes(entry.shift_type));
                                
         // Debug logging for all entries
         // console.log(`Checking entry for ${dateStr}:`, {
         //   entry: {
         //     id: entry.id,
         //     person_name: entry.person_name,
         //     date: entry.date,
         //     shift_type: entry.shift_type,
         //     custom_shift_name: entry.custom_shift_name
         //   },
         //   shiftType: {
         //     id: shiftType.id,
         //     name: shiftType.name
         //   },
         //   dateMatch,
         //   shiftMatch,
         //   finalMatch: dateMatch && shiftMatch
         // });
         
         // Also log if we have any entries at all for this date
         // if (dateMatch) {
         //   console.log(`Found date match for ${dateStr}, checking shift match...`);
         // }
                                
                                return dateMatch && shiftMatch;
                              });
                              return (
                                <td key={dateStr} className="px-1 md:px-2 py-1 md:py-2 border border-gray-200 dark:border-gray-700 min-h-16 bg-white dark:bg-gray-800">
                                  <div className="space-y-1">
                                    {entries.map((entry, index) => (
                                      <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-blue-50 dark:bg-blue-900 rounded p-1.5 md:p-2 text-xs">
                                        <span className="font-medium text-gray-900 dark:text-gray-100 break-words">
                                          {getPersonName(entry)}
                                          {entry.custom_shift_name && (
                                            <span className="text-blue-600 dark:text-blue-300 ml-1">({entry.custom_shift_name})</span>
                                          )}
                                          {!entry.custom_shift_name && entry.shift_start !== entry.shift_end && (
                                            <span className="text-gray-500 dark:text-gray-400 ml-1">({entry.shift_start}-{entry.shift_end})</span>
                                          )}
                                        </span>
                                        <div className="flex space-x-1 flex-shrink-0">
                                          {hasPermission('schedule.manage') && (
                                            <button
                                              onClick={() => handleEdit(entry)}
                                              className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                              title="Uredi"
                                            >
                                              <Edit className="w-3 h-3 md:w-4 md:h-4" />
                                            </button>
                                          )}
                                          {hasPermission('schedule.manage') && (
                                            <button
                                              onClick={() => handleDelete(entry.id!)}
                                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                              title="Obriši"
                                            >
                                              <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                    {hasPermission('schedule.manage') && (
                                      <button
                                        onClick={() => addScheduleEntry(dateStr, shiftType.id.toString())}
                                        className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-1.5 md:py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500 mt-1 min-h-[36px] md:min-h-0 flex items-center justify-center"
                                        title="Dodaj još uposlenika"
                                      >
                                        <Plus className="w-3 h-3 md:w-4 md:h-4" />
                                      </button>
                                    )}
                                    {entries.length === 0 && hasPermission('schedule.manage') && (
                                      <button
                                        onClick={() => addScheduleEntry(dateStr, shiftType.id.toString())}
                                        className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-2 md:py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500 min-h-[44px] flex items-center justify-center"
                                        title="Dodaj uposlenika"
                                      >
                                        <Plus className="w-4 h-4 md:w-5 md:h-5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })
                          ) : (
                            <td className="px-1 md:px-2 py-1 md:py-2 border border-gray-200 dark:border-gray-700 min-h-16 bg-white dark:bg-gray-800">
                              <div className="space-y-1">
                                {newsroomScheduleEntries.filter(entry => {
                                  const dateMatch = entry.date === formatDate(selectedDate);
                                  // More flexible matching for shift types
                                  const shiftMatch = entry.shift_type === shiftType.name || 
                                                    entry.shift_type === shiftType.id.toString() ||
                                                    (entry.custom_shift_name && entry.custom_shift_name === shiftType.name) ||
                                                    (entry.shift_type && shiftType.name && entry.shift_type.includes(shiftType.name)) ||
                                                    (shiftType.name && entry.shift_type && shiftType.name.includes(entry.shift_type));
                                  return dateMatch && shiftMatch;
                                }).map((entry, index) => (
                                  <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-blue-50 dark:bg-blue-900 rounded p-1.5 md:p-2 text-xs">
                                    <span className="font-medium text-gray-900 dark:text-gray-100 break-words">
                                      {getPersonName(entry)}
                                      {entry.custom_shift_name && (
                                        <span className="text-blue-600 dark:text-blue-300 ml-1">({entry.custom_shift_name})</span>
                                      )}
                                      {!entry.custom_shift_name && entry.shift_start !== entry.shift_end && (
                                        <span className="text-gray-500 dark:text-gray-400 ml-1">({entry.shift_start}-{entry.shift_end})</span>
                                      )}
                                    </span>
                                    <div className="flex space-x-1 flex-shrink-0">
                                      {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => handleEdit(entry)}
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                    title="Uredi"
                                  >
                                    <Edit className="w-3 h-3 md:w-4 md:h-4" />
                                  </button>
                                )}
                                {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => handleDelete(entry.id!)}
                                    className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                    title="Obriši"
                                  >
                                    <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                                {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => addScheduleEntry(formatDate(selectedDate), shiftType.id.toString())}
                                    className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-1 border border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500 mt-1"
                                    title="Dodaj još uposlenika"
                                  >
                                    <Plus className="w-3 h-3 mx-auto" />
                                  </button>
                                )}
                                {newsroomScheduleEntries.filter(entry => {
                                  const dateMatch = entry.date === formatDate(selectedDate);
                                  // More flexible matching for shift types
                                  const shiftMatch = entry.shift_type === shiftType.name || 
                                                    entry.shift_type === shiftType.id.toString() ||
                                                    (entry.custom_shift_name && entry.custom_shift_name === shiftType.name) ||
                                                    (entry.shift_type && shiftType.name && entry.shift_type.includes(shiftType.name)) ||
                                                    (shiftType.name && entry.shift_type && shiftType.name.includes(entry.shift_type));
                                  return dateMatch && shiftMatch;
                                }).length === 0 && hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => addScheduleEntry(formatDate(selectedDate), shiftType.id.toString())}
                                    className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500"
                                    title="Dodaj uposlenika"
                                  >
                                    <Plus className="w-4 h-4 mx-auto" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Regular table for other roles
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Smjena
                  </th>
                  {viewMode === 'weekly' ? (
                    weekDates.map((date) => (
                      <th key={date.toISOString()} className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-32">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900 dark:text-gray-100">{getDayName(date)}</span>
                          <span className="text-gray-400 dark:text-gray-500">{formatDisplayDate(date)}</span>
                        </div>
                      </th>
                    ))
                  ) : (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-32">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900 dark:text-gray-100">{getDayName(selectedDate)}</span>
                        <span className="text-gray-400 dark:text-gray-500">{formatDisplayDate(selectedDate)}</span>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {shiftTypes.map((shiftType) => (
                  <tr key={shiftType.id} className="dark:bg-gray-800">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700">
                      <div className="flex items-center justify-between">
                        <span>{shiftType.name}</span>
                        <div className="flex space-x-1">
                          {hasPermission('schedule.manage') && (
                            <button
                              onClick={() => handleEditShift(shiftType)}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                              title="Uredi tip smjene"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {hasPermission('schedule.manage') && (
                            <button
                              onClick={() => handleDeleteShift(shiftType.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                              title="Obriši tip smjene"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    {viewMode === 'weekly' ? (
                      weekDates.map((date) => {
                        const dateStr = formatDate(date);
                        const entries = getScheduleForDateAndShift(dateStr, shiftType.id.toString());
                        return (
                          <td key={dateStr} className="px-2 py-2 border border-gray-200 dark:border-gray-700 min-h-16 bg-white dark:bg-gray-800">
                            <div className="space-y-1">
                              {entries.map((entry, index) => (
                                <div key={index} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900 rounded p-1 text-xs">
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {getPersonName(entry)}
                                    {entry.custom_shift_name && (
                                      <span className="text-blue-600 dark:text-blue-300 ml-1">({entry.custom_shift_name})</span>
                                    )}
                                    {!entry.custom_shift_name && entry.shift_start !== entry.shift_end && (
                                      <span className="text-gray-500 dark:text-gray-400 ml-1">({entry.shift_start}-{entry.shift_end})</span>
                                    )}
                                  </span>
                                  <div className="flex space-x-1">
                                    {hasPermission('schedule.manage') && (
                                      <button
                                        onClick={() => handleEdit(entry)}
                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                                        title="Uredi"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                    )}
                                    {hasPermission('schedule.manage') && (
                                      <button
                                        onClick={() => handleDelete(entry.id!)}
                                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                                        title="Obriši"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {/* Dodaj dugme za dodavanje nove stavke čak i kada postoje postojeće */}
                              {hasPermission('schedule.manage') && (
                                <button
                                  onClick={() => addScheduleEntry(dateStr, shiftType.id.toString())}
                                  className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-1 border border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500 mt-1"
                                  title="Dodaj još uposlenika"
                                >
                                  <Plus className="w-3 h-3 mx-auto" />
                                </button>
                              )}
                              {entries.length === 0 && hasPermission('schedule.manage') && (
                                <button
                                  onClick={() => addScheduleEntry(dateStr, shiftType.id.toString())}
                                  className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500"
                                  title="Dodaj uposlenika"
                                >
                                  <Plus className="w-4 h-4 mx-auto" />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })
                    ) : (
                      <td className="px-2 py-2 border border-gray-200 dark:border-gray-700 min-h-16 bg-white dark:bg-gray-800">
                        <div className="space-y-1">
                          {getScheduleForDateAndShift(formatDate(selectedDate), shiftType.id.toString()).map((entry, index) => (
                            <div key={index} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900 rounded p-1 text-xs">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {getPersonName(entry)}
                                {entry.custom_shift_name && (
                                  <span className="text-blue-600 dark:text-blue-300 ml-1">({entry.custom_shift_name})</span>
                                )}
                                {!entry.custom_shift_name && entry.shift_start !== entry.shift_end && (
                                  <span className="text-gray-500 dark:text-gray-400 ml-1">({entry.shift_start}-{entry.shift_end})</span>
                                )}
                              </span>
                              <div className="flex space-x-1">
                                {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => handleEdit(entry)}
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                                    title="Uredi"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                )}
                                {hasPermission('schedule.manage') && (
                                  <button
                                    onClick={() => handleDelete(entry.id!)}
                                    className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                                    title="Obriši"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                          {/* Dodaj dugme za dodavanje nove stavke čak i kada postoje postojeće */}
                          {hasPermission('schedule.manage') && (
                            <button
                              onClick={() => addScheduleEntry(formatDate(selectedDate), shiftType.id.toString())}
                              className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-1 border border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500 mt-1"
                              title="Dodaj još uposlenika"
                            >
                              <Plus className="w-3 h-3 mx-auto" />
                            </button>
                          )}
                          {getScheduleForDateAndShift(formatDate(selectedDate), shiftType.id.toString()).length === 0 && hasPermission('schedule.manage') && (
                            <button
                              onClick={() => addScheduleEntry(formatDate(selectedDate), shiftType.id.toString())}
                              className="w-full text-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500"
                              title="Dodaj uposlenika"
                            >
                              <Plus className="w-4 h-4 mx-auto" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Napomene</h2>
          <button
            onClick={async () => {
              await loadData();
              toast.success('Podaci su uspešno sačuvani!');
            }}
            className="btn bg-red-600 hover:bg-red-700 text-white flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Sačuvaj
          </button>
        </div>
        {viewMode === 'weekly' ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDates.map((date) => {
              const dateStr = formatDate(date);
              const notes = getNotesForDate(dateStr);
              return (
                <div key={dateStr} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {getDayName(date)} {formatDisplayDate(date)}
                    </h3>
                    {hasPermission('schedule.manage') && (
                      <button
                        onClick={() => addNote(dateStr)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Dodaj napomenu"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {notes.map((note, index) => (
                      <div key={index} className="text-xs font-bold text-yellow-800 bg-yellow-100 p-2 rounded border-l-4 border-yellow-400 flex items-center justify-between">
                        <span>{note.note}</span>
                        <div className="flex space-x-1">
                          {hasPermission('schedule.manage') && (
                            <button
                              onClick={() => handleEditNote(note)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Uredi napomenu"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          )}
                          {hasPermission('schedule.manage') && (
                            <button
                              onClick={() => handleDeleteNote(note.id!)}
                              className="text-red-600 hover:text-red-900"
                              title="Obriši napomenu"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border rounded-lg p-4">
            <div className="space-y-2">
              {getNotesForDate(formatDate(selectedDate)).map((note, index) => (
                <div key={index} className="text-sm font-bold text-yellow-800 bg-yellow-100 p-3 rounded border-l-4 border-yellow-400 flex items-center justify-between">
                  <span>{note.note}</span>
                  <div className="flex space-x-2">
                    {hasPermission('schedule.manage') && (
                      <button
                        onClick={() => handleEditNote(note)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Uredi napomenu"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('schedule.manage') && (
                      <button
                        onClick={() => handleDeleteNote(note.id!)}
                        className="text-red-600 hover:text-red-900"
                        title="Obriši napomenu"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal za dodavanje/uređivanje rasporeda */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-20 mx-auto p-4 md:p-5 border-0 md:border border-gray-200 dark:border-gray-700 w-full md:max-w-md shadow-lg rounded-none md:rounded-lg bg-white dark:bg-gray-800 min-h-screen md:min-h-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingEntry ? 'Uredi raspored' : 'Novi unos u raspored'}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Dodajte uposlenika na smjenu
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Uposlenik</label>
                <select
                  value={formData.person_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, person_id: parseInt(e.target.value) || '' }))}
                  className="input"
                >
                  <option value="">Izaberite uposlenika</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="label">Smjena</label>
                <select
                  value={formData.shift_type}
                  onChange={(e) => {
                    const shiftTypeId = e.target.value;
                    const shiftTime = getShiftTime(shiftTypeId);
                    setFormData(prev => ({ 
                      ...prev, 
                      shift_type: shiftTypeId, // Keep ID for now, will convert to name in handleSubmit
                      shift_start: shiftTime.start,
                      shift_end: shiftTime.end
                    }));
                  }}
                  className="input"
                >
                  <option value="">Izaberite tip smjene</option>
                  <option value="CUSTOM">Prazno polje (unesite naziv)</option>
                  {shiftTypes.map((shiftType) => (
                    <option key={shiftType.id} value={shiftType.id.toString()}>
                      {shiftType.name || 'Bez naziva'} {shiftType.start_time && shiftType.end_time ? `(${shiftType.start_time} - ${shiftType.end_time})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom shift name field - only show when CUSTOM is selected */}
              {formData.shift_type === 'CUSTOM' && (
                <div>
                  <label className="label">Naziv smjene</label>
                  <input
                    type="text"
                    value={formData.custom_shift_name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, custom_shift_name: e.target.value }))}
                    className="input"
                    placeholder="Unesite naziv smjene (npr. NOĆNA SMJENA, VIKEND, itd.)"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Početak smjene (opciono)</label>
                  <input
                    type="text"
                    value={formData.shift_start || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, shift_start: e.target.value }))}
                    className="input"
                    placeholder="npr. 08:00, 8h, 8:30, itd."
                  />
                </div>
                <div>
                  <label className="label">Kraj smjene (opciono)</label>
                  <input
                    type="text"
                    value={formData.shift_end || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, shift_end: e.target.value }))}
                    className="input"
                    placeholder="npr. 16:00, 16h, 4:30, itd."
                  />
                </div>
              </div>
              
              <div>
                <label className="label">Napomene (opciono)</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="input"
                  rows={3}
                  placeholder="Dodatne napomene..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingEntry ? 'Ažuriraj' : 'Dodaj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal za napomene */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-20 mx-auto p-4 md:p-5 border-0 md:border border-gray-200 dark:border-gray-700 w-full md:max-w-md shadow-lg rounded-none md:rounded-lg bg-white dark:bg-gray-800 min-h-screen md:min-h-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingNote ? 'Uredi napomenu' : 'Nova napomena'}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Dodajte napomenu za datum
                </p>
              </div>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleNoteSubmit} className="space-y-4">
              <div>
                <label className="label">Napomena</label>
                <textarea
                  value={noteFormData.note}
                  onChange={(e) => setNoteFormData(prev => ({ ...prev, note: e.target.value }))}
                  className="input"
                  rows={4}
                  placeholder="Unesite napomenu..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="btn btn-secondary"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingNote ? 'Ažuriraj' : 'Dodaj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal za upravljanje tipovima smjena */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-20 mx-auto p-4 md:p-5 border-0 md:border border-gray-200 dark:border-gray-700 w-full md:max-w-md shadow-lg rounded-none md:rounded-lg bg-white dark:bg-gray-800 min-h-screen md:min-h-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingShift ? 'Uredi tip smjene' : 'Novi tip smjene'}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Kreirajte ili uredite tip smjene za vašu redakciju
                </p>
              </div>
              <button
                onClick={() => setShowShiftModal(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleShiftSubmit} className="space-y-4">
                <div>
                  <label className="label">Naziv smjene (opciono)</label>
                  <input
                    type="text"
                    value={shiftFormData.name}
                    onChange={(e) => setShiftFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="input"
                    placeholder="npr. NOĆNA SMJENA, VIKEND, itd."
                    required
                  />
                </div>


              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="btn btn-secondary"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingShift ? 'Ažuriraj' : 'Dodaj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeSchedule;
