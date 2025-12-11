import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { peopleApi, newsroomsApi, vehiclesApi } from '../services/api';
import { Person, Newsroom, Vehicle } from '../types';
import {
  Plus,
  Edit,
  Trash2,
  User as UserIcon,
  Phone,
  Mail,
  Building2,
  Truck
} from 'lucide-react';
import toast from 'react-hot-toast';

const Uposlenici: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [newsrooms, setNewsrooms] = useState<Newsroom[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Person | null>(null);
  const [activeTab, setActiveTab] = useState<'people' | 'vehicles'>('people');

  const [formData, setFormData] = useState({
    name: '',
    position: '',
    phone: '',
    email: '',
    newsroom_id: user?.role === 'PRODUCER' ? '' : (user?.role === 'CAMERMAN_EDITOR' ? '8' : (user?.newsroom_id?.toString() || '')),
    // Vehicle fields
    type: '',
    plate_number: '',
    is_available: true
  });

  useEffect(() => {
    // Uposlenici component loaded
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Reset active tab if user doesn't have permission for vehicles
  useEffect(() => {
    if (activeTab === 'vehicles' && !(user?.role === 'ADMIN' || user?.role === 'PRODUCER' || user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR')) {
      setActiveTab('people');
    }
  }, [user?.role, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Loading uposlenici data
      const [peopleResponse, newsroomsResponse, vehiclesResponse] = await Promise.all([
        peopleApi.getAll(),
        newsroomsApi.getAll(),
        vehiclesApi.getAll()
      ]);

      if (peopleResponse.data.success) {
        // Uposlenici data loaded
        
        // Filter people based on user role
        const filteredPeople = peopleResponse.data.data.filter((person: Person) => {
          // PRODUCER can see all people from all newsrooms
          if (user?.role === 'PRODUCER') {
            return true; // Show all people
          }
          // CHIEF_CAMERA and CAMERMAN_EDITOR can only see people from KAMERMANI newsroom
          if (user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') {
            return person.newsroom_id === 8; // KAMERMANI newsroom ID
          }
          // EDITOR, DESK_EDITOR and other roles can only see people from their newsroom
          return person.newsroom_id === user?.newsroom_id;
        });
        setPeople(filteredPeople);
      }
      
      if (newsroomsResponse.data.success) {
        // Filter newsrooms based on user role
        const filteredNewsrooms = newsroomsResponse.data.data.filter((newsroom: Newsroom) => {
          // PRODUCER can see all newsrooms
          if (user?.role === 'PRODUCER') {
            return true;
          }
          // CHIEF_CAMERA can see all newsrooms including KAMERMANI
          if (user?.role === 'CHIEF_CAMERA') {
            return true;
          }
          // DESK_EDITOR and other roles can only see their newsroom
          return newsroom.id === user?.newsroom_id;
        });
        setNewsrooms(filteredNewsrooms);
      }

      if (vehiclesResponse.data.success) {
        setVehicles(vehiclesResponse.data.data);
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
    try {
      if (activeTab === 'vehicles') {
        const submitData = {
          name: formData.name,
          type: formData.type,
          license_plate: formData.plate_number
        };

        if (editingItem) {
          await vehiclesApi.update(editingItem.id, submitData);
          toast.success('Vozilo je uspešno ažurirano');
        } else {
          await vehiclesApi.create(submitData);
          toast.success('Vozilo je uspešno kreirano');
        }
      } else {
        const submitData = {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          position: formData.position,
          newsroom_id: parseInt(formData.newsroom_id)
        };

        if (editingItem) {
          await peopleApi.update(editingItem.id, submitData);
          toast.success('Uposlenik je uspešno ažuriran');
        } else {
          await peopleApi.create(submitData);
          toast.success('Uposlenik je uspešno kreiran');
        }
      }

      setShowModal(false);
      setEditingItem(null);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja podataka');
    }
  };

  const handleEdit = (person: Person) => {
    setEditingItem(person);
    setFormData({
      name: person.name || '',
      position: person.position || '',
      phone: person.phone || '',
      email: person.email || '',
      newsroom_id: person.newsroom_id?.toString() || '',
      // Vehicle fields (empty for person editing)
      type: '',
      plate_number: '',
      is_available: true
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovog uposlenika?')) {
      try {
        await peopleApi.delete(id);
        toast.success('Uposlenik je uspešno obrisan');
        setPeople(prevPeople => prevPeople.filter(person => person.id !== id));
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja uposlenika');
      }
    }
  };

  // Vehicle handlers
  const handleEditVehicle = (vehicle: Vehicle) => {
    setEditingItem(vehicle as any);
    setFormData({
      name: vehicle.name || '',
      position: '', // Not used for vehicles
      phone: '', // Not used for vehicles
      email: '', // Not used for vehicles
      newsroom_id: '', // Not used for vehicles
      // Vehicle fields
      type: vehicle.type || '',
      plate_number: vehicle.plate_number || '',
      is_available: true
    });
    setShowModal(true);
  };

  const handleDeleteVehicle = async (id: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovo vozilo?')) {
      try {
        await vehiclesApi.delete(id);
        await loadData();
        toast.success('Vozilo je uspješno obrisano');
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja vozila');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      position: '',
      phone: '',
      email: '',
      newsroom_id: user?.role === 'PRODUCER' ? '' : (user?.role === 'CAMERMAN_EDITOR' ? '8' : (user?.newsroom_id?.toString() || '')),
      // Vehicle fields
      type: '',
      plate_number: '',
      is_available: true
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Mobile Optimized */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {activeTab === 'people' ? 'Uposlenici' : 'Vozila'}
          </h1>
          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1">
            {activeTab === 'people' 
              ? (user?.role === 'PRODUCER' 
                ? 'Upravljanje svim uposlenicima po redakcijama'
                : `Upravljanje uposlenicima - ${newsrooms.find(n => n.id === user?.newsroom_id)?.name || 'Nepoznata redakcija'}`)
              : 'Upravljanje vozilima za redakciju KAMERMANI'
            }
          </p>
        </div>
        {hasPermission('people.manage') && activeTab === 'people' && (
          <button
            onClick={() => {
              resetForm();
              setEditingItem(null);
              setShowModal(true);
            }}
            className="btn btn-primary flex items-center justify-center w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Novi uposlenik</span>
            <span className="sm:hidden">Novi</span>
          </button>
        )}
        {hasPermission('people.manage') && activeTab === 'vehicles' && (user?.role === 'ADMIN' || user?.role === 'PRODUCER' || user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && (
          <button
            onClick={() => {
              resetForm();
              setEditingItem(null);
              setShowModal(true);
            }}
            className="btn btn-primary flex items-center justify-center w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo vozilo</span>
            <span className="sm:hidden">Novo</span>
          </button>
        )}
      </div>

      {/* Tab Navigation - Mobile Optimized */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 md:space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('people')}
            className={`py-2 md:py-2 px-2 md:px-1 border-b-2 font-medium text-sm whitespace-nowrap min-h-[44px] md:min-h-0 flex items-center ${
              activeTab === 'people'
                ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <UserIcon className="w-4 h-4 inline mr-2" />
            Uposlenici
          </button>
          {/* Show vehicles tab only for specific roles */}
          {(user?.role === 'ADMIN' || user?.role === 'PRODUCER' || user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && (
            <button
              onClick={() => setActiveTab('vehicles')}
              className={`py-2 md:py-2 px-2 md:px-1 border-b-2 font-medium text-sm whitespace-nowrap min-h-[44px] md:min-h-0 flex items-center ${
                activeTab === 'vehicles'
                  ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Truck className="w-4 h-4 inline mr-2" />
              Vozila
            </button>
          )}
        </nav>
      </div>

      {/* Employees Table */}
      {user?.role === 'PRODUCER' ? (
        // Group by newsrooms for PRODUCER
        <div className="space-y-4 md:space-y-6">
          {newsrooms.map((newsroom) => {
            const newsroomPeople = people.filter(person => person.newsroom_id === newsroom.id);
            if (newsroomPeople.length === 0) return null;
            
            return (
              <div key={newsroom.id} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-700 px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-600">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <Building2 className="w-4 md:w-5 h-4 md:h-5 text-gray-400 dark:text-gray-500 mr-2 md:mr-3 flex-shrink-0" />
                      <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100">{newsroom.name}</h3>
                      <span className="inline-flex items-center px-2 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                        {newsroomPeople.length} uposlenik{newsroomPeople.length !== 1 ? 'a' : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                          Ime i prezime
                        </th>
                        <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]">
                          Funkcija
                        </th>
                        <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[140px]">
                          Telefon
                        </th>
                        <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[180px]">
                          Email
                        </th>
                        <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[80px]">
                          Akcije
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {newsroomPeople.map((person) => (
                        <tr key={person.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10">
                            <div className="flex items-center">
                              <UserIcon className="w-4 md:w-5 h-4 md:h-5 text-gray-400 dark:text-gray-500 mr-2 md:mr-3 flex-shrink-0" />
                              <span className="text-xs md:text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px] md:max-w-none">
                                {person.name || 'Nije definisano'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-words">
                              {person.position || person.role || 'Nije definisano'}
                            </span>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <div className="flex items-center">
                              <Phone className="w-3 md:w-4 h-3 md:h-4 text-gray-400 dark:text-gray-500 mr-1 md:mr-2 flex-shrink-0" />
                              <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-all">
                                {person.phone || 'Nije definisano'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <div className="flex items-center">
                              <Mail className="w-3 md:w-4 h-3 md:h-4 text-gray-400 dark:text-gray-500 mr-1 md:mr-2 flex-shrink-0" />
                              <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-all">
                                {person.email || 'Nije definisano'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium">
                            <div className="flex gap-2 md:space-x-2">
                              {hasPermission('people.manage') && user?.role !== 'CAMERMAN_EDITOR' && (
                                <button
                                  onClick={() => handleEdit(person)}
                                  className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                                  title="Uredi uposlenika"
                                >
                                  <Edit className="w-4 h-4 md:w-4 md:h-4" />
                                </button>
                              )}
                              {hasPermission('people.delete') && user?.role !== 'DESK_EDITOR' && (
                                <button
                                  onClick={() => handleDelete(person.id)}
                                  className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                                  title="Obriši uposlenika"
                                >
                                  <Trash2 className="w-4 h-4 md:w-4 md:h-4" />
                                </button>
                              )}
                            </div>
                          </td>
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
        // Regular table for other roles - Mobile Optimized
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                    Ime i prezime
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]">
                    Funkcija
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[140px]">
                    Telefon
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[180px]">
                    Email
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]">
                    Redakcija
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[80px]">
                    Akcije
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {people.map((person) => {
                  const newsroom = newsrooms.find(n => n.id === person.newsroom_id);
                  return (
                    <tr key={person.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10">
                        <div className="flex items-center">
                          <UserIcon className="w-4 md:w-5 h-4 md:h-5 text-gray-400 dark:text-gray-500 mr-2 md:mr-3 flex-shrink-0" />
                          <span className="text-xs md:text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px] md:max-w-none">
                            {person.name || 'Nije definisano'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-words">
                          {person.position || person.role || 'Nije definisano'}
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center">
                          <Phone className="w-3 md:w-4 h-3 md:h-4 text-gray-400 dark:text-gray-500 mr-1 md:mr-2 flex-shrink-0" />
                          <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-all">
                            {person.phone || 'Nije definisano'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center">
                          <Mail className="w-3 md:w-4 h-3 md:h-4 text-gray-400 dark:text-gray-500 mr-1 md:mr-2 flex-shrink-0" />
                          <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-all">
                            {person.email || 'Nije definisano'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center">
                          <Building2 className="w-3 md:w-4 h-3 md:h-4 text-gray-400 dark:text-gray-500 mr-1 md:mr-2 flex-shrink-0" />
                          <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-words">
                            {newsroom?.name || 'Nije definisano'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium">
                        <div className="flex gap-2 md:space-x-2">
                          {hasPermission('people.manage') && user?.role !== 'CAMERMAN_EDITOR' && (
                            <button
                              onClick={() => handleEdit(person)}
                              className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                              title="Uredi uposlenika"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {hasPermission('people.delete') && user?.role !== 'DESK_EDITOR' && (
                            <button
                              onClick={() => handleDelete(person.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                              title="Obriši uposlenika"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vehicles Tab Content - Only show for authorized roles - Mobile Optimized */}
      {activeTab === 'vehicles' && (user?.role === 'ADMIN' || user?.role === 'PRODUCER' || user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR') && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center flex-wrap gap-2">
                <Truck className="w-4 md:w-5 h-4 md:h-5 text-gray-400 dark:text-gray-500 mr-2 md:mr-3 flex-shrink-0" />
                <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100">Vozila</h3>
                <span className="inline-flex items-center px-2 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                  {vehicles.length} vozilo{vehicles.length !== 1 ? 'a' : ''}
                </span>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                    Naziv
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]">
                    Tip
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[150px]">
                    Registarski broj
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[100px]">
                    Status
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[80px]">
                    Akcije
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 md:px-6 py-8 md:py-12 text-center text-gray-500 dark:text-gray-400">
                      <Truck className="w-8 md:w-12 h-8 md:h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                      <p className="text-base md:text-lg font-medium">Nema vozila</p>
                      <p className="text-xs md:text-sm">Dodajte prvo vozilo za redakciju KAMERMANI</p>
                    </td>
                  </tr>
                ) : (
                  vehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10">
                        <div className="flex items-center">
                          <Truck className="w-3 md:w-4 h-3 md:h-4 text-gray-400 dark:text-gray-500 mr-2 md:mr-3 flex-shrink-0" />
                          <span className="text-xs md:text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px] md:max-w-none">
                            {vehicle.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <span className="text-xs md:text-sm text-gray-900 dark:text-gray-100 break-words">
                          {vehicle.type}
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <span className="text-xs md:text-sm font-mono text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {vehicle.plate_number}
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <span className="inline-flex items-center px-2 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                          Aktivno
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium">
                        <div className="flex gap-2 md:space-x-2">
                          {hasPermission('people.manage') && (
                            <button
                              onClick={() => handleEditVehicle(vehicle)}
                              className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                              title="Uredi vozilo"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {hasPermission('people.delete') && (
                            <button
                              onClick={() => handleDeleteVehicle(vehicle.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                              title="Obriši vozilo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal - Mobile Optimized */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-0 md:top-20 mx-auto p-4 md:p-5 border-0 md:border border-gray-200 dark:border-gray-700 w-full md:w-full md:max-w-md shadow-lg rounded-none md:rounded-lg bg-white dark:bg-gray-800 min-h-screen md:min-h-0">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0 pr-2">
                <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">
                  {activeTab === 'vehicles' 
                    ? (editingItem ? 'Uredi vozilo' : 'Novo vozilo')
                    : (editingItem ? 'Uredi uposlenika' : 'Novi uposlenik')
                  }
                </h2>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {activeTab === 'vehicles'
                    ? 'Dodajte novo vozilo sa detaljima'
                    : 'Dodajte novog uposlenika sa kontakt informacijama'
                  }
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
              <div>
                <label className="label">
                  {activeTab === 'vehicles' ? 'Naziv vozila' : 'Ime i prezime'}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="input"
                  required
                  placeholder={activeTab === 'vehicles' ? 'Unesite naziv vozila' : 'Unesite ime i prezime'}
                />
              </div>
              
              {activeTab === 'people' && (
                <div>
                  <label className="label">Funkcija</label>
                  <input
                    type="text"
                    value={formData.position}
                    onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                    className="input"
                    required
                    placeholder="Unesite funkciju (npr. Novinar, Kameraman, Urednik)"
                  />
                </div>
              )}

              {activeTab === 'vehicles' && (
                <div>
                  <label className="label">Tip vozila</label>
                  <input
                    type="text"
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    className="input"
                    required
                    placeholder="Unesite tip vozila (npr. Kombi, Auto, Kamion)"
                  />
                </div>
              )}
              
              {activeTab === 'people' && (
                <>
                  <div>
                    <label className="label">Telefon</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="input"
                      placeholder="Unesite broj telefona"
                    />
                  </div>
                  
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="input"
                      placeholder="Unesite email adresu"
                    />
                  </div>
                </>
              )}

              {activeTab === 'vehicles' && (
                <div>
                  <label className="label">Registarski broj</label>
                  <input
                    type="text"
                    value={formData.plate_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, plate_number: e.target.value }))}
                    className="input"
                    required
                    placeholder="Unesite registarski broj"
                  />
                </div>
              )}
              
              {activeTab === 'people' && (
                <div>
                  <label className="label">Redakcija</label>
                  {user?.role === 'PRODUCER' ? (
                    <select
                      value={formData.newsroom_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, newsroom_id: e.target.value }))}
                      className="input"
                      required
                    >
                      <option value="">Izaberite redakciju</option>
                      {newsrooms.map(newsroom => (
                        <option key={newsroom.id} value={newsroom.id}>
                          {newsroom.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newsrooms.find(n => n.id === user?.newsroom_id)?.name || 'Nije definisano'}
                      className="input bg-gray-100"
                      readOnly
                      disabled
                    />
                  )}
                  {user?.role !== 'PRODUCER' && (
                    <input
                      type="hidden"
                      value={formData.newsroom_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, newsroom_id: e.target.value }))}
                    />
                  )}
                </div>
              )}


              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary w-full sm:w-auto order-2 sm:order-1"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary w-full sm:w-auto order-1 sm:order-2"
                >
                  {editingItem ? 'Ažuriraj' : 'Kreiraj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Uposlenici;
