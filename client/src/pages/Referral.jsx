import React, { useState, useEffect } from 'react'
import { Copy, MessageCircle, Mail, Share2, TrendingUp } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { referralApi } from '../api'
import toast from 'react-hot-toast'

export const Referral = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [stats, setStats] = useState({
    totalReferrals: 0,
    completedReferrals: 0,
    totalEarned: 0,
  })
  const [history, setHistory] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [codeRes, statsRes, historyRes] = await Promise.all([
          referralApi.getCode(),
          referralApi.getStats(),
          referralApi.getHistory(),
        ])

        setCode(codeRes.data.code)
        setStats(statsRes.data)
        setHistory(historyRes.data.referrals || [])
      } catch (err) {
        toast.error('Failed to load referral data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code)
    toast.success(t('warehouse.copied'))
  }

  const handleShareWhatsApp = () => {
    const message = `Join SwiftCargo and get KES 50 credit! Use my referral code: ${code}\n\nShip from UK, USA & China to Kenya with SwiftCargo\nhttps://swiftcargo.com/register?ref=${code}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleShareEmail = () => {
    const subject = 'Join SwiftCargo Shipping'
    const body = `I'm using SwiftCargo for shipping and I love it! Use my referral code ${code} and get KES 50 credit.\n\nSwiftCargo: https://swiftcargo.com/register?ref=${code}`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/register?ref=${code}`
    navigator.clipboard.writeText(link)
    toast.success('Link copied to clipboard')
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('referral.title')}
          </h1>
          <p className="text-gray-600">
            {t('referral.promotion')}
          </p>
        </div>

        {/* Referral Code Card */}
        <div className="card bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 mb-8">
          <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
            {t('referral.code')}
          </h2>

          <div className="bg-white rounded-lg p-6 mb-6">
            <p className="text-sm text-gray-600 mb-2">Your unique code</p>
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={code}
                readOnly
                className="flex-1 px-4 py-3 border-2 border-orange-300 rounded-lg text-2xl font-bold text-center text-[#1e3a5f]"
              />
              <button
                onClick={handleCopyCode}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors"
              >
                <Copy size={20} />
                Copy
              </button>
            </div>
          </div>

          {/* Share Buttons */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">
              {t('referral.share')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <button
                onClick={handleShareWhatsApp}
                className="bg-white hover:bg-gray-50 text-gray-900 border-2 border-green-500 px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle size={20} className="text-green-500" />
                WhatsApp
              </button>
              <button
                onClick={handleShareEmail}
                className="bg-white hover:bg-gray-50 text-gray-900 border-2 border-blue-500 px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Mail size={20} className="text-blue-500" />
                Email
              </button>
              <button
                onClick={handleCopyLink}
                className="bg-white hover:bg-gray-50 text-gray-900 border-2 border-purple-500 px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 size={20} className="text-purple-500" />
                Copy Link
              </button>
              <button
                onClick={() => {
                  const link = `${window.location.origin}/register?ref=${code}`
                  navigator.share({
                    title: 'SwiftCargo',
                    text: `Join SwiftCargo using my referral code: ${code}`,
                    url: link,
                  }).catch(() => {})
                }}
                className="bg-white hover:bg-gray-50 text-gray-900 border-2 border-orange-500 px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 size={20} className="text-orange-500" />
                Share
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Referrals */}
          <div className="card hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">
                  {t('referral.totalReferrals')}
                </p>
                <h3 className="text-4xl font-bold text-[#1e3a5f]">
                  {stats.totalReferrals}
                </h3>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Share2 className="text-blue-600" size={24} />
              </div>
            </div>
          </div>

          {/* Completed Referrals */}
          <div className="card hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">
                  {t('referral.completed')}
                </p>
                <h3 className="text-4xl font-bold text-green-600">
                  {stats.completedReferrals}
                </h3>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="text-green-600" size={24} />
              </div>
            </div>
          </div>

          {/* Total Earned */}
          <div className="card hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">
                  {t('referral.earned')}
                </p>
                <h3 className="text-4xl font-bold text-orange-600">
                  KES {stats.totalEarned.toLocaleString()}
                </h3>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <TrendingUp className="text-orange-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Referral History */}
        {history.length > 0 && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
              {t('referral.history')}
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('referral.name')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('referral.dateReferred')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('referral.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('referral.earnings')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {history.map((ref) => (
                    <tr key={ref.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {ref.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(ref.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            ref.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {ref.status === 'completed'
                            ? t('referral.completed')
                            : t('referral.pending')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-green-600">
                        KES {ref.earnings.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="card mt-8 bg-green-50 border border-green-200">
          <h3 className="font-bold text-green-900 mb-3">How It Works</h3>
          <ul className="space-y-2 text-green-700">
            <li className="flex gap-3">
              <span className="font-bold">1.</span>
              <span>Share your referral code with friends and family</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">2.</span>
              <span>They sign up using your code</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">3.</span>
              <span>They make their first shipment (minimum KES 500)</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">4.</span>
              <span>You both get KES 50 credited to your wallet!</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
