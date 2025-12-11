import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { permissionsApi, rolesApi } from '../services/api';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Users,
  Key
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Permission {
  id: number;
  name: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

const Permissions: React.FC = () => {
  const { hasPermission } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'permissions' | 'roles'>('permissions');
  
  // Permission modal states
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [permissionForm, setPermissionForm] = useState({
    name: '',
    description: '',
    category: 'General'
  });
  
  // Role modal states
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: [] as number[]
  });

  const categories = ['Admin', 'Tasks', 'Schedule', 'Camera', 'Wallboard', 'Users', 'General'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [permissionsResponse, rolesResponse] = await Promise.all([
        permissionsApi.getAll(),
        rolesApi.getAll()
      ]);

      if (permissionsResponse.data.success) {
        setPermissions(permissionsResponse.data.data);
      }
      
      if (rolesResponse.data.success) {
        const rolesData = rolesResponse.data.data;
        
        // Load permissions for each role
        const rolesWithPermissions = await Promise.all(
          rolesData.map(async (role: any) => {
            try {
              const permissionsResponse = await rolesApi.getPermissions(role.name);
              return {
                ...role,
                permissions: permissionsResponse.data.success ? permissionsResponse.data.data : []
              };
            } catch (error) {
              console.error(`Error loading permissions for role ${role.name}:`, error);
              return {
                ...role,
                permissions: []
              };
            }
          })
        );
        
        setRoles(rolesWithPermissions);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Greška prilikom učitavanja podataka');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPermission) {
        await permissionsApi.update(editingPermission.id, permissionForm);
        toast.success('Dozvola je uspešno ažurirana');
      } else {
        await permissionsApi.create(permissionForm);
        toast.success('Dozvola je uspešno kreirana');
      }
      
      setShowPermissionModal(false);
      setEditingPermission(null);
      resetPermissionForm();
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja dozvole');
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, roleForm);
        toast.success('Uloga je uspešno ažurirana');
      } else {
        await rolesApi.create(roleForm);
        toast.success('Uloga je uspešno kreirana');
      }
      
      setShowRoleModal(false);
      setEditingRole(null);
      resetRoleForm();
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Greška prilikom čuvanja uloge');
    }
  };

  const handleEditPermission = (permission: Permission) => {
    setEditingPermission(permission);
    setPermissionForm({
      name: permission.name,
      description: permission.description,
      category: permission.category
    });
    setShowPermissionModal(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description,
      permissions: permissions.filter(p => (role.permissions || []).includes(p.name)).map(p => p.id)
    });
    setShowRoleModal(true);
  };

  const handleDeleteRole = async (roleId: number) => {
    if (window.confirm('Da li ste sigurni da želite da obrišete ovu ulogu?')) {
      try {
        await rolesApi.delete(roleId);
        toast.success('Uloga je uspešno obrisana');
        loadData();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Greška prilikom brisanja uloge');
      }
    }
  };

  const resetPermissionForm = () => {
    setPermissionForm({
      name: '',
      description: '',
      category: 'General'
    });
  };

  const resetRoleForm = () => {
    setRoleForm({
      name: '',
      description: '',
      permissions: []
    });
  };

  const togglePermission = (permissionId: number) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(id => id !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const getPermissionsByCategory = (category: string) => {
    return permissions.filter(p => p.category === category);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upravljanje dozvolama</h1>
          <p className="text-sm text-gray-600">
            Upravljanje dozvolama i ulogama sistema
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('permissions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'permissions'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            Dozvole
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'roles'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Uloge
          </button>
        </nav>
      </div>

      {/* Permissions Tab */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Dozvole</h2>
            {hasPermission('admin.access') && (
              <button
                onClick={() => {
                  setEditingPermission(null);
                  resetPermissionForm();
                  setShowPermissionModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nova dozvola
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Naziv
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opis
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kategorija
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Akcije
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {permissions.map((permission) => (
                    <tr key={permission.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Key className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {permission.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {permission.description}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {permission.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {hasPermission('admin.access') && (
                          <button
                            onClick={() => handleEditPermission(permission)}
                            className="text-primary-600 hover:text-primary-900"
                            title="Uredi dozvolu"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Uloge</h2>
            {hasPermission('admin.access') && (
              <button
                onClick={() => {
                  setEditingRole(null);
                  resetRoleForm();
                  setShowRoleModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nova uloga
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Naziv
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opis
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dozvole
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Akcije
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {role.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {role.description}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(role.permissions || []).slice(0, 3).map((permission) => (
                            <span
                              key={permission}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                            >
                              {permission}
                            </span>
                          ))}
                          {(role.permissions || []).length > 3 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              +{(role.permissions || []).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {hasPermission('admin.access') && (
                            <>
                              <button
                                onClick={() => handleEditRole(role)}
                                className="text-primary-600 hover:text-primary-900"
                                title="Uredi ulogu"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRole(role.id)}
                                className="text-red-600 hover:text-red-900"
                                title="Obriši ulogu"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-lg bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingPermission ? 'Uredi dozvolu' : 'Nova dozvola'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {editingPermission ? 'Ažuriraj informacije o dozvoli' : 'Dodajte novu dozvolu u sistem'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPermissionModal(false);
                  setEditingPermission(null);
                  resetPermissionForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handlePermissionSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Naziv dozvole
                </label>
                <input
                  type="text"
                  value={permissionForm.name}
                  onChange={(e) => setPermissionForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="npr. task.create"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opis
                </label>
                <textarea
                  value={permissionForm.description}
                  onChange={(e) => setPermissionForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Opis dozvole..."
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategorija
                </label>
                <select
                  value={permissionForm.category}
                  onChange={(e) => setPermissionForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPermissionModal(false);
                    setEditingPermission(null);
                    resetPermissionForm();
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingPermission ? 'Ažuriraj' : 'Kreiraj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-lg bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingRole ? 'Uredi ulogu' : 'Nova uloga'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {editingRole ? 'Ažuriraj informacije o ulozi' : 'Dodajte novu ulogu u sistem'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setEditingRole(null);
                  resetRoleForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleRoleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Naziv uloge
                  </label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="npr. MANAGER"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Opis
                  </label>
                  <input
                    type="text"
                    value={roleForm.description}
                    onChange={(e) => setRoleForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Opis uloge..."
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Dozvole
                </label>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md p-3">
                  {categories.map(category => {
                    const categoryPermissions = getPermissionsByCategory(category);
                    if (categoryPermissions.length === 0) return null;
                    
                    return (
                      <div key={category} className="mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">{category}</h4>
                        <div className="space-y-2">
                          {categoryPermissions.map(permission => (
                            <label key={permission.id} className="flex items-start">
                              <input
                                type="checkbox"
                                checked={roleForm.permissions.includes(permission.id)}
                                onChange={() => togglePermission(permission.id)}
                                className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                              />
                              <div className="ml-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {permission.name}
                                </span>
                                <p className="text-xs text-gray-500">
                                  {permission.description}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoleModal(false);
                    setEditingRole(null);
                    resetRoleForm();
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingRole ? 'Ažuriraj' : 'Kreiraj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Permissions;
