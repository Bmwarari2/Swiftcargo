import React, { useState, useEffect } from 'react'
import { Calculator, Info } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { pricingApi } from '../api'
import toast from 'react-hot-toast'

export const PricingCalculator = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [rates, setRates] = useState({})
  const [formData, setFormData] = useState({
    market: 'UK',
    weight: '1',
    length: '10',
    width: '10',
    height: '10',
    shippingSpeed: 'economy',
    insurance: false,
    declaredValue: '0',
  })
  const [result, setResult] = useState(null)

  const markets = ['UK', 'USA', 'China']
  const shippingSpeeds = [
    { value: 'economy', label: t('pricing.economy'), surcharge: 0 },
    { value: 'express', label: t('pricing.express'), surcharge: 0.3 },
  ]

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await pricingApi.getExchangeRates()
        setRates(response.data)
      } catch (err) {
        toast.error('Failed to load exchange rates')
      }
    }
    fetchRates()
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleCalculate = async (e) => {
    e.preventDefault()

    // Validation
    if (!formData.weight || parseFloat(formData.weight) <= 0) {
      toast.error('Please enter a valid weight')
      return
    }

    try {
      setLoading(true)
      const response = await pricingApi.calculate(
        formData.market,
        parseFloat(formData.weight),
        {
          length: parseFloat(formData.length),
          width: parseFloat(formData.width),
          height: parseFloat(formData.height),
        },
        formData.shippingSpeed,
        formData.insurance
          ? { enabled: true, declaredValue: parseFloat(formData.declaredValue) }
          : { enabled: false }
      )

      setResult(response.data)
    } catch (err) {
      toast.error('Failed to calculate pricing')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('pricing.title')}
          </h1>
          <p className="text-gray-600 flex items-center justify-center gap-2">
            <Calculator size={20} className="text-orange-500" />
            {t('pricing.description')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
              {t('pricing.title')}
            </h2>

            <form onSubmit={handleCalculate} className="space-y-4">
              {/* Market */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pricing.market')}
                </label>
                <select
                  name="market"
                  value={formData.market}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                >
                  {markets.map((market) => (
                    <option key={market} value={market}>
                      {market === 'UK' ? 'United Kingdom' : market === 'USA' ? 'United States' : 'China'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Weight */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pricing.weight')} *
                </label>
                <input
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  step="0.1"
                  min="0"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>

              {/* Dimensions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pricing.dimensions')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      type="number"
                      name="length"
                      placeholder={t('pricing.length')}
                      value={formData.length}
                      onChange={handleChange}
                      step="0.1"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      name="width"
                      placeholder={t('pricing.width')}
                      value={formData.width}
                      onChange={handleChange}
                      step="0.1"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      name="height"
                      placeholder={t('pricing.height')}
                      value={formData.height}
                      onChange={handleChange}
                      step="0.1"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Speed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pricing.shipping')}
                </label>
                <div className="flex gap-4">
                  {shippingSpeeds.map((speed) => (
                    <label
                      key={speed.value}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="shippingSpeed"
                        value={speed.value}
                        checked={formData.shippingSpeed === speed.value}
                        onChange={handleChange}
                        className="w-4 h-4 text-[#1e3a5f]"
                      />
                      <span className="text-gray-700">{speed.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Insurance */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="insurance"
                    checked={formData.insurance}
                    onChange={handleChange}
                    className="w-4 h-4 text-[#1e3a5f]"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {t('pricing.insurance')}
                  </span>
                </label>
              </div>

              {/* Declared Value */}
              {formData.insurance && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('pricing.declaredValue')}
                  </label>
                  <input
                    type="number"
                    name="declaredValue"
                    value={formData.declaredValue}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  />
                </div>
              )}

              {/* Calculate Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 mt-6 flex items-center justify-center gap-2"
              >
                <Calculator size={20} />
                {loading ? t('common.loading') : t('pricing.calculate')}
              </button>
            </form>
          </div>

          {/* Results Section */}
          <div>
            {result ? (
              <div className="card bg-gradient-to-br from-orange-50 to-orange-100">
                <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
                  {t('pricing.results')}
                </h2>

                <div className="space-y-4">
                  {/* Base Cost */}
                  <div className="flex justify-between items-center pb-4 border-b border-orange-200">
                    <span className="text-gray-700">{t('pricing.baseCost')}</span>
                    <span className="font-bold text-gray-900">
                      USD {result.baseCost?.toFixed(2) || 0}
                    </span>
                  </div>

                  {/* Weight Comparison */}
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-2">Weight Calculation</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>{t('pricing.actual')}:</span>
                        <span className="font-semibold">{formData.weight} kg</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('pricing.volumetric')}:</span>
                        <span className="font-semibold">
                          {((parseFloat(formData.length) * parseFloat(formData.width) * parseFloat(formData.height)) / 5000).toFixed(2)} kg
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Express Surcharge */}
                  {formData.shippingSpeed === 'express' && (
                    <div className="flex justify-between items-center pb-4 border-b border-orange-200">
                      <span className="text-gray-700">{t('pricing.surcharge')}</span>
                      <span className="font-bold text-gray-900">
                        USD {(result.baseCost * 0.3)?.toFixed(2) || 0}
                      </span>
                    </div>
                  )}

                  {/* Insurance */}
                  {formData.insurance && (
                    <div className="flex justify-between items-center pb-4 border-b border-orange-200">
                      <span className="text-gray-700">{t('pricing.insuranceCost')}</span>
                      <span className="font-bold text-gray-900">
                        USD {result.insuranceCost?.toFixed(2) || 0}
                      </span>
                    </div>
                  )}

                  {/* Customs Duty */}
                  <div className="flex justify-between items-center pb-4 border-b border-orange-200">
                    <span className="text-gray-700">{t('pricing.estimatedDuty')}</span>
                    <span className="font-bold text-gray-900">
                      KES {result.customsDuty?.toLocaleString() || 0}
                    </span>
                  </div>

                  {/* Total */}
                  <div className="bg-[#1e3a5f] text-white rounded-lg p-4 mt-6">
                    <p className="text-sm mb-2">{t('pricing.total')}</p>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-2xl font-bold">
                        USD {result.totalUSD?.toFixed(2) || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold">
                        KES {result.totalKES?.toLocaleString() || 0}
                      </span>
                    </div>
                  </div>

                  {/* Info Card */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                    <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-blue-700">
                      This is an estimate. Final pricing may vary based on actual package weight and dimensions.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card h-full flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Calculator size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Fill out the form and click calculate to see pricing</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
