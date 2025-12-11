import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi, newsroomsApi, peopleApi, vehiclesApi, taskPresetsApi } from '../services/api';
import { Task, Newsroom, Person, Vehicle, TaskFormData, CoverageType, AttachmentType, TaskStatus, TaskFlag, TaskPreset } from '../types';
import { formatDate, getCurrentDateForInput, getCurrentDateTime, normalizeDateForDB } from '../utils/dateFormat';
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  Users,
  Camera,
  Edit,
  Trash2,
  Download,
  X,
  Printer,
  CheckCheck,
  GripVertical
} from 'lucide-react';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Task Item Component
interface SortableTaskItemProps {
  task: Task;
  highlightedTaskId: number | null;
  getStatusBadge: (status: string) => string;
  getCoverageBadge: (type: string) => string;
  getAttachmentBadge: (type: string) => string;
  getPersonName: (id: number) => string;
  getNewsroomName: (id: number) => string;
  getVehicleName: (id: number) => string;
  handleEdit: (task: Task) => void;
  handleDelete: (id: number) => void;
  handleMarkAsDone: (taskId: number) => void;
  user: any;
  hasPermission: (permission: string) => boolean;
  parseAttachmentFromDescription: (description: string) => any;
  downloadAttachment: (fileName: string, base64Data: string) => void;
}

