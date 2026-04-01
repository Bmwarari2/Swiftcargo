import React, { useState, useEffect } from 'react'
import {
  Users,
  Package,
  Activity,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { adminApi, authApi } from '../api'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeOrders: 0,
    revenueToday: 0,
    revenueWeek: 0,
    revenueMonth: 0,
    pendingPackages: 0,
  })
  const [chartData, setChartData] = useState({
    orders: [],
    revenue: [],
    markets: [],
  })
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedOrders, setSelectedOrders] = useState([])
  const [newStatus, setNewStatus] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  })
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, ordersRes, revenueRes, marketsRes, usersRes, ticketsRes] = await Promise.all([
          adminApi.getDashboardStats(),
          adminApi.getOrdersChart(),
          adminApi.getRevenueChart(),
          adminApi.getOrdersByMarket(),
          adminApi.listUsers(),
          adminApi.listTickets(),
        ])

        setStats(statsRes.data)
        setChartData({
          orders: ordersRes.data.data || [],
          revenue: revenueRes.data.data || [],
          markets: marketsRes.data.data || [],
        })
        setUsers(usersRes.data.users || [])
        setOrders(ordersRes.data.orders || [])
        setTickets(ticketsRes.data.tickets || [])
      } catch (err) {
        toast.error('Failed to load admin data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleToggleOrderSelection = (orderId) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    )
  }

  const handleBulkUpdateOrders = async () => {
    if (!newStatus || selectedOrders.length === 0) {
      toast.error('Please select orders and a new status')
      return
    }

    try {
      await adminApi.bulkUpdateOrders(selectedOrders, newStatus)
      toast.success('Orders updated successfully')
      setSelectedOrders([])
      setNewStatus('')
    } catch (err) {
      toast.error('Failed to update orders')
    }
  }

  const handlePasswordInputChange = (e) => {
    const { name, value } = e.target
    setPasswordForm((prev) => ({ ...prev, [name]: value }))
  }

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const validatePasswordForm = () => {
    const { current_password, new_password, confirm_password } = passwordForm

    if (!current_password || !new_password || !confirm_password) {
      toast.error('Please fill in all password fields')
      return false
    }

    if (new_password.length < 8) {
      toast.error('New password must be at least 8 characters long')
      return false
    }

    if (!/[A-Z]/.test(new_password)) {
      toast.error('New password must include at least one uppercase letter')
      return false
    }

    if (!/[a-z]/.test(new_password)) {
      toast.error('New password must include at least one lowercase letter')
      return false
    }

    if (!/[0-9]/.test(new_password)) {
      toast.error('New password must include at least one number')
      return false
    }

    if (new_password !== confirm_password) {
      toast.error('New password and confirmation do not match')
      return false
    }

    if (current_password === new_password) {
      toast.error('New password must be different from the current password')
      return false
    }

    return true
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()

    if (!validatePasswordForm()) return

    try {
      setPasswordLoading(true)
      await authApi.changePassword(
        passwordForm.current_password,
        passwordForm.new_password
      )

      toast.success('Password changed successfully')
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (err) {
      toast.error(err.message || 'Failed to change password')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  const tabs = ['overview', 'users', 'orders', 'revenue', 'tickets', 'security']

  const PasswordField = ({ label, name, visibleKey, placeholder }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
        <input
          type={showPasswords[visibleKey] ? 'text' : 'password'}
          name={name}
          value={passwordForm[name]}
          onChange={handlePasswordInputChange}
          placeholder={placeholder}
          className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => togglePasswordVisibility(visibleKey)}
          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          aria-label={showPasswords[visibleKey] ? 'Hide password' : 'Show password'}
        >
          {showPasswords[visibleKey] ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('admin.title')}
          </h1>
          <p className="text-gray-600">Platform analytics, management, and account security</p>
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab === 'security' ? 'Security' : t(`admin.${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.totalUsers')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{stats.totalUsers}</h3>
                  </div>
                  <Users className="text-blue-500" size={32} />
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.activeOrders')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{stats.activeOrders}</h3>
                  </div>
                  <Package className="text-orange-500" size={32} />
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.pendingPackages')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{stats.pendingPackages}</h3>
                  </div>
                  <Activity className="text-green-500" size={32} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card">
                <p className="text-gray-600 text-sm mb-1">{t('admin.revenueToday')}</p>
                <h3 className="text-3xl font-bold text-green-600">
                  KES {stats.revenueToday?.toLocaleString() || 0}
                </h3>
              </div>

              <div className="card">
                <p className="text-gray-600 text-sm mb-1">{t('admin.revenueWeek')}</p>
                <h3 className="text-3xl font-bold text-blue-600">
                  KES {stats.revenueWeek?.toLocaleString() || 0}
                </h3>
              </div>

              <div className="card">
                <p className="text-gray-600 text-sm mb-1">{t('admin.revenueMonth')}</p>
                <h3 className="text-3xl font-bold text-orange-600">
                  KES {stats.revenueMonth?.toLocaleString() || 0}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">{t('admin.ordersChart')}</h2>
                {chartData.orders.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData.orders}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="orders" stroke="#1e3a5f" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-500 py-8">No data available</p>
                )}
              </div>

              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">{t('admin.ordersByMarket')}</h2>
                {chartData.markets.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData.markets}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {chartData.markets.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-500 py-8">No data available</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">{t('admin.userManagement')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Warehouse ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4">{user.name}</td>
                      <td className="px-6 py-4">{user.email}</td>
                      <td className="px-6 py-4 capitalize">{user.role}</td>
                      <td className="px-6 py-4">{user.warehouse_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="card space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">Order Management</h2>
              <div className="flex gap-3">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select status</option>
                  <option value="pending">Pending</option>
                  <option value="received_at_warehouse">Received at warehouse</option>
                  <option value="consolidating">Consolidating</option>
                  <option value="in_transit">In transit</option>
                  <option value="customs">Customs</option>
                  <option value="out_for_delivery">Out for delivery</option>
                  <option value="delivered">Delivered</option>
                </select>
                <button
                  onClick={handleBulkUpdateOrders}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold"
                >
                  Update selected
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left"></th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tracking</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Retailer</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Market</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => handleToggleOrderSelection(order.id)}
                        />
                      </td>
                      <td className="px-4 py-4">{order.tracking_number}</td>
                      <td className="px-4 py-4">{order.retailer}</td>
                      <td className="px-4 py-4">{order.market}</td>
                      <td className="px-4 py-4 capitalize">{order.status?.replaceAll('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">Revenue Trends</h2>
            {chartData.revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData.revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-500 py-8">No revenue data available</p>
            )}
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">Support Tickets</h2>
            <div className="space-y-4">
              {tickets.length > 0 ? (
                tickets.map((ticket) => (
                  <div key={ticket.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-[#1e3a5f]">{ticket.subject || 'Untitled ticket'}</h3>
                        <p className="text-sm text-gray-600 mt-1">{ticket.message || 'No preview available'}</p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                        {ticket.status || 'open'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">No tickets available</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 rounded-xl bg-[#1e3a5f] text-white">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[#1e3a5f]">Change password</h2>
                  <p className="text-gray-600 mt-1">
                    Update your admin password securely. You must enter your current password before choosing a new one.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-5">
                <PasswordField
                  label="Current password"
                  name="current_password"
                  visibleKey="current"
                  placeholder="Enter your current password"
                />
                <PasswordField
                  label="New password"
                  name="new_password"
                  visibleKey="next"
                  placeholder="Create a strong new password"
                />
                <PasswordField
                  label="Confirm new password"
                  name="confirm_password"
                  visibleKey="confirm"
                  placeholder="Re-enter your new password"
                />

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full md:w-auto bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {passwordLoading ? 'Updating password...' : 'Save new password'}
                </button>
              </form>
            </div>

            <div className="card bg-[#1e3a5f] text-white">
              <h3 className="text-xl font-bold mb-4">Password rules</h3>
              <ul className="space-y-3 text-sm text-blue-50">
                <li>- At least 8 characters</li>
                <li>- Include one uppercase letter</li>
                <li>- Include one lowercase letter</li>
                <li>- Include one number</li>
                <li>- Must be different from the current password</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
