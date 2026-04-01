import React, { useState, useEffect } from 'react'
import { Users, Package, DollarSign, BarChart3, MessageSquare, Activity, Lock, RefreshCw } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi } from '../api'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedOrders, setSelectedOrders] = useState([])
  const [newStatus, setNewStatus] = useState('')

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [changingPassword, setChangingPassword] = useState(false)

  // Exchange rate state
  const [exchangeRates, setExchangeRates] = useState({
    USD_KES: '',
    GBP_KES: '',
    EUR_KES: '',
    CNY_KES: '',
  })
  const [savingRates, setSavingRates] = useState(false)
  const [ratesLastUpdated, setRatesLastUpdated] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      // Fetch stats and users in parallel — only call endpoints that actually exist
      const results = await Promise.allSettled([
        adminApi.getDashboardStats(),
        adminApi.listUsers(),
        adminApi.listOrders(),
        adminApi.getExchangeRates(),
      ])

      // Stats
      if (results[0].status === 'fulfilled') {
        setStats(results[0].value.data?.stats || null)
      }

      // Users
      if (results[1].status === 'fulfilled') {
        setUsers(results[1].value.data?.users || [])
      }

      // Orders
      if (results[2].status === 'fulfilled') {
        setOrders(results[2].value.data?.orders || [])
      }

      // Exchange rates
      if (results[3].status === 'fulfilled') {
        const ratesData = results[3].value.data
        if (ratesData?.rates) {
          setExchangeRates({
            USD_KES: ratesData.rates.USD_KES || '',
            GBP_KES: ratesData.rates.GBP_KES || '',
            EUR_KES: ratesData.rates.EUR_KES || '',
            CNY_KES: ratesData.rates.CNY_KES || '',
          })
          setRatesLastUpdated(ratesData.updated_at || null)
        }
      }
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  // ── Password change handler ───────────────────────────────────────────
  const handlePasswordChange = async (e) => {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = passwordForm

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields')
      return
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    try {
      setChangingPassword(true)
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // ── Exchange rate handlers ────────────────────────────────────────────
  const handleRateChange = (pair, value) => {
    setExchangeRates((prev) => ({ ...prev, [pair]: value }))
  }

  const handleSaveRates = async (e) => {
    e.preventDefault()
    const rates = {}
    for (const [pair, val] of Object.entries(exchangeRates)) {
      const num = parseFloat(val)
      if (!val || isNaN(num) || num <= 0) {
        toast.error(`Invalid rate for ${pair.replace('_', '/')}`)
        return
      }
      rates[pair] = num
    }

    try {
      setSavingRates(true)
      await adminApi.setExchangeRates(rates)
      toast.success('Exchange rates updated successfully')
      setRatesLastUpdated(new Date().toISOString())
    } catch (err) {
      toast.error(err.message || 'Failed to update exchange rates')
    } finally {
      setSavingRates(false)
    }
  }

  // ── Order bulk update ─────────────────────────────────────────────────
  const handleToggleOrderSelection = (orderId) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
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
      // Refresh orders
      const ordersRes = await adminApi.listOrders()
      setOrders(ordersRes.data?.orders || [])
    } catch (err) {
      toast.error('Failed to update orders')
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

  const userStats = stats?.users || {}
  const orderStats = stats?.orders || {}
  const marketStats = stats?.markets || []
  const revenueStats = stats?.revenue || {}

  const marketChartData = marketStats.map((m) => ({
    name: m.market,
    value: m.count,
  }))

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('admin.title')}
          </h1>
          <p className="text-gray-600">Platform analytics and management</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {['overview', 'users', 'orders', 'revenue', 'tickets', 'exchange', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab === 'exchange' ? 'Exchange Rates' : tab === 'settings' ? 'Settings' : t(`admin.${tab}`)}
            </button>
          ))}
        </div>

        {/* ═══════════════════ Overview Tab ═══════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.totalUsers')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{userStats.total || 0}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {userStats.customers || 0} customers, {userStats.admins || 0} admins
                    </p>
                  </div>
                  <Users className="text-blue-500" size={32} />
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.activeOrders')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{orderStats.total_orders || 0}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {orderStats.pending || 0} pending, {orderStats.in_transit || 0} in transit
                    </p>
                  </div>
                  <Package className="text-orange-500" size={32} />
                </div>
              </div>

              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">Delivered Orders</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{orderStats.delivered || 0}</h3>
                  </div>
                  <Activity className="text-green-500" size={32} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <p className="text-gray-600 text-sm mb-1">Total Revenue (Completed)</p>
                <h3 className="text-3xl font-bold text-green-600">
                  KES {(revenueStats.total_revenue || 0).toLocaleString()}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {revenueStats.total_transactions || 0} transactions
                </p>
              </div>

              <div className="card">
                <p className="text-gray-600 text-sm mb-1">Estimated Order Value</p>
                <h3 className="text-3xl font-bold text-blue-600">
                  KES {(orderStats.total_estimated_value || 0).toLocaleString()}
                </h3>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Orders by Status */}
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">Orders by Status</h2>
                {stats?.order_statuses?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={stats.order_statuses.map((s) => ({
                          name: s.status,
                          value: s.count,
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {stats.order_statuses.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-500 py-8">No order data available</p>
                )}
              </div>

              {/* Orders by Market */}
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">
                  {t('admin.ordersByMarket')}
                </h2>
                {marketChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={marketChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {marketChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-500 py-8">No market data available</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ Users Tab ═══════════════════ */}
        {activeTab === 'users' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">
                {t('admin.userManagement')}
              </h2>
              <span className="text-sm text-gray-500">{users.length} user(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Phone</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Warehouse ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Balance</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">{u.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{u.phone}</td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-600">{u.warehouse_id}</td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              u.role === 'admin'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              u.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          KES {(u.wallet_balance || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════ Orders Tab ═══════════════════ */}
        {activeTab === 'orders' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
              {t('admin.orderManagement')}
            </h2>

            {/* Bulk Update */}
            {selectedOrders.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-blue-900 font-bold">
                    {selectedOrders.length} order(s) selected
                  </span>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('admin.selectStatus')}</option>
                    <option value="pending">Pending</option>
                    <option value="received_at_warehouse">Received at Warehouse</option>
                    <option value="consolidating">Consolidating</option>
                    <option value="in_transit">In Transit</option>
                    <option value="customs">Customs</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                  </select>
                  <button
                    onClick={handleBulkUpdateOrders}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold"
                  >
                    {t('admin.updateSelected')}
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrders(orders.map((o) => o.id))
                          } else {
                            setSelectedOrders([])
                          }
                        }}
                        className="w-4 h-4"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tracking #</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Customer</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Retailer</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Market</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Est. Cost</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedOrders.includes(order.id)}
                            onChange={() => handleToggleOrderSelection(order.id)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">
                          {order.tracking_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {order.name || order.email || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {order.retailer || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              order.status === 'delivered'
                                ? 'bg-green-100 text-green-800'
                                : order.status === 'in_transit'
                                  ? 'bg-blue-100 text-blue-800'
                                  : order.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {order.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{order.market}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          KES {(order.estimated_cost || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════ Revenue Tab ═══════════════════ */}
        {activeTab === 'revenue' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">
              {t('admin.revenueReport')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Deposits</p>
                  <p className="text-2xl font-bold text-green-700">
                    KES {(revenueStats.deposits || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Payments</p>
                  <p className="text-2xl font-bold text-blue-700">
                    KES {(revenueStats.payments || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-orange-700">
                    KES {(revenueStats.total_revenue || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await adminApi.exportRevenue()
                    const url = window.URL.createObjectURL(new Blob([res.data]))
                    const link = document.createElement('a')
                    link.href = url
                    link.setAttribute('download', 'revenue-export.csv')
                    document.body.appendChild(link)
                    link.click()
                    link.remove()
                    toast.success('Revenue exported')
                  } catch {
                    toast.error('Failed to export revenue')
                  }
                }}
                className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold"
              >
                {t('admin.export')}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════ Tickets Tab ═══════════════════ */}
        {activeTab === 'tickets' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">
              {t('admin.tickets')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ticket ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Priority</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                        No tickets found
                      </td>
                    </tr>
                  ) : (
                    tickets.map((ticket) => (
                      <tr key={ticket.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">
                          {ticket.id?.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{ticket.subject}</td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              ticket.priority === 'high'
                                ? 'bg-red-100 text-red-800'
                                : ticket.priority === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              ticket.status === 'closed'
                                ? 'bg-green-100 text-green-800'
                                : ticket.status === 'in_progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {ticket.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════ Exchange Rates Tab ═══════════════════ */}
        {activeTab === 'exchange' && (
          <div className="card max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <RefreshCw className="text-[#1e3a5f]" size={28} />
              <div>
                <h2 className="text-2xl font-bold text-[#1e3a5f]">Exchange Rate Management</h2>
                <p className="text-sm text-gray-500">
                  Set today's exchange rates. These rates are used across the platform for pricing and conversions.
                </p>
              </div>
            </div>

            {ratesLastUpdated && (
              <p className="text-sm text-gray-500 mb-4">
                Last updated: {new Date(ratesLastUpdated).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
              </p>
            )}

            <form onSubmit={handleSaveRates} className="space-y-4">
              {[
                { pair: 'USD_KES', label: 'USD to KES', flag: '$' },
                { pair: 'GBP_KES', label: 'GBP to KES', flag: '£' },
                { pair: 'EUR_KES', label: 'EUR to KES', flag: '€' },
                { pair: 'CNY_KES', label: 'CNY to KES', flag: '¥' },
              ].map(({ pair, label, flag }) => (
                <div key={pair}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-500 w-6">{flag}</span>
                    <span className="text-gray-500">1 =</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={exchangeRates[pair]}
                      onChange={(e) => handleRateChange(pair, e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                    />
                    <span className="text-sm font-medium text-gray-500">KES</span>
                  </div>
                </div>
              ))}

              <button
                type="submit"
                disabled={savingRates}
                className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors"
              >
                {savingRates ? 'Saving...' : 'Save Exchange Rates'}
              </button>
            </form>
          </div>
        )}

        {/* ═══════════════════ Settings Tab (Password) ═══════════════════ */}
        {activeTab === 'settings' && (
          <div className="card max-w-lg">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="text-[#1e3a5f]" size={28} />
              <div>
                <h2 className="text-2xl font-bold text-[#1e3a5f]">Change Admin Password</h2>
                <p className="text-sm text-gray-500">
                  Logged in as {user?.email}
                </p>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Enter new password (min 6 characters)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Re-enter new password"
                />
              </div>
              <button
                type="submit"
                disabled={changingPassword}
                className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors"
              >
                {changingPassword ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