const SortableTaskItem: React.FC<SortableTaskItemProps> = ({
  task,
  highlightedTaskId,
  getStatusBadge,
  getCoverageBadge,
  getAttachmentBadge,
  getPersonName,
  getNewsroomName,
  getVehicleName,
  handleEdit,
  handleDelete,
  handleMarkAsDone,
  user,
  hasPermission,
  parseAttachmentFromDescription,
  downloadAttachment
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`task-${task.id}`}
      className={`border border-gray-200 dark:border-gray-700 rounded-lg p-3 md:p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-500 ${
        highlightedTaskId === task.id 
          ? 'ring-4 ring-blue-500 bg-blue-50 dark:bg-blue-900 shadow-xl animate-pulse border-blue-300 dark:border-blue-600' 
          : ''
      } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 md:gap-2 flex-1 min-w-0">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="mt-0.5 md:mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 flex-shrink-0 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
          >
            <GripVertical className="h-4 w-4 md:h-5 md:w-5" />
          </div>
          
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
                {(() => {
                  const attachment = parseAttachmentFromDescription(task.description);
                  if (attachment) {
                    return (
                      <div>
                        <p className="break-words">{task.description.replace(/ATTACHMENT_DATA: .+/, '').trim()}</p>
                        <button
                          onClick={() => downloadAttachment(attachment.fileName, attachment.base64Data)}
                          className="mt-2 text-xs md:text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 md:px-3 py-1.5 md:py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors min-h-[36px] md:min-h-0"
                        >
                          📥 Preuzmi {attachment.fileName}
                        </button>
                      </div>
                    );
                  }
                  return <p className="break-words">{task.description}</p>;
                })()}
              </div>
            )}

            <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-4 mt-2 md:mt-3 text-[10px] md:text-xs text-gray-500 dark:text-gray-400">
              <span className="break-words">Redakcija: {getNewsroomName(task.newsroom_id)}</span>
              <span className="break-words">
                Vozilo: {task.vehicle_id 
                  ? (getVehicleName(task.vehicle_id) || `ID: ${task.vehicle_id}`)
                  : 'Nije dodjeljeno'
                }
              </span>
            </div>
            
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
        
        <div className="flex flex-wrap items-center gap-2 md:ml-4 md:flex-nowrap flex-shrink-0">
        {hasPermission('task.edit') && user?.role !== 'CHIEF_CAMERA' && user?.role !== 'CAMERMAN_EDITOR' && (
            !((user?.role === 'DESK_EDITOR') && task.created_by !== user?.id) ? (
              <button
                onClick={() => handleEdit(task)}
                className="p-2 md:p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                title="Uredi zadatak"
              >
                <Edit className="w-4 h-4 md:w-4 md:h-4" />
              </button>
            ) : (
              <span className="text-[10px] md:text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap" title={`Kreirao: ${task.created_by}, Korisnik: ${user?.id}`}>
                Nije tvoj
              </span>
            )
        )}
        {((hasPermission('task.assign_camera') && !hasPermission('task.edit') && user?.role !== 'CAMERA') || 
            (hasPermission('task.assign_camera') && user?.role === 'CHIEF_CAMERA') ||
            (hasPermission('task.assign_camera') && user?.role === 'CAMERMAN_EDITOR' && 
              ((!task.cameraman_assigned_by && (!task.cameraman_ids || task.cameraman_ids.length === 0)) ||
              (task.cameraman_assigned_by === user?.id)))) && (
            <button
              onClick={() => handleEdit(task)}
              className="p-2 md:p-2 text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-lg transition-colors min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              title="Dodjeli kamermana"
            >
              <Camera className="w-4 h-4 md:w-4 md:h-4" />
            </button>
        )}
        {hasPermission('task.confirm_recorded') && (
            <button
              onClick={() => handleEdit(task)}
              className="p-2 md:p-2 text-green-400 dark:text-green-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900 rounded-lg transition-colors min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              title="Potvrdi snimanje"
            >
              <CheckCheck className="w-4 h-4 md:w-4 md:h-4" />
            </button>
        )}
        {hasPermission('task.delete') && (
            !((user?.role === 'DESK_EDITOR' || user?.role === 'CAMERMAN_EDITOR') && task.created_by !== user?.id) ? (
              <button
                onClick={() => handleDelete(task.id)}
                className="p-2 md:p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 rounded-lg transition-colors min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                title="Obriši zadatak"
              >
                <Trash2 className="w-4 h-4 md:w-4 md:h-4" />
              </button>
            ) : (
              <span className="text-[10px] md:text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap" title={`Kreirao: ${task.created_by}, Korisnik: ${user?.id}`}>
                Nije tvoj
              </span>
            )
        )}
        {user?.role === 'PRODUCER' && 
           task.cameraman_ids && 
           task.cameraman_ids.length > 0 && 
           task.flags && 
           task.flags.includes('SLUŽBENI PUT') && 
           !task.flags.includes('POTVRĐENO') && (
            <button
              onClick={() => handleMarkAsDone(task.id)}
              className="px-2 md:px-3 py-1.5 md:py-1 bg-green-500 dark:bg-green-600 text-white text-xs md:text-sm rounded hover:bg-green-600 dark:hover:bg-green-700 transition-colors flex items-center gap-1 md:space-x-1 min-h-[36px] md:min-h-0"
              title="Označi kao urađeno"
            >
              <CheckCheck className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="whitespace-nowrap">Urađeno</span>
            </button>
        )}
        </div>
      </div>
    </div>
  );
};

const Dispozicija: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newsrooms, setNewsrooms] = useState<Newsroom[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [allPeople, setAllPeople] = useState<Person[]>([]); // Store all people for name resolution
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [taskPresets, setTaskPresets] = useState<TaskPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [showTravelAlert, setShowTravelAlert] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [travelData, setTravelData] = useState({
    destination: '',
    departureDate: '',
    returnDate: '',
    reason: '',
    activities: '',
    attachment: null as File | null
  });
  const [filters, setFilters] = useState({
    date: getCurrentDateForInput(), // YYYY-MM-DD format
    newsroom_id: '',
    status: '',
    coverage_type: ''
  });

  const [formData, setFormData] = useState<TaskFormData>({
    date: getCurrentDateForInput(), // YYYY-MM-DD format
    time_start: '',
    time_end: '',
    title: '',
    slugline: '',
    location: '',
    description: '',
    newsroom_id: user?.newsroom_id || 0,
    coverage_type: 'ENG',
    attachment_type: undefined,
    status: 'PLANIRANO',
    flags: [],
    journalist_ids: [],
    cameraman_ids: [],
    vehicle_id: undefined,
    cameraman_id: undefined
  });

  // Additional state for PRODUCER role to select newsroom
  const [selectedNewsroomId, setSelectedNewsroomId] = useState<number | null>(null);

  // Helper function to get person name by ID - memoized for performance
  const getPersonName = useCallback((id: number) => {
    // First try to find in allPeople (for name resolution)
    const person = allPeople.find(p => p.id === id);
    // Looking for person by ID
    return person ? person.name : `ID: ${id}`;
  }, [allPeople]);

  // Get cameramen scheduled for the form date
  const getScheduledCameramen = useCallback(() => {
    if (user?.role !== 'CHIEF_CAMERA' && user?.role !== 'CAMERMAN_EDITOR') {
      // For other roles (like PRODUCER), filter to show only cameramen from KAMERMANI newsroom
      return people.filter((person: any) => 
        person.newsroom_id === 8
      );
    }

    // For CHIEF_CAMERA and CAMERMAN_EDITOR, filter by scheduled date
    const formDate = formData.date || getCurrentDateForInput();
    const normalizedFormDate = normalizeDateForDB(formDate);
    const scheduledForDate = schedules.filter((schedule: any) => 
      schedule.date === normalizedFormDate && schedule.newsroom_name === 'KAMERMANI'
    );

    const cameramen = scheduledForDate
      .map((schedule: any) => ({
        id: schedule.person_id,
        name: schedule.person_name,
        newsroom_id: 8,
        role: schedule.role || 'CAMERA'
      }))
      // Remove duplicates
      .filter((person: any, index: number, array: any[]) => 
        array.findIndex(p => p.id === person.id) === index
      );


    return cameramen;
  }, [user?.role, formData.date, schedules, people]);

  // Helper function to get newsroom name by ID - memoized for performance
  const getNewsroomName = useCallback((id: number) => {
    const newsroom = newsrooms.find(n => n.id === id);
    return newsroom ? newsroom.name : 'Nepoznata redakcija';
  }, [newsrooms]);

  const handleExport = async () => {
    try {
      // Get tasks with user's newsroom filter
      const exportFilters = {
        ...filters,
        newsroom_id: (user?.role === 'CHIEF_CAMERA') ? '' : (user?.newsroom_id || '')
      };
      
      const response = await tasksApi.getAll(exportFilters);
      let exportTasks = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      
      // Parse JSON strings for arrays
      exportTasks = exportTasks.map((task: any) => ({
        ...task,
        journalist_ids: typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids || '[]') : (task.journalist_ids || []),
        cameraman_ids: typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids || '[]') : (task.cameraman_ids || []),
        flags: typeof task.flags === 'string' ? JSON.parse(task.flags || '[]') : (task.flags || [])
      }));
      
      // Create print-friendly content
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
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
              <img src="/rtvtk-logo.jpg" alt="RTVTK Logo" style="height: 35px; width: auto; margin-right: 12px;" />
              <h1 style="margin: 0; font-size: 20px; font-weight: bold;">RTVTK - DISPOZICIJA</h1>
            </div>
            <p style="margin: 3px 0 0 0; font-size: 14px; color: #666;">
              Redakcija: ${(user?.role === 'CHIEF_CAMERA') ? 'Sve redakcije' : (user?.newsroom_id ? getNewsroomName(user.newsroom_id) : 'Sve redakcije')} | 
              Datum: ${filters.date ? formatDate(filters.date) : formatDate(new Date())} | 
              Generisano: ${getCurrentDateTime()}
            </p>
          </div>

          <!-- Tasks Table -->
          <div style="margin-bottom: 30px;">
            ${exportTasks.length === 0 ? 
              '<div style="text-align: center; padding: 40px; color: #666; font-size: 16px;">Nema zadataka za prikaz.</div>' :
              `<table style="
                width: 100%;
                border-collapse: collapse;
                border: 1px solid #333;
                font-size: 12px;
              ">
                <thead>
                  <tr style="background-color: #f5f5f5;">
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Datum</th>
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Vrijeme</th>
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Naslov</th>
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Lokacija</th>
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Status</th>
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Novinar</th>
                    <th style="border: 1px solid #333; padding: 8px; text-align: left; font-weight: bold;">Kameraman</th>
                  </tr>
                </thead>
                <tbody>
                  ${exportTasks.map((task: any) => `
                    <tr>
                      <td style="border: 1px solid #333; padding: 8px;">${formatDate(task.date)}</td>
                      <td style="border: 1px solid #333; padding: 8px;">${task.time_start && task.time_end ? `${task.time_start} - ${task.time_end}` : 'TEMA'}</td>
                      <td style="border: 1px solid #333; padding: 8px;">${task.title || ''}</td>
                      <td style="border: 1px solid #333; padding: 8px;">${task.location || ''}</td>
                      <td style="border: 1px solid #333; padding: 8px;">${task.status || ''}</td>
                      <td style="border: 1px solid #333; padding: 8px;">${task.journalist_ids && task.journalist_ids.length > 0 
                        ? task.journalist_ids.map((id: number) => getPersonName(id)).join(', ')
                        : 'Nije dodjeljen'}</td>
                      <td style="border: 1px solid #333; padding: 8px;">${(task.cameraman_ids && task.cameraman_ids.length > 0 
                        ? task.cameraman_ids.map((id: number) => getPersonName(id)).join('<br>')
                        : task.cameraman_id 
                          ? getPersonName(task.cameraman_id)
                          : 'Nije dodjeljen')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
            }
          </div>
        </div>
      `;

      // Add content to DOM
      printContent.style.position = 'absolute';
      printContent.style.left = '-9999px';
      printContent.style.top = '-9999px';
      document.body.appendChild(printContent);

      // Convert to canvas
      const canvas = await html2canvas(printContent, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      // Create PDF
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

      // Download PDF
      const fileName = `dispozicija_${filters.date || getCurrentDateForInput()}.pdf`;
      pdf.save(fileName);

      // Remove content from DOM
      document.body.removeChild(printContent);

      toast.success('PDF je uspešno preuzet!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Greška prilikom kreiranja PDF-a');
    }
  };

  // State for highlighted task from notification
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);

  // Read URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const dateParam = urlParams.get('date');
    const taskIdParam = urlParams.get('task_id');
    
    if (dateParam) {
      setFilters(prev => ({ ...prev, date: dateParam }));
      setFormData(prev => ({ ...prev, date: dateParam }));
    }
    
    if (taskIdParam) {
      const taskId = parseInt(taskIdParam);
      setHighlightedTaskId(taskId);
      
      // If no date param provided, fetch the task details to get its date
      if (!dateParam) {
        // Fetch task details from API to get the correct date
        fetch(`/api/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        .then(response => response.text())
        .then(text => {
          try {
            const data = JSON.parse(text);
            if (data.success && data.data) {
              const task = data.data;
              setFilters(prev => ({ ...prev, date: task.date }));
              setFormData(prev => ({ ...prev, date: task.date }));
            }
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
          }
        })
        .catch(error => {
          console.error('Error fetching task details:', error);
        });
      }
      
      // Scroll to task after a delay (longer if we need to fetch task date)
      const scrollDelay = dateParam ? 500 : 2000; // Longer delay if we need to fetch date and reload tasks
      setTimeout(() => {
        const taskElement = document.getElementById(`task-${taskId}`);
        if (taskElement) {
          taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Retry after 3 seconds if not found
          setTimeout(() => {
            const retryElement = document.getElementById(`task-${taskId}`);
            if (retryElement) {
              retryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 3000);
        }
      }, scrollDelay);
      


      // Remove highlight after 5 seconds
      setTimeout(() => {
        setHighlightedTaskId(null);
      }, 5000);
    }
  }, [location.search]);


  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Automatsko ažuriranje datuma svakih 5 minuta
  useEffect(() => {
    const updateDate = () => {
      const currentDate = getCurrentDateForInput();
      if (currentDate !== filters.date) {
        setFilters(prev => ({ ...prev, date: currentDate }));
        setFormData(prev => ({ ...prev, date: currentDate }));
      }
    };

    // Ažuriraj datum svakih 5 minuta
    const interval = setInterval(updateDate, 5 * 60 * 1000);
    
    // Očisti interval kada se komponenta unmount-uje
    return () => clearInterval(interval);
  }, [filters.date]);


  // Load people on component mount
  useEffect(() => {
    const loadPeople = async () => {
      try {
        // console.log('Loading people on mount...');
        const peopleResponse = await peopleApi.getAll();
        if (peopleResponse.data.success) {
          // console.log('People loaded on mount:', peopleResponse.data.data);
          
          // Store all people for name resolution
          setAllPeople(peopleResponse.data.data);
          
          // Filter people based on user role for assignment purposes
          if (user?.role !== 'CHIEF_CAMERA' && user?.role !== 'CAMERMAN_EDITOR' && user?.role !== 'PRODUCER') {
            // For non-CHIEF_CAMERA, non-CAMERMAN_EDITOR, and non-PRODUCER roles, filter people from their newsroom
            const filteredPeople = peopleResponse.data.data.filter((person: any) => {
              return person.newsroom_id === user?.newsroom_id;
            });
            setPeople(filteredPeople);
          } else if (user?.role === 'PRODUCER') {
            // PRODUCER can see all people from all newsrooms
            setPeople(peopleResponse.data.data);
          }
          // For CHIEF_CAMERA and CAMERMAN_EDITOR roles, people will be loaded from schedules based on selected date
        } else {
          // console.log('People response failed on mount:', peopleResponse.data);
        }
      } catch (error) {
        console.error('Error loading people on mount:', error);
      }
    };
    loadPeople();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load schedules when form date changes
  useEffect(() => {
    const loadSchedulesForDate = async () => {
      try {
        const normalizedDate = normalizeDateForDB(formData.date);
        const schedulesResponse = await peopleApi.getSchedules(normalizedDate, normalizedDate);
        
        if (schedulesResponse.data.success) {
          setSchedules(schedulesResponse.data.data);
          
          // For CHIEF_CAMERA and CAMERMAN_EDITOR roles, update people list with scheduled cameramen
          // Only update if not currently editing a task (to prevent overriding task-specific cameramen)
          if ((user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && !isEditingTask) {
            const scheduledCameramen = schedulesResponse.data.data
              .filter((schedule: any) => schedule.newsroom_name === 'KAMERMANI')
              .map((schedule: any) => ({
                id: schedule.person_id,
                name: schedule.person_name,
                newsroom_id: 8, // KAMERMANI newsroom ID
                role: schedule.role || 'CAMERA'
              }))
              // Remove duplicates by person_id
              .filter((person: any, index: number, array: any[]) => 
                array.findIndex(p => p.id === person.id) === index
              );
            
            setPeople(scheduledCameramen);
          }
        }
      } catch (error) {
        console.error('Error loading schedules for date:', error);
      }
    };

    // Only load schedules if not currently editing a task
    // When editing, schedules are loaded in handleEdit
    if (formData.date && !isEditingTask) {
      loadSchedulesForDate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date, user?.role, isEditingTask]);

  const loadData = async () => {
    try {
      // console.log('Loading data with filters:', filters);
      setLoading(true);
      
      // Use only filter date for schedules - this ensures we only load cameramen for the selected date
      const filterDate = filters.date || getCurrentDateForInput();
      
      // console.log('Loading data with filter date:', filterDate);
      // console.log('Filters object:', filters);
      
      const [tasksResponse, newsroomsResponse, peopleResponse, vehiclesResponse, schedulesResponse, presetsResponse] = await Promise.all([
        tasksApi.getAll(filters),
        newsroomsApi.getAll(),
        peopleApi.getAll(), // This should return all people for name resolution
        vehiclesApi.getAll(),
        peopleApi.getSchedules(normalizeDateForDB(filterDate), normalizeDateForDB(filterDate)),
        taskPresetsApi.getAll()
      ]);

      if (tasksResponse.data.success) {
        // Tasks loaded successfully
        // Parse JSON strings for arrays
        const parsedTasks = tasksResponse.data.data.map((task: any) => {
          const parsedTask = {
            ...task,
            journalist_ids: typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids || '[]') : (task.journalist_ids || []),
            cameraman_ids: typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids || '[]') : (task.cameraman_ids || []),
            flags: typeof task.flags === 'string' ? JSON.parse(task.flags || '[]') : (task.flags || []),
            vehicle_id: task.vehicle_id ? (typeof task.vehicle_id === 'string' ? parseInt(task.vehicle_id) : task.vehicle_id) : undefined,
            attachment_type: (task.attachment_type && task.attachment_type !== null && task.attachment_type !== '' && task.attachment_type !== 'null' && String(task.attachment_type).toUpperCase() !== 'NULL') ? String(task.attachment_type).trim() : undefined
          };
          // Debug logging - ALWAYS show
          console.log(`Task ${task.id}: vehicle_id from DB=${task.vehicle_id} (${typeof task.vehicle_id}), parsed=${parsedTask.vehicle_id}`);
          console.log(`Task ${task.id}: attachment_type from DB="${task.attachment_type}" (${typeof task.attachment_type}), parsed="${parsedTask.attachment_type}"`);
          console.log(`Task ${task.id}: coverage_type="${task.coverage_type}", attachment_type="${parsedTask.attachment_type}"`);
          return parsedTask;
        });
        setTasks(parsedTasks);
      }
      if (newsroomsResponse.data.success) {
        setNewsrooms(newsroomsResponse.data.data);
      }
      if (peopleResponse.data.success) {
        // People loaded successfully
        
        // Store all people for name resolution
        // Setting allPeople for name resolution
        setAllPeople(peopleResponse.data.data);
        
        // Filter people based on user role for assignment purposes
        if (user?.role !== 'CHIEF_CAMERA' && user?.role !== 'CAMERMAN_EDITOR' && user?.role !== 'PRODUCER') {
          // For non-CHIEF_CAMERA, non-CAMERMAN_EDITOR, and non-PRODUCER roles, filter people from their newsroom
          const filteredPeople = peopleResponse.data.data.filter((person: any) => {
            return person.newsroom_id === user?.newsroom_id;
          });
          setPeople(filteredPeople);
        } else if (user?.role === 'PRODUCER') {
          // PRODUCER can see all people from all newsrooms
          setPeople(peopleResponse.data.data);
        }
        // For CHIEF_CAMERA and CAMERMAN_EDITOR roles, people will be loaded from schedules based on selected date
      } else {
        // console.log('People response failed:', peopleResponse.data);
      }
      if (vehiclesResponse.data.success) {
        // Debug logging (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log('Vehicles loaded:', vehiclesResponse.data.data);
        }
        setVehicles(vehiclesResponse.data.data);
      } else {
        // Debug logging (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log('Vehicles failed to load:', vehiclesResponse.data);
        }
      }
      if (schedulesResponse.data.success) {
        setSchedules(schedulesResponse.data.data);
        
        // For CHIEF_CAMERA and CAMERMAN_EDITOR roles, update people list with scheduled cameramen
        // Only update if not currently editing a task (to prevent overriding task-specific cameramen)
        if ((user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && !isEditingTask) {
          const scheduledCameramen = schedulesResponse.data.data
            .filter((schedule: any) => schedule.newsroom_name === 'KAMERMANI')
            .map((schedule: any) => ({
              id: schedule.person_id,
              name: schedule.person_name,
              newsroom_id: 8, // KAMERMANI newsroom ID
              role: schedule.role || 'CAMERA'
            }))
            // Remove duplicates by person_id
            .filter((person: any, index: number, array: any[]) => 
              array.findIndex(p => p.id === person.id) === index
            );
          
          // console.log('Scheduled cameramen in loadData:', scheduledCameramen);
          // console.log('Setting people state in loadData to:', scheduledCameramen);
          setPeople(scheduledCameramen);
        }
      } else {
        // console.log('Schedules response failed:', schedulesResponse.data);
      }
      if (presetsResponse.data.success) {
        setTaskPresets(presetsResponse.data.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Greška prilikom učitavanja podataka');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For camera roles, only allow updating cameraman assignment
    if ((hasPermission('task.assign_camera') && !hasPermission('task.create')) || 
        (hasPermission('task.assign_camera') && user?.role === 'CAMERMAN_EDITOR') ||
        (hasPermission('task.assign_camera') && user?.role === 'CHIEF_CAMERA')) {
      if (!editingTask) {
        toast.error('Kameramani mogu samo ažurirati dodelu kameramana');
        return;
      }
      
      // Only update cameraman_ids for camera roles, but include date/time for schedule pulling
      // CHIEF_CAMERA and CAMERMAN_EDITOR can also update vehicle_id
      const updateData = {
        cameraman_ids: formData.cameraman_ids,
        date: editingTask.date,
        time_start: editingTask.time_start,
        time_end: editingTask.time_end,
        ...((user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && { vehicle_id: formData.vehicle_id })
      };
      
      try {
        // Check if cameraman_ids changed before updating
        const oldCameramanIds = editingTask.cameraman_ids || [];
        const newCameramanIds = formData.cameraman_ids || [];
        const cameramanIdsChanged = JSON.stringify(oldCameramanIds.sort()) !== JSON.stringify(newCameramanIds.sort());
        
        await tasksApi.update(editingTask.id, updateData);
        
        // Show toast message based on what changed
        if (cameramanIdsChanged) {
          if (newCameramanIds.length > 0) {
            const cameramanNames = newCameramanIds.map(camId => {
              const person = allPeople.find(p => p.id === camId);
              return person ? person.name : `ID ${camId}`;
            }).join(', ');
            
            // Check if it's a replacement or addition
            const wasAdded = oldCameramanIds.length === 0 && newCameramanIds.length > 0;
            const wasReplaced = oldCameramanIds.length > 0 && newCameramanIds.length > 0;
            
            if (wasAdded) {
              toast.success(`📹 KAMERMAN dodijeljen: ${cameramanNames}`, {
                duration: 4000,
                icon: '📹',
              });
            } else if (wasReplaced) {
              const oldCameramanNames = oldCameramanIds.map(camId => {
                const person = allPeople.find(p => p.id === camId);
                return person ? person.name : `ID ${camId}`;
              }).join(', ');
              toast.success(`📹 KAMERMAN zamenjen: ${oldCameramanNames} → ${cameramanNames}`, {
                duration: 4000,
                icon: '📹',
              });
            } else {
              // Fallback for any other changes (additional cameramen added)
              toast.success(`📹 KAMERMAN ažuriran: ${cameramanNames}`, {
                duration: 4000,
                icon: '📹',
              });
            }
          } else {
            // Cameramen were removed
            toast.success('📹 KAMERMAN uklonjen sa zadatka', {
              duration: 3000,
              icon: '📹',
            });
          }
        } else {
          // No change to cameramen, just show generic success
          toast.success('Zadatak je uspešno ažuriran', {
            duration: 3000,
          });
        }
        
        // Proveri da li je SLUŽBENI PUT flag aktivan i da li je kameraman dodeljen
        if (editingTask.flags && editingTask.flags.includes('SLUŽBENI PUT') && 
            formData.cameraman_ids && formData.cameraman_ids.length > 0) {
          // Samo za PRODUCER role prikaži alert
          if (user?.role === 'PRODUCER') {
            setShowTravelAlert(true);
          }
        }
        
        setShowModal(false);
        setEditingTask(null);
        setIsEditingTask(false);
        resetForm();
        // Don't call loadData() here as it resets people state to current date
        // Instead, just reload tasks to show updated cameraman assignments
        const tasksResponse = await tasksApi.getAll(filters);
        if (tasksResponse.data.success) {
          const parsedTasks = tasksResponse.data.data.map((task: any) => ({
            ...task,
            journalist_ids: typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids || '[]') : (task.journalist_ids || []),
            cameraman_ids: typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids || '[]') : (task.cameraman_ids || []),
            flags: typeof task.flags === 'string' ? JSON.parse(task.flags || '[]') : (task.flags || [])
          }));
          setTasks(parsedTasks);
        }
      } catch (error: any) {
        console.error('Error updating cameraman:', error);
        toast.error(error.response?.data?.message || 'Greška prilikom ažuriranja kameramana');
      }
      return;
    }
    
    try {
      // Validacija obaveznih polja
      if (!formData.title || !formData.title.trim()) {
        toast.error('Naslov zadatka je obavezan');
        return;
      }
      if (!formData.date) {
        toast.error('Datum je obavezan');
        return;
      }
      if (!formData.newsroom_id && user?.role !== 'PRODUCER') {
        toast.error('Redakcija je obavezna');
        return;
      }
      // Za PRODUCER role, proveri da li je odabrana redakcija
      if (user?.role === 'PRODUCER' && !selectedNewsroomId) {
        toast.error('Molimo odaberite redakciju');
        return;
      }
      
      // Proveri da li je SLUŽBENI PUT flag aktivan i dodaj travelData u description
      let finalFormData = { ...formData };
      
      // Za PRODUCER role, koristi selectedNewsroomId umesto formData.newsroom_id
      if (user?.role === 'PRODUCER' && selectedNewsroomId) {
        finalFormData.newsroom_id = selectedNewsroomId;
      }
      
      // Clean up undefined values - remove them from the payload
      // Backend will handle undefined values properly by converting them to null
      if (finalFormData.vehicle_id === undefined) {
        delete finalFormData.vehicle_id;
      }
      if (finalFormData.cameraman_id === undefined) {
        delete finalFormData.cameraman_id;
      }
      
      // Ensure attachment_type is included - same as coverage_type
      // Always include attachment_type, even if undefined (let backend handle it)
      finalFormData.attachment_type = formData.attachment_type;
      if (formData.flags && formData.flags.includes('SLUŽBENI PUT') && 
          (travelData.destination || travelData.reason || travelData.activities)) {
        
        // Kreiraj SLUŽBENI PUT sekciju za description
        const travelInfo = [];
        if (travelData.destination) travelInfo.push(`DESTINACIJA: ${travelData.destination}`);
        if (travelData.departureDate) travelInfo.push(`DATUM POLASKA: ${travelData.departureDate}`);
        if (travelData.returnDate) travelInfo.push(`DATUM POVRATKA: ${travelData.returnDate}`);
        if (travelData.reason) travelInfo.push(`RAZLOG PUTOVANJA: ${travelData.reason}`);
        if (travelData.activities) travelInfo.push(`PLANIRANE AKTIVNOSTI: ${travelData.activities}`);
        if (travelData.attachment) {
          travelInfo.push(`ATTACHMENT: ${travelData.attachment.name}`);
          // Dodaj base64 attachment na kraj
          travelInfo.push(`ATTACHMENT_DATA: ${await fileToBase64(travelData.attachment)}`);
        }
        
        const travelSection = `\n\n=== SLUŽBENI PUT INFORMACIJE ===\n${travelInfo.join('\n')}\n================================`;
        
        // Dodaj travel informacije na postojeći description ili kreiraj novi
        finalFormData.description = (formData.description || '') + travelSection;
      }
      
      if (editingTask) {
        // Check if cameraman_ids changed before updating
        const oldCameramanIds = editingTask.cameraman_ids || [];
        const newCameramanIds = finalFormData.cameraman_ids || [];
        const cameramanIdsChanged = JSON.stringify(oldCameramanIds.sort()) !== JSON.stringify(newCameramanIds.sort());
        
        await tasksApi.update(editingTask.id, finalFormData);
        toast.success('Zadatak je uspešno ažuriran');
        
        // Show toast when cameramen are assigned or replaced
        if (cameramanIdsChanged) {
          if (newCameramanIds.length > 0) {
            const cameramanNames = newCameramanIds.map(camId => {
              const person = allPeople.find(p => p.id === camId);
              return person ? person.name : `ID ${camId}`;
            }).join(', ');
            
            // Check if it's a replacement or addition
            const wasAdded = oldCameramanIds.length === 0 && newCameramanIds.length > 0;
            const wasReplaced = oldCameramanIds.length > 0 && newCameramanIds.length > 0;
            const wasRemoved = oldCameramanIds.length > 0 && newCameramanIds.length === 0;
            
            if (wasAdded) {
              toast.success(`📹 KAMERMAN dodijeljen: ${cameramanNames}`, {
                duration: 4000,
                icon: '📹',
              });
            } else if (wasReplaced) {
              const oldCameramanNames = oldCameramanIds.map(camId => {
                const person = allPeople.find(p => p.id === camId);
                return person ? person.name : `ID ${camId}`;
              }).join(', ');
              toast.success(`📹 KAMERMAN zamenjen: ${oldCameramanNames} → ${cameramanNames}`, {
                duration: 4000,
                icon: '📹',
              });
            } else if (wasRemoved) {
              toast.success('📹 KAMERMAN uklonjen sa zadatka', {
                duration: 3000,
                icon: '📹',
              });
            } else {
              // Fallback for any other changes
              toast.success(`📹 KAMERMAN ažuriran: ${cameramanNames}`, {
                duration: 4000,
                icon: '📹',
              });
            }
          } else {
            // Cameramen were removed
            toast.success('📹 KAMERMAN uklonjen sa zadatka', {
              duration: 3000,
              icon: '📹',
            });
          }
        }
        
        // Close modal and reset form after successful update
        setShowModal(false);
        setEditingTask(null);
        setIsEditingTask(false);
        resetForm();
      } else {
        await tasksApi.create(finalFormData);
        toast.success('Zadatak je uspešno kreiran');
        
        // Show toast for CAMERA users if they were assigned to the task
        if (finalFormData.cameraman_ids && finalFormData.cameraman_ids.length > 0) {
          const cameramanNames = finalFormData.cameraman_ids.map(camId => {
            const person = allPeople.find(p => p.id === camId);
            return person ? person.name : `ID ${camId}`;
          }).join(', ');
          
          toast.success(`📹 KAMERMAN dodijeljen: ${cameramanNames}`, {
            duration: 4000,
            icon: '📹',
          });
        }
        
        // Proveri da li je SLUŽBENI PUT flag aktivan i da li je kameraman dodeljen
        if (formData.flags && formData.flags.includes('SLUŽBENI PUT') && 
            formData.cameraman_ids && formData.cameraman_ids.length > 0) {
          // Samo za PRODUCER role prikaži alert
          if (user?.role === 'PRODUCER') {
            setShowTravelAlert(true);
          }
        }
        
        // Close modal and reset form after successful creation
        setShowModal(false);
        setEditingTask(null);
        setIsEditingTask(false);
        resetForm();
      }
      
      // Reload data after modal is closed to show new/updated task immediately
      await loadData();
    } catch (error: any) {
      console.error('Task creation/update error:', error);
      
      // Always reload data to ensure UI is in sync with backend
      // This handles cases where task was created but frontend received an error
      try {
        loadData().catch(err => console.error('Error reloading data after task error:', err));
      } catch (loadError) {
        console.error('Error in reload data:', loadError);
      }
      
      // Close modal even on error to prevent getting stuck
      setShowModal(false);
      setEditingTask(null);
      setIsEditingTask(false);
      resetForm();
    }
  };

  const handleEdit = async (task: Task) => {
    // CAMERMAN_EDITOR can edit tasks, but with restrictions on cameraman modifications
    // This will be handled in the backend during save
    
    setIsEditingTask(true); // Set flag to prevent loadData from overriding people state
    setEditingTask(task);
    
    
    setFormData({
      date: task.date,
      time_start: task.time_start,
      time_end: task.time_end,
      title: task.title,
      slugline: task.slugline,
      location: task.location,
      description: task.description,
      newsroom_id: task.newsroom_id,
      coverage_type: task.coverage_type,
      attachment_type: task.attachment_type,
      status: task.status,
      flags: typeof task.flags === 'string' ? JSON.parse(task.flags || '[]') : (task.flags || []),
      journalist_ids: typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids || '[]') : (task.journalist_ids || []),
      cameraman_ids: typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids || '[]') : (task.cameraman_ids || []),
      vehicle_id: task.vehicle_id,
      cameraman_id: task.cameraman_id
    });
    
    // Load schedules for the task date
    try {
      const normalizedTaskDate = normalizeDateForDB(task.date);
      
      const schedulesResponse = await peopleApi.getSchedules(normalizedTaskDate, normalizedTaskDate);
      if (schedulesResponse.data.success) {
        setSchedules(schedulesResponse.data.data);
        
        // For CHIEF_CAMERA, CAMERMAN_EDITOR and CAMERA roles, update people list with scheduled cameramen
        if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR' || user?.role === 'CAMERA') {
          const scheduledCameramen = schedulesResponse.data.data
            .filter((schedule: any) => schedule.newsroom_name === 'KAMERMANI')
            .map((schedule: any) => ({
              id: schedule.person_id,
              name: schedule.person_name,
              newsroom_id: 8, // KAMERMANI newsroom ID
              role: schedule.role || 'CAMERA'
            }))
            // Remove duplicates by person_id
            .filter((person: any, index: number, array: any[]) => 
              array.findIndex(p => p.id === person.id) === index
            );
          
          setPeople(scheduledCameramen);
        } else if (user?.role === 'PRODUCER') {
          // PRODUCER can see all people from all newsrooms for the selected date
          const allScheduledPeople = schedulesResponse.data.data
            .map((schedule: any) => ({
              id: schedule.person_id,
              name: schedule.person_name,
              newsroom_id: schedule.newsroom_id,
              newsroom_name: schedule.newsroom_name,
              role: schedule.role || 'CAMERA'
            }))
            // Remove duplicates by person_id
            .filter((person: any, index: number, array: any[]) => 
              array.findIndex(p => p.id === person.id) === index
            );
          
          setPeople(allScheduledPeople);
        }
      }
    } catch (error) {
      console.error('Error loading schedules for edit date:', error);
    }
    
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovaj zadatak?')) {
      try {
        await tasksApi.delete(id);
        toast.success('Zadatak je uspešno obrisan');
        loadData();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja zadatka');
      }
    }
  };

  const handleMarkAsDone = async (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (task && window.confirm(`Da li ste sigurni da je službeni nalog za zadatak "${task.title}" urađen?`)) {
      try {
        // Call backend endpoint to mark task as done and send notifications
        await tasksApi.markAsDone(taskId);
        toast.success('Službeni nalog je označen kao urađen. Notifikacije su poslate.');
        loadData();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom označavanja kao urađeno');
      }
    }
  };

  // Task Preset functions
  const handlePresetSelect = (preset: TaskPreset) => {
    // Ensure arrays are properly parsed if they come as strings from database
    const parseArray = (value: any): any[] => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    setFormData({
      ...formData,
      title: preset.title,
      slugline: preset.slugline || '',
      location: preset.location || '',
      description: preset.description || '',
      coverage_type: preset.coverage_type || 'ENG',
      attachment_type: preset.attachment_type,
      journalist_ids: parseArray(preset.journalist_ids),
      cameraman_ids: parseArray(preset.cameraman_ids),
      vehicle_id: preset.vehicle_id || undefined,
      flags: parseArray(preset.flags)
    });
    toast.success(`Preset "${preset.name}" je primenjen`);
  };

  const handleSaveAsPreset = async () => {
    const presetName = window.prompt('Unesite naziv za preset:');
    if (!presetName) return;

    try {
      const presetData = {
        name: presetName,
        title: formData.title,
        slugline: formData.slugline,
        location: formData.location,
        description: formData.description,
        coverage_type: formData.coverage_type,
        attachment_type: formData.attachment_type,
        journalist_ids: formData.journalist_ids,
        cameraman_ids: formData.cameraman_ids,
        vehicle_id: formData.vehicle_id,
        flags: formData.flags
      };

      await taskPresetsApi.create(presetData);
      toast.success('Preset je uspešno sačuvan');
      loadData(); // Reload presets
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja preset-a');
    }
  };

  const handleDeletePreset = async (presetId: number, presetName: string) => {
    if (window.confirm(`Da li ste sigurni da želite obrisati preset "${presetName}"?`)) {
      try {
        await taskPresetsApi.delete(presetId);
        toast.success('Preset je uspešno obrisan');
        loadData(); // Reload presets
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja preset-a');
      }
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setFormData({ ...formData, title: value });
  };

  const resetForm = () => {
    setFormData({
      date: getCurrentDateForInput(), // YYYY-MM-DD format
      time_start: '',
      time_end: '',
      title: '',
      slugline: '',
      location: '',
      description: '',
      newsroom_id: user?.newsroom_id || 0,
      coverage_type: 'ENG',
      attachment_type: undefined,
      status: 'PLANIRANO',
      flags: [],
      journalist_ids: [],
      cameraman_ids: [],
      vehicle_id: undefined,
      cameraman_id: undefined
    });
    // Reset selected newsroom for PRODUCER role
    setSelectedNewsroomId(null);
    
    // Resetuj travelData
    setTravelData({
      destination: '',
      departureDate: '',
      returnDate: '',
      reason: '',
      activities: '',
      attachment: null
    });
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

  const getJournalistsOnDuty = (date: string) => {
    // Za PRODUCER role, ako je odabrana redakcija, prikaži sve novinare iz te redakcije
    if (user?.role === 'PRODUCER' && selectedNewsroomId) {
      const journalistsFromNewsroom = allPeople
        .filter(person => 
          person.newsroom_id === selectedNewsroomId && 
          person.newsroom_id !== 8 // Exclude KAMERMANI newsroom
        )
        .map(person => ({
          id: person.id,
          name: person.name,
          role: person.role || 'VIEWER'
        }));
      
      return journalistsFromNewsroom;
    }
    
    // Za ostale role ili ako PRODUCER nije odabrao redakciju, koristi postojeću logiku
    const normalizedDate = normalizeDateForDB(date);
    
    // Filtriraj raspored za određeni dan
    const daySchedules = schedules.filter(schedule => {
      const scheduleDate = normalizeDateForDB(schedule.date);
      return scheduleDate === normalizedDate;
    });
    
    // Ako ima rasporeda za taj dan, vrati uposlenike iz rasporeda
    if (daySchedules.length > 0) {
      // Ukloni duplikate po person_id i filtriraj po redakciji
      const uniqueJournalists = daySchedules.reduce((acc: Array<{id: number, name: string, role: string}>, schedule) => {
        const existing = acc.find((j: {id: number, name: string, role: string}) => j.id === schedule.person_id);
        if (!existing && schedule.person_id && schedule.person_name) {
          // Proveri da li je uposlenik iz korisničke redakcije (osim za PRODUCER)
          const person = allPeople.find(p => p.id === schedule.person_id);
          if (person && (user?.role === 'PRODUCER' || person.newsroom_id === user?.newsroom_id)) {
            // Za PRODUCER, prikaži sve osim kamermana (KAMERMANI newsroom)
            // Za ostale role, prikaži samo iz njihove redakcije
            if (user?.role === 'PRODUCER') {
              // PRODUCER vidi sve osim kamermana (newsroom_id !== 8)
              if (person.newsroom_id !== 8) {
                acc.push({
                  id: schedule.person_id,
                  name: schedule.person_name,
                  role: schedule.role || 'VIEWER'
                });
              }
            } else {
              // Za ostale role, prikaži samo iz njihove redakcije
              acc.push({
                id: schedule.person_id,
                name: schedule.person_name,
                role: schedule.role || 'VIEWER'
              });
            }
          }
        }
        return acc;
      }, []);
      return uniqueJournalists;
    }
    
    // Ako nema rasporeda za taj dan, vrati PRAZNU listu
    // Prikazuju se SAMO uposlenici koji su eksplicitno u rasporedu i iz korisničke redakcije
    return [];
  };

  const getVehicleName = useCallback((id?: number) => {
    if (!id) return '';
    const vehicle = vehicles.find(v => v.id === id);
    return vehicle ? vehicle.name : `ID: ${id}`;
  }, [vehicles]);

  // Parse attachment from description - wrapper for external function
  const parseAttachmentFromDescriptionWrapper = useCallback((description: string) => {
    return parseAttachmentFromDescription(description);
  }, []);

  // Download attachment - wrapper for external function
  const downloadAttachmentWrapper = useCallback((fileName: string, base64Data: string) => {
    downloadAttachment(fileName, base64Data);
  }, []);

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      
      toast.success('Redosled zadataka je promenjen');
    }
  }, []);

  // const getCameramanName = (id?: number) => {
  //   if (!id) return '';
  //   const cameraman = people.find(p => p.id === id);
  //   return cameraman ? cameraman.name : `ID: ${id}`;
  // };

  const toggleFlag = (flag: TaskFlag) => {
    if (flag === 'SLUŽBENI PUT' && !formData.flags.includes(flag)) {
      // Otvori modal za SLUŽBENI PUT
      setShowTravelModal(true);
    }
    
    // Ako se dodaje TEMA oznaka, obriši vrijeme
    if (flag === 'TEMA' && !formData.flags.includes(flag)) {
      setFormData(prev => ({
        ...prev,
        time_start: '',
        time_end: '',
        flags: [...prev.flags, flag]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        flags: prev.flags.includes(flag)
          ? prev.flags.filter(f => f !== flag)
          : [...prev.flags, flag]
      }));
    }
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Dispozicija</h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1">Upravljanje zadacima i rasporedima</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {hasPermission('task.create') && user?.role !== 'CHIEF_CAMERA' && user?.role !== 'CAMERMAN_EDITOR' && (
            <button
              onClick={() => {
                resetForm();
                setEditingTask(null);
                setShowModal(true);
              }}
              className="btn btn-primary flex items-center justify-center flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Novi zadatak</span>
              <span className="sm:hidden">Novi</span>
            </button>
          )}
          <button
            onClick={handleExport}
            className="btn btn-secondary flex items-center justify-center flex-1 sm:flex-none"
            title="Izvezi"
          >
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Izvezi</span>
          </button>
          <button
            onClick={async () => {
              try {
                // Fetch tasks for print with user's newsroom filter
                const printFilters = {
                  ...filters,
                  newsroom_id: (user?.role === 'CHIEF_CAMERA') ? '' : (user?.newsroom_id || '')
                };
                
                const response = await tasksApi.getAll(printFilters);
                let printTasks = Array.isArray(response.data) ? response.data : (response.data?.data || []);
                
                // Parse JSON strings for arrays
                printTasks = printTasks.map((task: any) => ({
                  ...task,
                  journalist_ids: typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids || '[]') : (task.journalist_ids || []),
                  cameraman_ids: typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids || '[]') : (task.cameraman_ids || []),
                  flags: typeof task.flags === 'string' ? JSON.parse(task.flags || '[]') : (task.flags || [])
                }));
                
                // Get newsroom name for header
                const newsroomName = (user?.role === 'CHIEF_CAMERA') ? 'Sve redakcije' : 
                  (newsrooms.find(n => n.id === user?.newsroom_id)?.name || 'Nepoznata redakcija');
                
                // Create a print-friendly HTML version
                const printContent = `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>Zadaci - Dispozicija</title>
                      <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .header h1 { margin: 0; color: #333; }
                        .header p { margin: 5px 0; color: #666; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f5f5f5; font-weight: bold; }
                        .no-tasks { text-align: center; padding: 40px; color: #666; }
                        @media print {
                          body { margin: 0; }
                          .no-print { display: none; }
                        }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
                          <img src="/rtvtk-logo.jpg" alt="RTVTK Logo" style="height: 35px; width: auto; margin-right: 12px;" />
                          <h1 style="margin: 0;">RTVTK - Dispozicija</h1>
                        </div>
                        <p>Redakcija: ${newsroomName}</p>
                        <p>Datum: ${filters.date ? formatDate(filters.date) : formatDate(new Date())}</p>
                        <p>Generisano: ${getCurrentDateTime()}</p>
                      </div>
                      ${printTasks.length === 0 ? 
                        '<div class="no-tasks">Nema zadataka za prikaz.</div>' :
                        `<table>
                          <thead>
                            <tr>
                              <th>Datum</th>
                              <th>Vrijeme</th>
                              <th>Naslov</th>
                              <th>Lokacija</th>
                              <th>Status</th>
                              <th>Novinar</th>
                              <th>Kameraman</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${printTasks.map((task: any) => `
                              <tr>
                                <td>${formatDate(task.date)}</td>
                                <td>${task.time_start && task.time_end ? `${task.time_start} - ${task.time_end}` : 'TEMA'}</td>
                                <td>${task.title}</td>
                                <td>${task.location || ''}</td>
                                <td>${task.status}</td>
                                <td>${task.journalist_ids && task.journalist_ids.length > 0 
                                  ? task.journalist_ids.map((id: number) => getPersonName(id)).join(', ')
                                  : 'Nije dodjeljen'}</td>
                                <td>${(task.cameraman_ids && task.cameraman_ids.length > 0 
                                  ? task.cameraman_ids.map((id: number) => getPersonName(id)).join('<br>')
                                  : task.cameraman_id 
                                    ? getPersonName(task.cameraman_id)
                                    : 'Nije dodjeljen')}</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>`
                      }
                    </body>
                  </html>
                `;
                
                // Create a new window and write content
                const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
                if (printWindow) {
                  printWindow.document.write(printContent);
                  printWindow.document.close();
                  
                  // Focus the window immediately
                  printWindow.focus();
                  
                  // Wait for content to load then print
                  printWindow.onload = function() {
                    // Minimal delay to ensure content is rendered
                    setTimeout(() => {
                      printWindow.print();
                      // Close window after print dialog is shown
                      setTimeout(() => {
                        printWindow.close();
                      }, 500);
                    }, 100);
                  };
                  
                  // Fallback: if onload doesn't fire, try after a shorter delay
                  setTimeout(() => {
                    if (!printWindow.closed) {
                      printWindow.print();
                      setTimeout(() => {
                        printWindow.close();
                      }, 500);
                    }
                  }, 800);
                } else {
                  alert('Molimo dozvolite popup prozore za štampanje.');
                }
              } catch (error) {
                console.error('Print error:', error);
                alert('Greška prilikom štampanja: ' + (error instanceof Error ? error.message : 'Nepoznata greška'));
              }
            }}
            className="btn btn-secondary flex items-center justify-center"
            title="Print"
          >
            <Printer className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Filters - Mobile Optimized */}
      <div className="card p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
              className="input flex-1"
            />
          </div>
          
          <select
            value={filters.newsroom_id}
            onChange={(e) => setFilters(prev => ({ ...prev, newsroom_id: e.target.value }))}
            className="input"
          >
            <option value="">Sve redakcije</option>
            {newsrooms.map(newsroom => (
              <option key={newsroom.id} value={newsroom.id}>
                {newsroom.name}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="input"
          >
            <option value="">Svi statusi</option>
            <option value="PLANIRANO">Planirano</option>
            <option value="DODIJELJENO">Dodijeljeno</option>
            <option value="U_TOKU">U toku</option>
            <option value="SNIMLJENO">Snimljeno</option>
            <option value="OTKAZANO">Otkazano</option>
          </select>

          <select
            value={filters.coverage_type}
            onChange={(e) => setFilters(prev => ({ ...prev, coverage_type: e.target.value }))}
            className="input"
          >
            <option value="">Svi tipovi</option>
            <option value="ENG" title="Brzo terensko snimanje vijesti (snimatelj + novinar ili one-man band)">ENG</option>
            <option value="IFP" title="Improvizirano terensko snimanje s minimalnom opremom">IFP</option>
            <option value="EFP" title="Planirana i kvalitetnija terenska produkcija sa većom ekipom">EFP</option>
            <option value="SNG" title="Terensko pokrivanje sa satelitskim prijenosom signala">SNG</option>
            <option value="LIVE" title="Svako javljanje uživo, bez obzira na tehnologiju (IP, SNG, OB...)">LIVE</option>
            <option value="STUDIO" title="Snimanje ili emitiranje iz studija u multikamera okruženju">STUDIO</option>
            <option value="OB" title="Velika vanjska produkcija s TV kolima i višekamerom (sport, eventi)">OB</option>
            <option value="IP Live" title="Live prijenos putem IP/backpack sistema (LiveU, TVU, mobilna mreža)">IP Live</option>
          </select>
        </div>
      </div>

      {/* Tasks List */}
      <div className="card p-4 md:p-6">
        {tasks.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-gray-500 dark:text-gray-400">
            <Calendar className="w-12 md:w-16 h-12 md:h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <h3 className="text-base md:text-lg font-medium mb-2">Nema zadataka</h3>
            <p className="text-sm md:text-base">{(user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') ? 'Nema zadataka za prikaz.' : 'Kliknite "Novi zadatak" da kreirate prvi zadatak.'}</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map(task => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 md:space-y-4">
                {tasks.map((task) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    highlightedTaskId={highlightedTaskId}
                    getStatusBadge={getStatusBadge}
                    getCoverageBadge={getCoverageBadge}
                    getAttachmentBadge={getAttachmentBadge}
                    getPersonName={getPersonName}
                    getNewsroomName={getNewsroomName}
                    getVehicleName={getVehicleName}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    handleMarkAsDone={handleMarkAsDone}
                    user={user}
                    hasPermission={hasPermission}
                    parseAttachmentFromDescription={parseAttachmentFromDescriptionWrapper}
                    downloadAttachment={downloadAttachmentWrapper}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-20 mx-auto p-4 md:p-5 border-0 md:border border-gray-200 dark:border-gray-700 w-full md:w-11/12 md:max-w-4xl shadow-lg rounded-none md:rounded-lg bg-white dark:bg-gray-800 min-h-screen md:min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingTask ? 'Uredi zadatak' : 'Novi zadatak'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingTask(null);
                  setIsEditingTask(false);
                  resetForm();
                }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Preset Section - Only show for new tasks - Mobile Optimized */}
            {!editingTask && (
              <div className="mb-4 md:mb-6 p-3 md:p-4 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
                <h3 className="text-base md:text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Preset zadataka</h3>
                
                {/* Show existing presets if any */}
                {taskPresets.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {taskPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 rounded-full text-xs md:text-sm hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                      >
                        <button
                          onClick={() => handlePresetSelect(preset)}
                          className="px-2 md:px-3 py-1 hover:bg-blue-300 dark:hover:bg-blue-600 rounded-l-full transition-colors min-h-[32px] md:min-h-0"
                        >
                          {preset.name}
                        </button>
                        <button
                          onClick={() => handleDeletePreset(preset.id, preset.name)}
                          className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-700 hover:text-red-800 dark:hover:text-red-200 rounded-r-full transition-colors min-h-[32px] md:min-h-0"
                          title="Obriši preset"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Always show save as preset option */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-xs md:text-sm text-blue-700 dark:text-blue-300">
                    {taskPresets.length > 0 
                      ? "Kliknite na preset da automatski popunite polja, ili "
                      : "Sačuvajte česte zadatke kao preset-e za brže kreiranje: "
                    }
                    <button
                      type="button"
                      onClick={handleSaveAsPreset}
                      className="text-blue-800 dark:text-blue-200 underline hover:text-blue-900 dark:hover:text-blue-100 font-medium whitespace-nowrap"
                    >
                      sačuvajte trenutni zadatak kao preset
                    </button>
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
              {/* For CAMERA role, auto-save the status */}
              {hasPermission('task.confirm_recorded') && user?.role === 'CAMERA' ? (
                <div className="text-center py-8">
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-2">Zadatak: {formData.title}</h3>
                    <p className="text-sm text-blue-700">Datum: {formatDate(formData.date)}</p>
                    <p className="text-sm text-blue-700">Vrijeme: {formData.time_start} - {formData.time_end}</p>
                    <p className="text-sm text-blue-700">Lokacija: {formData.location}</p>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-lg font-medium text-gray-800 mb-2">Status ažuriran na:</p>
                    <div className={`inline-block px-4 py-2 rounded-full text-white font-medium ${
                      formData.status === 'SNIMLJENO' ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {formData.status === 'SNIMLJENO' ? '✓ SNIMLJENO' : '× OTKAZANO'}
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600">
                    Status je automatski ažuriran. Zatvorite ovaj prozor.
                  </p>
                </div>
              ) : hasPermission('task.confirm_recorded') && user?.role === 'CAMERA' ? (
                <div>
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-3 text-lg">Informacije o zadatku</h3>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium text-blue-800">Naslov:</span> <span className="text-gray-700">{formData.title}</span></p>
                      <p><span className="font-medium text-blue-800">Datum:</span> <span className="text-gray-700">{formatDate(formData.date)}</span></p>
                      <p><span className="font-medium text-blue-800">Vrijeme:</span> <span className="text-gray-700">{formData.time_start || 'N/A'} - {formData.time_end || 'N/A'}</span></p>
                      <p><span className="font-medium text-blue-800">Lokacija:</span> <span className="text-gray-700">{formData.location || 'N/A'}</span></p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="label">Status zadatka</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as TaskStatus }))}
                      className="input"
                    >
                      <option value="PLANIRANO">Planirano</option>
                      <option value="DODIJELJENO">Dodijeljeno</option>
                      <option value="U_TOKU">U toku</option>
                      <option value="SNIMLJENO">Snimljeno</option>
                      <option value="OTKAZANO">Otkazano</option>
                    </select>
                    <p className="mt-2 text-sm text-gray-600">
                      Izaberite status zadatka i kliknite "Sačuvaj" da potvrdite.
                    </p>
                  </div>
                </div>
              ) : (hasPermission('task.assign_camera') && !hasPermission('task.create') && user?.role !== 'CAMERA') || 
               (hasPermission('task.assign_camera') && user?.role === 'CAMERMAN_EDITOR') ||
               (hasPermission('task.assign_camera') && user?.role === 'CHIEF_CAMERA') ? (
                <div>
                  <div>
                    <label className="label">Kamermani</label>
                    
                    {/* Prikaz izabranih kamermana kao tagovi */}
                    {formData.cameraman_ids && Array.isArray(formData.cameraman_ids) && formData.cameraman_ids.length > 0 && (
                      <div className="mb-3">
                        <div className="flex flex-wrap gap-2">
                          {formData.cameraman_ids.map((id, index) => {
                            const person = people.find(p => p.id === id);
                            return (
                              <span key={`selected-cameraman-${index}`} className="inline-flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                <Camera className="w-3 h-3 mr-1" />
                                {person?.name || `ID: ${id}`}
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Check if CAMERMAN_EDITOR can remove this cameraman
                                    if (user?.role === 'CAMERMAN_EDITOR' && editingTask?.cameraman_assigned_by && editingTask.cameraman_assigned_by !== user.id) {
                                      toast.error('Ne možete uklanjati kamermane koje je dodijelio neko drugi. Možete samo dodavati nove kamermane.');
                                      return;
                                    }
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      cameraman_ids: prev.cameraman_ids.filter(camId => camId !== id) 
                                    }));
                                  }}
                                  className="ml-2 text-blue-600 hover:text-blue-800 font-bold"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Checkbox lista za izbor kamermana */}
                    <div className="max-h-40 overflow-y-auto border rounded p-3 bg-gray-50">
                      <div className="space-y-2">
                        {(() => {
                          const cameramen = getScheduledCameramen();
                          return cameramen.map(person => (
                          <label key={person.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={formData.cameraman_ids.includes(person.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    cameraman_ids: [...prev.cameraman_ids, person.id] 
                                  }));
                                } else {
                                  // Check if CAMERMAN_EDITOR can uncheck this cameraman
                                  if (user?.role === 'CAMERMAN_EDITOR' && editingTask?.cameraman_assigned_by && editingTask.cameraman_assigned_by !== user.id) {
                                    toast.error('Ne možete uklanjati kamermane koje je dodijelio neko drugi. Možete samo dodavati nove kamermane.');
                                    return;
                                  }
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    cameraman_ids: prev.cameraman_ids.filter(id => id !== person.id) 
                                  }));
                                }
                              }}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex items-center">
                              <Camera className="w-4 h-4 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">{person.name}</span>
                            </div>
                          </label>
                        ));
                        })()}
                      </div>
                    </div>
                    
                    {/* Dodatne opcije */}
                    <div className="mt-2 flex justify-between">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ 
                          ...prev, 
                          cameraman_ids: people.map(p => p.id) 
                        }))}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Izaberi sve
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ 
                          ...prev, 
                          cameraman_ids: [] 
                        }))}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Obriši sve
                      </button>
                    </div>
                  </div>

                  {/* Vehicle Selection in Edit Mode - Only for CHIEF_CAMERA and CAMERMAN_EDITOR */}
                  {(user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && (
                    <div>
                      <label className="label">Vozilo</label>
                      <select
                        value={formData.vehicle_id || ''}
                        onChange={(e) => {
                          const vehicleId = e.target.value === '' ? undefined : parseInt(e.target.value);
                          // Debug logging (only in development)
                          if (process.env.NODE_ENV === 'development') {
                            console.log('Vehicle dropdown changed (edit mode):', e.target.value, 'parsed to:', vehicleId);
                          }
                          setFormData(prev => ({ 
                            ...prev, 
                            vehicle_id: vehicleId
                          }));
                        }}
                        className="input"
                      >
                        <option value="">Izaberite vozilo</option>
                        {vehicles.map(vehicle => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name} ({vehicle.plate_number}) - {vehicle.type}
                          </option>
                        ))}
                      </select>
                      {/* Prikaz odabranog vozila u edit modu */}
                      {formData.vehicle_id && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-sm font-medium text-blue-900">
                              Odabrano vozilo: {getVehicleName(formData.vehicle_id)}
                            </span>
                          </div>
                            {(() => {
                              const selectedVehicle = vehicles.find(v => v.id === formData.vehicle_id);
                              return selectedVehicle ? (
                                <div className="mt-1 text-xs text-blue-700">
                                  {selectedVehicle.plate_number} • {selectedVehicle.type}
                                </div>
                              ) : null;
                            })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Datum</label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                        className="input"
                        required
                      />
                    </div>

                    <div>
                      <label className="label">Redakcija</label>
                      <input
                        type="text"
                        value={user?.newsroom?.name || 'Nepoznata redakcija'}
                        className="input bg-gray-100 cursor-not-allowed"
                        readOnly
                        disabled
                      />
                      <input
                        type="hidden"
                        value={formData.newsroom_id || 0}
                      />
                    </div>

                    <div>
                      <label className="label">Vreme početka (opciono)</label>
                      <input
                        type="text"
                        value={formData.time_start}
                        onChange={(e) => setFormData(prev => ({ ...prev, time_start: e.target.value }))}
                        className="input"
                        placeholder="npr. 08:00, 8h, 8:30, itd."
                      />
                    </div>

                    <div>
                      <label className="label">Vreme završetka (opciono)</label>
                      <input
                        type="text"
                        value={formData.time_end}
                        onChange={(e) => setFormData(prev => ({ ...prev, time_end: e.target.value }))}
                        className="input"
                        placeholder="npr. 16:00, 16h, 4:30, itd."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="label">Naslov</label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={handleTitleChange}
                        className="input"
                        placeholder="Naslov će se automatski pretvoriti u velika slova"
                        required
                      />
                    </div>


                    <div>
                      <label className="label">Lokacija</label>
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value.toUpperCase() }))}
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="label">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as TaskStatus }))}
                        className="input"
                      >
                        <option value="PLANIRANO">Planirano</option>
                        <option value="DODIJELJENO">Dodijeljeno</option>
                        <option value="U_TOKU">U toku</option>
                        <option value="SNIMLJENO">Snimljeno</option>
                        <option value="OTKAZANO">Otkazano</option>
                      </select>
                    </div>

                    <div>
                      <label className="label">Tip pokrivanja</label>
                      <select
                        value={formData.coverage_type}
                        onChange={(e) => setFormData(prev => ({ ...prev, coverage_type: e.target.value as CoverageType }))}
                        className="input"
                      >
                        <option value="ENG" title="Brzo terensko snimanje vijesti (snimatelj + novinar ili one-man band)">ENG</option>
                        <option value="IFP" title="Improvizirano terensko snimanje s minimalnom opremom">IFP</option>
                        <option value="EFP" title="Planirana i kvalitetnija terenska produkcija sa većom ekipom">EFP</option>
                        <option value="SNG" title="Terensko pokrivanje sa satelitskim prijenosom signala">SNG</option>
                        <option value="LIVE" title="Svako javljanje uživo, bez obzira na tehnologiju (IP, SNG, OB...)">LIVE</option>
                        <option value="STUDIO" title="Snimanje ili emitiranje iz studija u multikamera okruženju">STUDIO</option>
                        <option value="OB" title="Velika vanjska produkcija s TV kolima i višekamerom (sport, eventi)">OB</option>
                        <option value="IP Live" title="Live prijenos putem IP/backpack sistema (LiveU, TVU, mobilna mreža)">IP Live</option>
                      </select>
                    </div>

                    <div>
                      <label className="label">Tip priloga</label>
                      <select
                        value={formData.attachment_type || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const attachmentType = value && value !== '' ? value as AttachmentType : undefined;
                          console.log('SELECT CHANGED - value:', value, 'attachmentType:', attachmentType);
                          setFormData(prev => {
                            const newData = { 
                              ...prev, 
                              attachment_type: attachmentType
                            };
                            console.log('FORM DATA UPDATED - attachment_type:', newData.attachment_type);
                            return newData;
                          });
                        }}
                        className="input"
                      >
                        <option value="">Izaberite tip priloga</option>
                        <option value="PACKAGE" title="Kompletan TV prilog s VO + SOT">PACKAGE</option>
                        <option value="VO" title="Video uz naraciju novinara">VO</option>
                        <option value="VO/SOT" title="Naracija + jedna ili više izjava">VO/SOT</option>
                        <option value="SOT" title="Samostalna izjava bez naracije">SOT</option>
                        <option value="FEATURE" title="Duža, razrađena priča (magazin)">FEATURE</option>
                        <option value="NATPKG" title="Prilog bez naracije, samo prirodni zvukovi i izjave">NATPKG</option>
                      </select>
                    </div>

                    {/* Newsroom selector for PRODUCER role */}
                    {user?.role === 'PRODUCER' && (
                      <div>
                        <label className="label">Redakcija</label>
                        <select
                          value={selectedNewsroomId || ''}
                          onChange={(e) => {
                            const newsroomId = e.target.value ? parseInt(e.target.value) : null;
                            setSelectedNewsroomId(newsroomId);
                            // Reset journalist selection when newsroom changes
                            setFormData(prev => ({ 
                              ...prev, 
                              journalist_ids: [],
                              newsroom_id: newsroomId || 0
                            }));
                          }}
                          className="input"
                        >
                          <option value="">Izaberite redakciju</option>
                          {newsrooms
                            .filter(newsroom => newsroom.id !== 8) // Exclude KAMERMANI newsroom
                            .map((newsroom) => (
                            <option key={newsroom.id} value={newsroom.id}>
                              {newsroom.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="label">
                        {user?.role === 'PRODUCER' 
                          ? `Novinar ${selectedNewsroomId ? `(iz odabrane redakcije)` : '(odaberite redakciju prvo)'}`
                          : `Novinar (iz rasporeda za ${formData.date})`
                        }
                      </label>
                      <select
                        value={formData.journalist_ids[0] || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          journalist_ids: e.target.value ? [parseInt(e.target.value)] : [] 
                        }))}
                        className="input"
                        disabled={user?.role === 'PRODUCER' && !selectedNewsroomId}
                      >
                        <option value="">
                          {user?.role === 'PRODUCER' && !selectedNewsroomId 
                            ? 'Odaberite redakciju prvo' 
                            : 'Izaberite novinara'
                          }
                        </option>
                        {getJournalistsOnDuty(formData.date).map((journalist: {id: number, name: string, role: string}) => (
                          <option key={journalist.id} value={journalist.id}>
                            {journalist.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(hasPermission('task.assign_camera') || user?.role === 'PRODUCER') && (
                      <div>
                        <label className="label">Kamermani</label>
                        
                        {/* Prikaz izabranih kamermana kao tagovi */}
                        {formData.cameraman_ids && Array.isArray(formData.cameraman_ids) && formData.cameraman_ids.length > 0 && (
                          <div className="mb-3">
                            <div className="flex flex-wrap gap-2">
                              {formData.cameraman_ids.map((id, index) => {
                                const person = people.find(p => p.id === id);
                                return (
                                  <span key={`selected-cameraman-edit-${index}`} className="inline-flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                    <Camera className="w-3 h-3 mr-1" />
                                    {person?.name || `ID: ${id}`}
                                    <button
                                      type="button"
                                      onClick={() => setFormData(prev => ({ 
                                        ...prev, 
                                        cameraman_ids: prev.cameraman_ids.filter(camId => camId !== id) 
                                      }))}
                                      className="ml-2 text-blue-600 hover:text-blue-800 font-bold"
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Checkbox lista za izbor kamermana */}
                        <div className="max-h-40 overflow-y-auto border rounded p-3 bg-gray-50">
                          <div className="space-y-2">
                            {(() => {
                              const cameramen = getScheduledCameramen();
                              return cameramen.map(person => (
                              <label key={person.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                                <input
                                  type="checkbox"
                                  checked={formData.cameraman_ids.includes(person.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData(prev => ({ 
                                        ...prev, 
                                        cameraman_ids: [...prev.cameraman_ids, person.id] 
                                      }));
                                    } else {
                                      setFormData(prev => ({ 
                                        ...prev, 
                                        cameraman_ids: prev.cameraman_ids.filter(id => id !== person.id) 
                                      }));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <div className="flex items-center">
                                  <Camera className="w-4 h-4 text-gray-400 mr-2" />
                                  <span className="text-sm font-medium text-gray-900">{person.name}</span>
                                </div>
                              </label>
                            ));
                            })()}
                          </div>
                        </div>
                        
                        {/* Dodatne opcije */}
                        <div className="mt-2 flex justify-between">
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              cameraman_ids: people.map(p => p.id) 
                            }))}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Izaberi sve
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              cameraman_ids: [] 
                            }))}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Obriši sve
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vehicle Selection - Only for CHIEF_CAMERA and CAMERMAN_EDITOR */}
                  {(user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && (
                    <div>
                      <label className="label">Vozilo</label>
                      <select
                        value={formData.vehicle_id || ''}
                        onChange={(e) => {
                          const vehicleId = e.target.value === '' ? undefined : parseInt(e.target.value);
                          // Debug logging (only in development)
                          if (process.env.NODE_ENV === 'development') {
                            console.log('Vehicle dropdown changed:', e.target.value, 'parsed to:', vehicleId);
                          }
                          setFormData(prev => ({ 
                            ...prev, 
                            vehicle_id: vehicleId
                          }));
                        }}
                        className="input"
                      >
                        <option value="">Izaberite vozilo</option>
                        {vehicles.map(vehicle => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name} ({vehicle.plate_number}) - {vehicle.type}
                          </option>
                        ))}
                      </select>
                      {/* Prikaz odabranog vozila */}
                      {formData.vehicle_id && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-sm font-medium text-blue-900">
                              Odabrano vozilo: {getVehicleName(formData.vehicle_id)}
                            </span>
                          </div>
                            {(() => {
                              const selectedVehicle = vehicles.find(v => v.id === formData.vehicle_id);
                              return selectedVehicle ? (
                                <div className="mt-1 text-xs text-blue-700">
                                  {selectedVehicle.plate_number} • {selectedVehicle.type}
                                </div>
                              ) : null;
                            })()}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="label">Opis</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="input"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="label">Oznake</label>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                      {(['TEMA', 'UŽIVO', 'REŽIJA', 'VIBER/SKYPE', 'SLUŽBENI PUT', 'EMISIJA', 'HITNO', 'RAZMJENA'] as TaskFlag[]).map(flag => (
                        <button
                          key={flag}
                          type="button"
                          onClick={() => toggleFlag(flag)}
                          className={`px-2 md:px-3 py-1.5 md:py-1 rounded-full text-xs md:text-sm min-h-[36px] md:min-h-0 ${
                            formData.flags.includes(flag)
                              ? flag === 'HITNO'
                                ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700'
                                : 'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 border border-primary-300 dark:border-primary-700'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {flag === 'HITNO' ? '🚨 ' : ''}{flag}
                        </button>
                      ))}
                    </div>
                  </div>


                  {/* Objašnjenje tipova pokrivanja */}
                  <div className="mt-4 md:mt-6 p-3 md:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h4 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Objašnjenje tipova pokrivanja:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <div><strong>ENG:</strong> Brzo terensko snimanje vijesti (snimatelj + novinar ili one-man band)</div>
                      <div><strong>IFP:</strong> Improvizirano terensko snimanje s minimalnom opremom</div>
                      <div><strong>EFP:</strong> Planirana i kvalitetnija terenska produkcija sa većom ekipom</div>
                      <div><strong>SNG:</strong> Terensko pokrivanje sa satelitskim prijenosom signala</div>
                      <div><strong>LIVE:</strong> Svako javljanje uživo, bez obzira na tehnologiju (IP, SNG, OB...)</div>
                      <div><strong>STUDIO:</strong> Snimanje ili emitiranje iz studija u multikamera okruženju</div>
                      <div><strong>OB:</strong> Velika vanjska produkcija s TV kolima i višekamerom (sport, eventi)</div>
                      <div><strong>IP Live:</strong> Live prijenos putem IP/backpack sistema (LiveU, TVU, mobilna mreža)</div>
                    </div>
                  </div>

                  {/* Objašnjenje tipova priloga */}
                  <div className="mt-4 md:mt-6 p-3 md:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h4 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Objašnjenje tipova priloga:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <div><strong>PACKAGE:</strong> Kompletan TV prilog s VO + SOT</div>
                      <div><strong>VO:</strong> Video uz naraciju novinara</div>
                      <div><strong>VO/SOT:</strong> Naracija + jedna ili više izjava</div>
                      <div><strong>SOT:</strong> Samostalna izjava bez naracije</div>
                      <div><strong>FEATURE:</strong> Duža, razrađena priča (magazin)</div>
                      <div><strong>NATPKG:</strong> Prilog bez naracije, samo prirodni zvukovi i izjave</div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingTask(null);
                    setIsEditingTask(false);
                    resetForm();
                  }}
                  className="btn btn-secondary w-full sm:w-auto order-2 sm:order-1"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary w-full sm:w-auto order-1 sm:order-2"
                >
                  {editingTask ? 'Ažuriraj' : 'Kreiraj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SLUŽBENI PUT Modal - Mobile Optimized */}
      {showTravelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 md:p-6 w-full md:max-w-2xl max-h-[90vh] overflow-y-auto m-4 md:m-0">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100">SLUŽBENI PUT - Dodaj informacije</h3>
              <button
                onClick={() => setShowTravelModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-3 md:space-y-4">
              {/* Forma za SLUŽBENI PUT */}
              <div className="space-y-3 md:space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="label">Destinacija</label>
                    <input
                      type="text"
                      value={travelData.destination}
                      onChange={(e) => setTravelData(prev => ({ ...prev, destination: e.target.value.toUpperCase() }))}
                      className="input"
                      placeholder="Gde se ide"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Datum polaska</label>
                    <input
                      type="date"
                      value={travelData.departureDate}
                      onChange={(e) => setTravelData(prev => ({ ...prev, departureDate: e.target.value }))}
                      className="input"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Datum povratka</label>
                    <input
                      type="date"
                      value={travelData.returnDate}
                      onChange={(e) => setTravelData(prev => ({ ...prev, returnDate: e.target.value }))}
                      className="input"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Attachment (poziv za događaj)</label>
                    <input
                      type="file"
                      onChange={(e) => setTravelData(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                      className="input"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    />
                    {travelData.attachment && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 mb-2">
                          Odabran fajl: {travelData.attachment?.name || 'Nije odabran'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const url = URL.createObjectURL(travelData.attachment!);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = travelData.attachment!.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 transition-colors"
                        >
                          📥 Preuzmi fajl
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="label">Razlog putovanja</label>
                  <textarea
                    value={travelData.reason}
                    onChange={(e) => setTravelData(prev => ({ ...prev, reason: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Detaljan razlog putovanja"
                  />
                </div>
                
                <div>
                  <label className="label">Planirane aktivnosti</label>
                  <textarea
                    value={travelData.activities}
                    onChange={(e) => setTravelData(prev => ({ ...prev, activities: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Šta se planira da se radi"
                  />
                </div>
              </div>

              {/* Dugmad - Mobile Optimized */}
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowTravelModal(false);
                    // Resetuj travelData kada se otkaže
                    setTravelData({
                      destination: '',
                      departureDate: '',
                      returnDate: '',
                      reason: '',
                      activities: '',
                      attachment: null
                    });
                  }}
                  className="btn btn-secondary w-full sm:w-auto order-2 sm:order-1"
                >
                  Otkaži
                </button>
                <button
                  onClick={() => {
                    // Sačuvaj podatke
                    // SLUŽBENI PUT podaci processed
                    setShowTravelModal(false);
                  }}
                  className="btn btn-primary w-full sm:w-auto order-1 sm:order-2"
                >
                  Sačuvaj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Travel Alert Modal - Blinking Alert for PRODUCER */}
      {showTravelAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md animate-pulse border-4 border-red-500 dark:border-red-600 shadow-2xl">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center animate-bounce">
                  <span className="text-red-600 text-2xl">🚨</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-xl font-bold text-red-600 animate-pulse">HITNO!</h3>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Kameraman je dodeljen!</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Potrebno je generisati nalog za SLUŽBENI PUT</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">⚠️ Ovaj alert će blikati dok se ne potvrdi</p>
              </div>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900 p-3 rounded-lg mb-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>PRODUCER:</strong> Kada se dodeli kameraman na zadatak sa SLUŽBENI PUT flag-om, 
                automatski se generiše nalog koji mora biti potvrđen.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowTravelAlert(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              >
                Zatvori
              </button>
              <button
                onClick={() => {
                  setShowTravelAlert(false);
                  setShowGenerateModal(true);
                }}
                className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold animate-pulse"
              >
                Generiši nalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Travel Document Modal - Mobile Optimized */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 md:p-6 w-full md:max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Generiši nalog za SLUŽBENI PUT</h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 md:space-y-6">
              {/* Opcije za rad sa nalogom */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                <button
                  onClick={() => setShowTravelModal(true)}
                  className="p-4 border-2 border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">📝</div>
                    <div className="font-medium">Dodaj/uredi podatke</div>
                    <div className="text-sm text-gray-600">Unesi destinaciju, datume, razlog</div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    // Copy to clipboard
                    navigator.clipboard.writeText(generateTravelDocument(travelData));
                    toast.success('Nalog je kopiran u clipboard');
                  }}
                  className="p-4 border-2 border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">📋</div>
                    <div className="font-medium">Kopiraj nalog</div>
                    <div className="text-sm text-gray-600">Kopiraj u clipboard</div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    // Download as text file
                    const blob = new Blob([generateTravelDocument(travelData)], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `sluzbeni_put_${travelData.destination || 'nalog'}_${new Date().toISOString().split('T')[0]}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success('Nalog je preuzet');
                  }}
                  className="p-4 border-2 border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">💾</div>
                    <div className="font-medium">Preuzmi nalog</div>
                    <div className="text-sm text-gray-600">Sačuvaj kao fajl</div>
                  </div>
                </button>
              </div>

              {/* Prikaz trenutnih podataka */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3 text-gray-900">Trenutni podaci za nalog:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div><strong>Destinacija:</strong> {travelData.destination || 'Nije uneseno'}</div>
                  <div><strong>Datum polaska:</strong> {travelData.departureDate || 'Nije uneseno'}</div>
                  <div><strong>Datum povratka:</strong> {travelData.returnDate || 'Nije uneseno'}</div>
                  <div className="flex items-center justify-between">
                    <span><strong>Attachment:</strong> {travelData.attachment?.name || 'Nije priložen'}</span>
                    {travelData.attachment && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = URL.createObjectURL(travelData.attachment!);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = travelData.attachment!.name;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 transition-colors ml-2"
                      >
                        📥 Preuzmi
                      </button>
                    )}
                  </div>
                </div>
                {travelData.reason && (
                  <div className="mt-2">
                    <strong>Razlog:</strong> {travelData.reason}
                  </div>
                )}
                {travelData.activities && (
                  <div className="mt-2">
                    <strong>Aktivnosti:</strong> {travelData.activities}
                  </div>
                )}
              </div>

              {/* Generisani nalog */}
              <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">Generisani nalog:</h4>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date().toLocaleString('sr-RS')}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded border">
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                    {generateTravelDocument(travelData)}
                  </pre>
                </div>
              </div>

              {/* Dugmad - Mobile Optimized */}
              <div className="flex flex-col gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                  💡 <strong>Savet:</strong> Možete korigovati podatke klikom na "Dodaj/uredi podatke"
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setShowGenerateModal(false)}
                    className="btn btn-secondary w-full sm:w-auto order-3 sm:order-1"
                  >
                    Zatvori
                  </button>
                  <button
                    onClick={() => {
                      // Print functionality
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>SLUŽBENI PUT Nalog</title>
                              <style>
                                body { font-family: Arial, sans-serif; padding: 20px; }
                                pre { white-space: pre-wrap; font-family: monospace; }
                              </style>
                            </head>
                            <body>
                              <pre>${generateTravelDocument(travelData)}</pre>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }}
                    className="btn bg-green-600 text-white hover:bg-green-700 w-full sm:w-auto order-2"
                    title="Print"
                  >
                    🖨️ <span className="hidden sm:inline">Print</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowGenerateModal(false);
                      // Reset travel data
                      setTravelData({
                        destination: '',
                        departureDate: '',
                        returnDate: '',
                        reason: '',
                        activities: '',
                        attachment: null
                      });
                      toast.success('Nalog je završen i podaci su resetovani');
                    }}
                    className="btn btn-primary w-full sm:w-auto order-1"
                  >
                    ✅ Završi nalog
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Tip za travel data
type TravelData = {
  destination: string;
  departureDate: string;
  returnDate: string;
  reason: string;
  activities: string;
  attachment: File | null;
};

// Funkcija za konvertovanje fajla u base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Ukloni "data:application/...;base64," prefiks
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

// Funkcija za parsiranje attachment-a iz description-a
const parseAttachmentFromDescription = (description: string) => {
  const attachmentMatch = description.match(/ATTACHMENT: (.+)/);
  const attachmentDataMatch = description.match(/ATTACHMENT_DATA: (.+)/);
  
  if (attachmentMatch && attachmentDataMatch) {
    const fileName = attachmentMatch[1];
    const base64Data = attachmentDataMatch[1];
    return { fileName, base64Data };
  }
  return null;
};

// Funkcija za preuzimanje attachment-a
const downloadAttachment = (fileName: string, base64Data: string) => {
  try {
    // Konvertuj base64 u blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray]);
    
    // Kreiraj download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    alert('Greška prilikom preuzimanja fajla');
  }
};

// Funkcija za generisanje automatskog naloga
const generateTravelDocument = (data: TravelData) => {
  return `
SLUŽBENI PUT - ${data.destination}
─────────────────────────────
Datum: ${data.departureDate} - ${data.returnDate}

Razlog putovanja:
${data.reason}

Planirane aktivnosti:
${data.activities}

Potpis: [Ime i prezime]
Datum: ${new Date().toLocaleDateString('sr-RS')}
  `;
};

export default Dispozicija;
