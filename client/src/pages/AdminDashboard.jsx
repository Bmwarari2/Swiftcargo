import React, { useState, useEffect } from 'react'
import { Users, Package, DollarSign, BarChart3, MessageSquare, Activity } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { adminApi } from '../api'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
          {['overview', 'users', 'orders', 'revenue', 'tickets'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t(`admin.${tab}`)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Cards */}
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

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Orders Chart */}
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">
                  {t('admin.ordersChart')}
                </h2>
                {chartData.orders.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData.orders}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        stroke="#1e3a5f"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-500 py-8">No data available</p>
                )}
              </div>

              {/* Orders by Market */}
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">
                  {t('admin.ordersByMarket')}
                </h2>
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

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">
              {t('admin.userManagement')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {user.phone}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
              {t('admin.orderManagement')}
            </h2>

            {/* Bulk Update */}
            {selectedOrders.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-4">
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
                    <option value="processing">Processing</option>
                    <option value="in-transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Market
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
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
                        {order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {order.userId}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            order.status === 'delivered'
                              ? 'bg-green-100 text-green-800'
                              : order.status === 'in-transit'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {order.market}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        KES {order.totalCost?.toLocaleString() || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">
              {t('admin.revenueReport')}
            </h2>
            <div className="space-y-4">
              <p className="text-gray-600">Revenue by market and time period</p>
              <button className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold">
                {t('admin.export')}
              </button>
            </div>
          </div>
        )}

        {/* Tickets Tab */}
        {activeTab === 'tickets' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">
              {t('admin.tickets')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Ticket ID
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">
                        {ticket.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {ticket.subject}
                      </td>
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
                              : ticket.status === 'in-progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
