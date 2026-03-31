import React, { useState, useEffect } from 'react'
import { CreditCard, Smartphone, AlertCircle, DollarSign } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { walletApi } from '../api'
import toast from 'react-hot-toast'

export const Wallet = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [depositing, setDepositing] = useState(false)
  const [depositForm, setDepositForm] = useState({
    method: 'mpesa',
    amount: '',
    phoneNumber: '',
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [balanceRes, transactionsRes] = await Promise.all([
          walletApi.getBalance(),
          walletApi.getTransactions(),
        ])
        setBalance(balanceRes.data.balance || 0)
        setTransactions(transactionsRes.data.transactions || [])
      } catch (err) {
        toast.error('Failed to load wallet data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleDepositChange = (e) => {
    const { name, value } = e.target
    setDepositForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleDeposit = async (e) => {
    e.preventDefault()

    if (!depositForm.amount) {
      toast.error(t('common.required'))
      return
    }

    if (depositForm.method === 'mpesa' && !depositForm.phoneNumber) {
      toast.error(t('common.required'))
      return
    }

    try {
      setDepositing(true)
      await walletApi.deposit(
        depositForm.method,
        parseFloat(depositForm.amount),
        depositForm.phoneNumber
      )

      toast.success('Deposit initiated successfully!')
      setDepositForm({ method: 'mpesa', amount: '', phoneNumber: '' })

      // Refresh balance
      const balanceRes = await walletApi.getBalance()
      setBalance(balanceRes.data.balance || 0)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Deposit failed')
    } finally {
      setDepositing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('wallet.balance')}
          </h1>
          <p className="text-gray-600">Manage your wallet and deposits</p>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] rounded-xl p-8 mb-8 text-white shadow-lg">
          <p className="text-gray-300 mb-2">Current Balance</p>
          <h2 className="text-5xl md:text-6xl font-bold mb-4">
            KES {balance.toLocaleString()}
          </h2>
          <div className="flex gap-4 flex-wrap">
            <button className="bg-orange-500 hover:bg-orange-600 px-6 py-2 rounded-lg font-bold transition-colors">
              {t('wallet.deposit')}
            </button>
            <button className="border-2 border-orange-500 hover:bg-orange-500 px-6 py-2 rounded-lg font-bold transition-colors">
              Pay for Order
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Deposit Form */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">
                {t('wallet.deposit')}
              </h2>

              <form onSubmit={handleDeposit} className="space-y-4">
                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('wallet.method')}
                  </label>
                  <select
                    name="method"
                    value={depositForm.method}
                    onChange={handleDepositChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="card">Credit/Debit Card</option>
                    <option value="paypal">PayPal</option>
                  </select>
                </div>

                {/* Phone Number for M-Pesa */}
                {depositForm.method === 'mpesa' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('wallet.phone')}
                    </label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={depositForm.phoneNumber}
                      onChange={handleDepositChange}
                      placeholder="+254 712 345678"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('wallet.amount')}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="number"
                      name="amount"
                      value={depositForm.amount}
                      onChange={handleDepositChange}
                      placeholder="5000"
                      min="100"
                      step="100"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Info Alert */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
                  <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-blue-700">
                    Minimum deposit is KES 100. Funds will be available immediately.
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={depositing}
                  className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {depositing ? t('common.loading') : t('wallet.deposit')}
                </button>
              </form>
            </div>
          </div>

          {/* Transaction History */}
          <div className="lg:col-span-2">
            <div className="card">
              <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">
                {t('wallet.history')}
              </h2>

              {transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                          {t('wallet.type')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                          {t('wallet.date')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                          {t('wallet.status')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 text-sm text-gray-900">
                            <div>
                              <p className="font-medium">{tx.type}</p>
                              <p className="text-xs text-gray-600">{tx.method}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                            <span className={tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}>
                              {tx.type === 'deposit' ? '+' : '-'} KES {Math.abs(tx.amount).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                tx.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : tx.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <CreditCard className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-600">{t('wallet.noTransactions')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
