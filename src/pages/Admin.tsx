import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersApi, newsroomsApi, auditApi, backupApi, rolesApi } from '../services/api';
import { User, Newsroom, AuditLog, BackupInfo } from '../types';
import { formatDateTime, formatDateForInput } from '../utils/dateFormat';
import {
  Users,
  Building2,
  Shield,
  Database,
  Plus,
  Edit,
  Trash2,
  Download,
  RefreshCw,
  User as UserIcon,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  RotateCcw,
  Settings,
  FileText,
  Clock,
  FolderOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';

const Admin: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState<User[]>([]);
  const [newsrooms, setNewsrooms] = useState<Newsroom[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupSettings, setBackupSettings] = useState({
    pdfExportPath: '',
    backupTime: '23:30',
    backupEnabled: true
  });
  const [csvExportDate, setCsvExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [auditFilters, setAuditFilters] = useState({
    dateFrom: '',
    dateTo: '',
    action: '',
    user: ''
  });
  
  const [userFilters, setUserFilters] = useState({
    role: '',
    newsroom: '',
    status: '',
    search: ''
  });
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteFilters, setDeleteFilters] = useState({
    dateFrom: '',
    dateTo: '',
    deleteAllBefore: false
  });
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'user' | 'newsroom'>('user');
  const [editingItem, setEditingItem] = useState<any>(null);

  const [formData, setFormData] = useState({
    username: '',
    name: '',
    password: '',
    role: 'EDITOR',
    newsroom_id: '',
    pin: '',
    description: ''
  });


  // Load data when component mounts or activeTab changes
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const tabs = [
    { id: 'users', name: 'Korisnici', icon: Users, description: 'Upravljanje korisnicima i dozvolama' },
    { id: 'newsrooms', name: 'Redakcije', icon: Building2, description: 'Upravljanje redakcijama' },
    { id: 'audit', name: 'Audit Log', icon: Shield, description: 'Praćenje promjena i aktivnosti' },
    { id: 'backup', name: 'Backup', icon: Database, description: 'Upravljanje backup-ovima' }
  ];

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Always load newsrooms and roles for user creation/editing
      const [newsroomsRes, rolesRes] = await Promise.all([
        newsroomsApi.getAll(),
        rolesApi.getAll()
      ]);
      
      if (newsroomsRes.data.success) {
        setNewsrooms(newsroomsRes.data.data);
      }
      
      if (rolesRes.data.success) {
        setRoles(rolesRes.data.data);
      }
      
      switch (activeTab) {
        case 'users':
          const usersRes = await usersApi.getAll();
          if (usersRes.data.success) {
            setUsers(usersRes.data.data);
          }
          break;
        case 'newsrooms':
          // Newsrooms already loaded above
          break;
        case 'audit':
          const auditResponse = await auditApi.getAll(auditFilters);
          if (auditResponse.data.success) {
            setAuditLogs(auditResponse.data.data);
          }
          break;
        case 'backup':
          const backupResponse = await backupApi.getAll();
          if (backupResponse.data.success) {
            setBackups(backupResponse.data.data);
          }
          // Load backup settings
          const settingsResponse = await backupApi.getSettings();
          if (settingsResponse.data.success) {
            setBackupSettings(settingsResponse.data.data);
          }
          break;
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Greška prilikom učitavanja podataka');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      name: '',
      password: '',
      role: 'EDITOR',
      newsroom_id: '',
      pin: '',
      description: ''
    });
  };

  const exportAuditLogToCSV = () => {
    const headers = ['ID', 'Datum', 'Vrijeme', 'Korisnik', 'Uloga', 'Akcija', 'Opis', 'Tabela', 'Record ID', 'IP Adresa', 'User Agent'];
    const csvContent = [
      headers.join(','),
      ...auditLogs.map(log => [
        log.id,
        formatDateForInput(log.created_at),
        formatDateTime(log.created_at),
        log.user_name || 'Nepoznat korisnik',
        log.user_role || 'Nepoznata uloga',
        log.action,
        log.description || '',
        log.table_name,
        log.record_id,
        log.ip_address || '',
        log.user_agent || ''
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_log_${formatDateForInput(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Audit log je izvezen u CSV formatu');
  };

  const handleDeleteAuditLogs = async () => {
    try {
      if (!deleteFilters.dateFrom && !deleteFilters.dateTo && !deleteFilters.deleteAllBefore) {
        toast.error('Morate specificirati datum ili opseg datuma');
        return;
      }

      const response = await auditApi.deleteByDateRange(deleteFilters);
      
      if (response.data.success) {
        toast.success(response.data.message);
        setShowDeleteModal(false);
        setDeleteFilters({ dateFrom: '', dateTo: '', deleteAllBefore: false });
        loadData(); // Refresh the audit logs
      } else {
        toast.error(response.data.message || 'Greška prilikom brisanja');
      }
    } catch (error: any) {
      console.error('Delete audit logs error:', error);
      toast.error(error.response?.data?.message || 'Greška prilikom brisanja audit loga');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Prepare form data - convert "null" string to null for newsroom_id
      const submitData = {
        ...formData,
        newsroom_id: formData.newsroom_id === "null" ? null : formData.newsroom_id
      };

      if (editingItem) {
        switch (modalType) {
          case 'user':
            await usersApi.update(editingItem.id, submitData);
            break;
          case 'newsroom':
            await newsroomsApi.update(editingItem.id, submitData);
            break;
        }
        toast.success('Podatak je uspešno ažuriran');
      } else {
        switch (modalType) {
          case 'user':
            await usersApi.create(submitData);
            break;
          case 'newsroom':
            await newsroomsApi.create(submitData);
            break;
        }
        toast.success('Podatak je uspešno kreiran');
      }
      setShowModal(false);
      setEditingItem(null);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja podataka');
    }
  };

  const handleEdit = async (item: any) => {
    setEditingItem(item);
    
    if (activeTab === 'users') {
      setModalType('user');
      // Load newsrooms when editing user
      try {
        const newsroomsRes = await newsroomsApi.getAll();
        if (newsroomsRes.data.success) {
          setNewsrooms(newsroomsRes.data.data);
        }
      } catch (error) {
        console.error('Error loading newsrooms:', error);
      }
    } else if (activeTab === 'newsrooms') {
      setModalType('newsroom');
    }
    
    setFormData({
      username: item.username || '',
      name: item.name || '',
      password: '',
      role: item.role || 'EDITOR',
      newsroom_id: item.newsroom_id?.toString() || '',
      pin: item.pin || '',
      description: item.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovaj podatak?')) {
      try {
        switch (activeTab) {
          case 'users':
            await usersApi.delete(id);
            toast.success('Korisnik je uspešno obrisan');
            setUsers(prevUsers => prevUsers.filter(user => user.id !== id));
            break;
          case 'newsrooms':
            await newsroomsApi.delete(id);
            toast.success('Redakcija je uspešno obrisana');
            setNewsrooms(prevNewsrooms => prevNewsrooms.filter(newsroom => newsroom.id !== id));
            break;
        }
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja podataka');
      }
    }
  };

  const createBackup = async () => {
    try {
      await backupApi.create();
      toast.success('Backup je uspešno kreiran');
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom kreiranja backup-a');
    }
  };

  const downloadBackup = async (filename: string) => {
    try {
      const response = await backupApi.download(filename);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Backup je uspešno preuzet');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom preuzimanja backup-a');
    }
  };

  const deleteBackup = async (filename: string) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovaj backup?')) {
      try {
        await backupApi.delete(filename);
        toast.success('Backup je uspešno obrisan');
        setBackups(prevBackups => prevBackups.filter(backup => backup.filename !== filename));
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja backup-a');
      }
    }
  };

  const restoreBackup = async (filename: string) => {
    if (window.confirm(`Da li ste sigurni da želite da povratite bazu podataka na backup "${filename}"?\n\nOva akcija će zameniti trenutnu bazu podataka!`)) {
      try {
        await backupApi.restore(filename);
        toast.success('Backup je uspešno povraćen');
        loadData();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom povraćanja backup-a');
      }
    }
  };

  const updateBackupSettings = async () => {
    try {
      await backupApi.updateSettings(backupSettings);
      toast.success('Postavke backup-a su ažurirane!');
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom ažuriranja postavki');
    }
  };

  const exportCsv = async () => {
    try {
      if (!csvExportDate) {
        toast.error('Molimo izaberite datum za eksport');
        return;
      }
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(csvExportDate)) {
        toast.error('Nevažeći format datuma. Koristite YYYY-MM-DD format.');
        return;
      }
      
      toast.loading('Izvoženje CSV fajla...', { id: 'csv-export' });
      
      const response = await backupApi.exportByDate(csvExportDate);
      
      // Check if response is actually a blob
      if (response.data instanceof Blob) {
        const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zadaci_${csvExportDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
        toast.success(`CSV izvještaj za ${csvExportDate} je preuzet`, { id: 'csv-export' });
      } else if (typeof response.data === 'string') {
        // If it's a string, create a blob from it
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zadaci_${csvExportDate}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(`CSV izvještaj za ${csvExportDate} je preuzet`, { id: 'csv-export' });
      } else {
        // If response is JSON (error response), show error
        const errorData = response.data;
        if (errorData && errorData.message) {
          toast.error(errorData.message, { id: 'csv-export' });
        } else {
          toast.error('Greška prilikom eksporta CSV-a. Neočekivani format odgovora.', { id: 'csv-export' });
        }
      }
    } catch (error: any) {
      console.error('CSV export error:', error);
      
      // Handle different error types
      let errorMessage = 'Greška prilikom eksporta CSV-a';
      
      if (error.response) {
        // Server responded with error status
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            try {
              const errorJson = JSON.parse(error.response.data);
              errorMessage = errorJson.message || errorMessage;
            } catch {
              errorMessage = error.response.data || errorMessage;
            }
          } else if (error.response.data.message) {
            errorMessage = error.response.data.message;
          }
        } else {
          errorMessage = `Greška servera: ${error.response.status} ${error.response.statusText}`;
        }
      } else if (error.request) {
        errorMessage = 'Nema odgovora od servera. Provjerite konekciju.';
      } else {
        errorMessage = error.message || errorMessage;
      }
      
      toast.error(errorMessage, { id: 'csv-export' });
    }
  };

  const getRoleBadge = (role: string) => {
    const roleClasses = {
      PRODUCER: 'badge-danger',
      EDITOR: 'badge-primary',
      CHIEF_CAMERA: 'badge-secondary',
      CONTROL_ROOM: 'badge-warning',
      VIEWER: 'badge-success',
      CAMERA: 'badge-secondary',
      NOVINAR: 'badge-info',
      JOURNALIST: 'badge-info'
    };
    return roleClasses[role as keyof typeof roleClasses] || 'badge-secondary';
  };

  const getRoleDescription = (role: string) => {
    const descriptions = {
      PRODUCER: 'Administrator - puna kontrola sistema',
      EDITOR: 'Urednik - kreiranje i upravljanje zadacima',
      DESK_EDITOR: 'Desk urednik - zadaci za svoju redakciju, pregled rasporeda',
      CHIEF_CAMERA: 'Šef kamere - upravljanje rasporedom kamermana',
      CONTROL_ROOM: 'Kontrolna soba - upravljanje režijom',
      VIEWER: 'Pregledač - samo pregled zadataka',
      CAMERA: 'Kamerman - dodjeljivanje zadataka',
      NOVINAR: 'Novinar - pisanje i uređivanje vijesti',
      JOURNALIST: 'Novinar - pregled rasporeda i svojih zadataka'
    };
    return descriptions[role as keyof typeof descriptions] || 'Nepoznata uloga';
  };

  const handleToggleUserStatus = async (user: User) => {
    try {
      if (user.is_active) {
        await usersApi.delete(user.id);
        toast.success('Korisnik je deaktiviran');
      } else {
        await usersApi.update(user.id, { ...user, is_active: true });
        toast.success('Korisnik je aktiviran');
      }
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom promjene statusa korisnika');
    }
  };

  const handleResetPassword = async (user: User) => {
    const newPassword = prompt('Unesite novu lozinku za korisnika:');
    if (newPassword && newPassword.length >= 6) {
      try {
        await usersApi.update(user.id, { ...user, password: newPassword });
        toast.success('Lozinka je uspešno promijenjena');
        loadData();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom promjene lozinke');
      }
    } else if (newPassword) {
      toast.error('Lozinka mora imati najmanje 6 karaktera');
    }
  };

  // Filter users based on current filters
  const getFilteredUsers = () => {
    return users.filter(user => {
      // Role filter
      if (userFilters.role && user.role !== userFilters.role) {
        return false;
      }
      
      // Newsroom filter
      if (userFilters.newsroom && user.newsroom_id?.toString() !== userFilters.newsroom) {
        return false;
      }
      
      // Status filter
      if (userFilters.status === 'active' && !user.is_active) {
        return false;
      }
      if (userFilters.status === 'inactive' && user.is_active) {
        return false;
      }
      
      // Search filter (name, username, role)
      if (userFilters.search) {
        const searchTerm = userFilters.search.toLowerCase();
        const matchesName = user.name?.toLowerCase().includes(searchTerm);
        const matchesUsername = user.username?.toLowerCase().includes(searchTerm);
        const matchesRole = user.role?.toLowerCase().includes(searchTerm);
        
        if (!matchesName && !matchesUsername && !matchesRole) {
          return false;
        }
      }
      
      return true;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administracija</h1>
          <p className="text-gray-600">Upravljanje korisnicima, redakcijama i sistemom</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Korisnici</h2>
                <p className="text-sm text-gray-600">Upravljanje korisnicima i dozvolama</p>
              </div>
              <button
                onClick={async () => {
                  setModalType('user');
                  resetForm();
                  setEditingItem(null);
                  // Load newsrooms when opening user modal
                  try {
                    const newsroomsRes = await newsroomsApi.getAll();
                    if (newsroomsRes.data.success) {
                      setNewsrooms(newsroomsRes.data.data);
                    }
                  } catch (error) {
                    console.error('Error loading newsrooms:', error);
                  }
                  setShowModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novi korisnik
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow border">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pretraga
                  </label>
                  <input
                    type="text"
                    placeholder="Ime, username, uloga..."
                    value={userFilters.search}
                    onChange={(e) => setUserFilters({...userFilters, search: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* Role Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Uloga
                  </label>
                  <select
                    value={userFilters.role}
                    onChange={(e) => setUserFilters({...userFilters, role: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Sve uloge</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="PRODUCER">PRODUCER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="CHIEF_CAMERA">CHIEF_CAMERA</option>
                    <option value="CAMERMAN_EDITOR">CAMERMAN_EDITOR</option>
                    <option value="CAMERA">CAMERA</option>
                    <option value="CONTROL_ROOM">CONTROL_ROOM</option>
                    <option value="VIEWER">VIEWER</option>
                    <option value="JOURNALIST">JOURNALIST</option>
                  </select>
                </div>

                {/* Newsroom Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Redakcija
                  </label>
                  <select
                    value={userFilters.newsroom}
                    onChange={(e) => setUserFilters({...userFilters, newsroom: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Sve redakcije</option>
                    {newsrooms.map((newsroom) => (
                      <option key={newsroom.id} value={newsroom.id.toString()}>
                        {newsroom.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={userFilters.status}
                    onChange={(e) => setUserFilters({...userFilters, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Svi korisnici</option>
                    <option value="active">Aktivni</option>
                    <option value="inactive">Neaktivni</option>
                  </select>
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <button
                    onClick={() => setUserFilters({role: '', newsroom: '', status: '', search: ''})}
                    className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    Obriši filtere
                  </button>
                </div>
              </div>
              
              {/* Results count */}
              <div className="mt-3 text-sm text-gray-600">
                Prikazano {getFilteredUsers().length} od {users.length} korisnika
              </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {getFilteredUsers().map((user) => (
                  <li key={user.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <UserIcon className="w-10 h-10 text-gray-400 mr-4" />
                        <div>
                          <div className="flex items-center">
                            <h3 className="text-lg font-medium text-gray-900">{user.name}</h3>
                            <span className={`badge ${getRoleBadge(user.role)} ml-2`}>
                              {user.role}
                            </span>
                            {!user.is_active && (
                              <span className="badge badge-secondary ml-2">Neaktivan</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{user.username}</p>
                          <p className="text-xs text-gray-500">{getRoleDescription(user.role)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleResetPassword(user)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Resetuj lozinku"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className={`${
                            user.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-400 hover:text-green-600'
                          }`}
                          title={user.is_active ? 'Deaktiviraj korisnika' : 'Aktiviraj korisnika'}
                        >
                          {user.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Uredi korisnika"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Obriši korisnika"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'newsrooms' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Redakcije</h2>
                <p className="text-sm text-gray-600">Upravljanje redakcijama</p>
              </div>
              <button
                onClick={() => {
                  setModalType('newsroom');
                  resetForm();
                  setEditingItem(null);
                  setShowModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nova redakcija
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newsrooms.filter(newsroom => {
                // CHIEF_CAMERA can see all newsrooms including KAMERMANI
                // ADMIN and CHIEF_CAMERA can see all newsrooms including KAMERMANI
                if (user?.role === 'ADMIN' || user?.role === 'CHIEF_CAMERA') {
                  return true;
                }
                return newsroom.name !== 'KAMERMANI';
              }).map((newsroom) => (
                <div key={newsroom.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{newsroom.name}</h3>
                      <p className="text-sm text-gray-600">PIN: {newsroom.pin}</p>
                      {newsroom.description && (
                        <p className="text-sm text-gray-500 mt-2">{newsroom.description}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(newsroom)}
                        className="text-primary-600 hover:text-primary-900"
                        title="Uredi redakciju"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(newsroom.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Obriši redakciju"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Audit Log</h2>
                <p className="text-sm text-gray-600">Praćenje svih promjena i aktivnosti u sistemu</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportAuditLogToCSV}
                  className="btn btn-secondary flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Izvezi CSV
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="btn btn-danger flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Obriši
                </button>
                <button
                  onClick={loadData}
                  className="btn btn-primary flex items-center"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Osvježi
                </button>
              </div>
            </div>

            {/* Audit Log Filters */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Filteri</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="label">Datum od</label>
                  <input
                    type="date"
                    value={auditFilters.dateFrom}
                    onChange={(e) => setAuditFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Datum do</label>
                  <input
                    type="date"
                    value={auditFilters.dateTo}
                    onChange={(e) => setAuditFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Akcija</label>
                  <select
                    value={auditFilters.action}
                    onChange={(e) => setAuditFilters(prev => ({ ...prev, action: e.target.value }))}
                    className="input"
                  >
                    <option value="">Sve akcije</option>
                    <option value="CREATE">CREATE</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <label className="label">Korisnik</label>
                  <input
                    type="text"
                    value={auditFilters.user}
                    onChange={(e) => setAuditFilters(prev => ({ ...prev, user: e.target.value }))}
                    placeholder="Ime korisnika..."
                    className="input"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => loadData()}
                  className="btn btn-primary"
                >
                  Primijeni filtere
                </button>
                <button
                  onClick={() => {
                    setAuditFilters({ dateFrom: '', dateTo: '', action: '', user: '' });
                    loadData();
                  }}
                  className="btn btn-secondary"
                >
                  Obriši filtere
                </button>
              </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {auditLogs.map((log) => (
                  <li key={log.id} className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-900">{log.action}</p>
                          <span className={`badge text-xs ${
                            log.action.includes('CREATE') ? 'badge-success' :
                            log.action.includes('UPDATE') ? 'badge-primary' :
                            log.action.includes('DELETE') ? 'badge-danger' :
                            'badge-secondary'
                          }`}>
                            {log.action.split(':')[0]}
                          </span>
                        </div>
                        
                        {log.description && (
                          <p className="text-sm text-gray-700 mb-2 bg-gray-50 p-2 rounded">
                            {log.description}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>👤 {log.user_name || 'Nepoznat korisnik'} - {log.user_role || 'Nepoznata uloga'}</span>
                          <span>🕒 {formatDateTime(log.created_at)}</span>
                          <span>📋 {log.table_name}</span>
                          {log.record_id > 0 && !log.action.includes(':') && <span>🔢 ID: {log.record_id}</span>}
                        </div>
                        
                        {log.ip_address && (
                          <p className="text-xs text-gray-400 mt-1">
                            🌐 {log.ip_address}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-6">
            {/* Backup Management Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center">
                    <Database className="w-5 h-5 mr-2" />
                    Backup baze podataka
                  </h2>
                  <p className="text-sm text-gray-600">Upravljanje backup-ovima baze podataka</p>
                </div>
                <button
                  onClick={createBackup}
                  className="btn btn-primary flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Kreiraj backup
                </button>
              </div>

              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                  {backups.map((backup) => (
                    <li key={backup.filename} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-gray-900">{backup.filename}</h3>
                          <p className="text-sm text-gray-600">
                            Kreiran: {formatDateTime(backup.created_at)}
                          </p>
                          <p className="text-xs text-gray-500">Veličina: {(backup.size / 1024).toFixed(2)} KB</p>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => downloadBackup(backup.filename)}
                            className="text-blue-600 hover:text-blue-900 p-2 rounded-md hover:bg-blue-50"
                            title="Preuzmi backup"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => restoreBackup(backup.filename)}
                            className="text-green-600 hover:text-green-900 p-2 rounded-md hover:bg-green-50"
                            title="Povrati backup"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteBackup(backup.filename)}
                            className="text-red-600 hover:text-red-900 p-2 rounded-md hover:bg-red-50"
                            title="Obriši backup"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Backup Settings Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <Settings className="w-5 h-5 mr-2" />
                <h2 className="text-lg font-semibold">⚙️ Postavke Backup-a</h2>
              </div>
              
              <div className="space-y-4">
                {/* Lokacija PDF izvještaja */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FolderOpen className="w-4 h-4 mr-1" />
                    📁 Lokacija PDF izvještaja
                  </label>
                  <input
                    type="text"
                    value={backupSettings.pdfExportPath}
                    onChange={(e) => setBackupSettings({...backupSettings, pdfExportPath: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="/Users/rtvtk/Desktop/RTVTK_Izvjestaji"
                  />
                  <p className="text-xs text-gray-500 mt-1">Direktorijum gdje se čuvaju PDF izvještaji</p>
                </div>
                
                {/* Vrijeme backup-a */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    🕐 Vrijeme backup-a
                  </label>
                  <input
                    type="time"
                    value={backupSettings.backupTime}
                    onChange={(e) => setBackupSettings({...backupSettings, backupTime: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Vrijeme kada se automatski kreira backup (format: HH:MM)</p>
                </div>
                
                {/* Omogući/Onemogući */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={backupSettings.backupEnabled}
                    onChange={(e) => setBackupSettings({...backupSettings, backupEnabled: e.target.checked})}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">
                    Omogući automatski backup
                  </label>
                </div>
                
                {/* Sačuvaj */}
                <button
                  onClick={updateBackupSettings}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  💾 Sačuvaj postavke
                </button>
              </div>
            </div>

            {/* CSV Export Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <FileText className="w-5 h-5 mr-2" />
                <h2 className="text-lg font-semibold">📊 CSV Export</h2>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📅 Izaberite datum za export
                  </label>
                  <input
                    type="date"
                    value={csvExportDate}
                    onChange={(e) => setCsvExportDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={exportCsv}
                    className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 flex items-center"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    📥 Preuzmi CSV
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">CSV fajl će sadržavati sve zadatke za odabrani datum</p>
            </div>

            {/* Current Settings Display */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">📊 Trenutne postavke:</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Lokacija PDF:</strong> {backupSettings.pdfExportPath || 'Nije postavljena'}</p>
                <p><strong>Vrijeme backup-a:</strong> {backupSettings.backupTime}</p>
                <p><strong>Automatski backup:</strong> {backupSettings.backupEnabled ? 'Omogućen' : 'Onemogućen'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-lg bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingItem ? 'Uredi' : 'Novi'} {modalType === 'user' ? 'korisnik' : 'redakcija'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {modalType === 'user' ? 'Dodajte novog korisnika sa dozvolama' :
                   modalType === 'newsroom' ? 'Dodajte novu redakciju sa PIN kodom' :
                   'Dodajte novu osobu u sistem'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {modalType === 'user' && (
                <>
                  <div>
                    <label className="label">Korisničko ime</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="input"
                      required
                      placeholder="Unesite korisničko ime"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Ime i prezime</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="input"
                      required
                      placeholder="Unesite ime i prezime"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Lozinka</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="input"
                      required={!editingItem}
                      placeholder="Unesite lozinku"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Uloga</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                      className="input"
                      required
                    >
                      <option value="">Izaberite ulogu</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.name}>
                          {role.name} - {role.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="label">Redakcija</label>
                    <select
                      value={formData.newsroom_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, newsroom_id: e.target.value }))}
                      className="input"
                    >
                      <option value="">Izaberite redakciju</option>
                      <option value="null">Bez redakcije</option>
                      {newsrooms.filter(newsroom => {
                        // CHIEF_CAMERA can see all newsrooms including KAMERMANI
                        // ADMIN and CHIEF_CAMERA can see all newsrooms including KAMERMANI
                        if (user?.role === 'ADMIN' || user?.role === 'CHIEF_CAMERA') {
                          return true;
                        }
                        return newsroom.name !== 'KAMERMANI';
                      }).map((newsroom) => (
                        <option key={newsroom.id} value={newsroom.id}>
                          {newsroom.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {modalType === 'newsroom' && (
                <>
                  <div>
                    <label className="label">Naziv redakcije</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="input"
                      required
                      placeholder="Unesite naziv redakcije"
                    />
                  </div>
                  
                  <div>
                    <label className="label">PIN kod</label>
                    <input
                      type="text"
                      value={formData.pin}
                      onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                      className="input"
                      required
                      placeholder="Unesite PIN kod"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Opis</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="input"
                      rows={3}
                      placeholder="Unesite opis redakcije"
                    />
                  </div>
                </>
              )}

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
                  {editingItem ? 'Ažuriraj' : 'Kreiraj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Audit Log Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Obriši Audit Log</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              Ova akcija je nepovratna. Molimo pažljivo odaberite datum/e za brisanje.
            </p>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="deleteAllBefore"
                  checked={deleteFilters.deleteAllBefore}
                  onChange={(e) => setDeleteFilters(prev => ({ 
                    ...prev, 
                    deleteAllBefore: e.target.checked,
                    dateTo: e.target.checked ? '' : prev.dateTo
                  }))}
                  className="mr-2"
                />
                <label htmlFor="deleteAllBefore" className="text-sm font-medium text-gray-700">
                  Obriši sve starije od određenog datuma
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Datum od
                </label>
                <input
                  type="date"
                  value={deleteFilters.dateFrom}
                  onChange={(e) => setDeleteFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="input w-full"
                  required
                />
              </div>

              {!deleteFilters.deleteAllBefore && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Datum do
                  </label>
                  <input
                    type="date"
                    value={deleteFilters.dateTo}
                    onChange={(e) => setDeleteFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    className="input w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteFilters({ dateFrom: '', dateTo: '', deleteAllBefore: false });
                }}
                className="btn btn-secondary flex-1"
              >
                Otkaži
              </button>
              <button
                onClick={handleDeleteAuditLogs}
                className="btn btn-danger flex-1"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Obriši
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;