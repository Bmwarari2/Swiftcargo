import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Package, Wallet, TrendingUp, Plus, Eye, DollarSign, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi, walletApi } from '../api'
import toast from 'react-hot-toast'

export const Dashboard = () => {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState({
    activeOrders: 0,
    walletBalance: 0,
    referralEarnings: 0,
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, walletRes] = await Promise.all([
          ordersApi.list({ status: ['pending', 'processing', 'in-transit'] }),
          walletApi.getBalance(),
        ])

        setOrders(ordersRes.data.orders || [])
        setStats({
          activeOrders: ordersRes.data.orders?.length || 0,
          walletBalance: walletRes.data.balance || 0,
          referralEarnings: user?.referralEarnings || 0,
        })
      } catch (err) {
        toast.error('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  const getStatusColor = (status) => {
    const colors = {
      pending: 'status-pending',
      processing: 'status-processing',
      'in-transit': 'status-in-transit',
      delivered: 'status-delivered',
      failed: 'status-failed',
      cancelled: 'status-cancelled',
    }
    return colors[status] || 'status-pending'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('dashboard.welcome')}, {user?.name}!
          </h1>
          <p className="text-gray-600">
            Here's your shipping overview for today
          </p>
        </div>

        {/* Warehouse Address Card */}
        <div className="card mb-8 bg-gradient-to-r from-[#1e3a5f] to-[#152d4a] text-white">
          <h3 className="text-lg font-bold mb-4">{t('dashboard.warehouseAddress')}</h3>
          <div className="bg-[#0f1e33] rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-300 mb-1">United Kingdom</p>
            <p className="font-mono text-base">31 Collingwood Close</p>
            <p className="font-mono text-base">Hazel Grove, Stockport, SK7 4LB, UK</p>
            <p className="font-mono text-base mt-2">
              Attn: <span className="text-orange-400">SC-{user?.code}</span>
            </p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg font-medium transition-colors">
            {t('warehouse.copy')}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Active Orders */}
          <div className="card hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('dashboard.activeOrders')}</p>
                <h3 className="text-3xl font-bold text-[#1e3a5f]">{stats.activeOrders}</h3>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Package className="text-blue-600" size={24} />
              </div>
            </div>
          </div>

          {/* Wallet Balance */}
          <div className="card hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('dashboard.walletBalance')}</p>
                <h3 className="text-3xl font-bold text-[#1e3a5f]">
                  KES {stats.walletBalance.toLocaleString()}
                </h3>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <Wallet className="text-green-600" size={24} />
              </div>
            </div>
          </div>

          {/* Referral Earnings */}
          <div className="card hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{t('dashboard.referralEarnings')}</p>
                <h3 className="text-3xl font-bold text-[#1e3a5f]">
                  KES {stats.referralEarnings.toLocaleString()}
                </h3>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <TrendingUp className="text-orange-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Link
            to="/orders/new"
            className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={20} />
            {t('dashboard.newOrder')}
          </Link>
          <Link
            to="/wallet"
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={20} />
            {t('dashboard.topupWallet')}
          </Link>
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1e3a5f]">{t('dashboard.recentOrders')}</h2>
            <Link to="/orders" className="text-orange-500 hover:text-orange-600 font-medium">
              View All
            </Link>
          </div>

          {orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.orderNumber')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.market')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.date')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.amount')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm text-gray-900">
                        #{order.id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{order.market}</td>
                      <td className="px-6 py-4">
                        <span className={`status-badge ${getStatusColor(order.status)}`}>
                          {t(`orders.${order.status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        KES {order.totalCost?.toLocaleString() || 0}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/orders/${order.id}`}
                          className="text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
                        >
                          <Eye size={16} />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600 mb-4">{t('orders.noOrders')}</p>
              <Link
                to="/orders/new"
                className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-bold transition-colors"
              >
                {t('orders.new')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
