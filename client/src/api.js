import api from './api/client'

// Auth
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, phone, password, referralCode) =>
    api.post('/auth/register', { name, email, phone, password, referral_code: referralCode }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  updateProfile: (updates) => api.put('/auth/profile', updates),
  changePassword: (currentPassword, newPassword) =>
    api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),
}

// Orders
export const ordersApi = {
  list: (filters = {}) => api.get('/orders', { params: filters }),
  get: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  delete: (id) => api.delete(`/orders/${id}`),
  track: (trackingNumber) => api.get(`/orders/track/${trackingNumber}`),
}

// Wallet
export const walletApi = {
  getBalance: () => api.get('/wallet/balance'),
  deposit: (method, amount, phoneNumber) =>
    api.post('/wallet/deposit', { method, amount, phoneNumber }),
  getTransactions: () => api.get('/wallet/transactions'),
  getTransactionDetails: (id) => api.get(`/wallet/transactions/${id}`),
}

// Pricing
export const pricingApi = {
  calculate: (market, weight, dimensions, shippingSpeed, insurance) =>
    api.post('/pricing/calculate', {
      market,
      weight,
      dimensions,
      shippingSpeed,
      insurance,
    }),
  getExchangeRates: () => api.get('/pricing/exchange-rates'),
}

// Warehouse
export const warehouseApi = {
  getAddresses: () => api.get('/warehouse/addresses'),
  getAddress: (market) => api.get(`/warehouse/addresses/${market}`),
}

// Consolidation
export const consolidationApi = {
  listPackages: () => api.get('/consolidation/packages'),
  requestConsolidation: (packageIds) =>
    api.post('/consolidation/request', { packageIds }),
  getRequests: () => api.get('/consolidation/requests'),
  cancelRequest: (id) => api.delete(`/consolidation/requests/${id}`),
}

// Prohibited Items
export const prohibitedApi = {
  checkItem: (itemName) => api.get(`/prohibited/check/${itemName}`),
  getCategories: () => api.get('/prohibited/categories'),
}

// Support Tickets
export const supportApi = {
  createTicket: (subject, description, priority, file) => {
    const formData = new FormData()
    formData.append('subject', subject)
    formData.append('description', description)
    formData.append('priority', priority)
    if (file) {
      formData.append('file', file)
    }
    return api.post('/support/tickets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  listTickets: () => api.get('/support/tickets'),
  getTicket: (id) => api.get(`/support/tickets/${id}`),
  replyToTicket: (id, message) =>
    api.post(`/support/tickets/${id}/reply`, { message }),
  closeTicket: (id) => api.put(`/support/tickets/${id}`, { status: 'closed' }),
}

// Referral
export const referralApi = {
  getCode: () => api.get('/referral/code'),
  getStats: () => api.get('/referral/stats'),
  getHistory: () => api.get('/referral/history'),
}

// Admin
export const adminApi = {
  getDashboardStats: () => api.get('/admin/stats'),

  listUsers: (filters = {}) => api.get('/admin/users', { params: filters }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),

  listOrders: (filters = {}) => api.get('/admin/orders', { params: filters }),
  bulkUpdateOrders: (orderIds, status) =>
    api.put('/admin/orders/bulk-update', { order_ids: orderIds, status }),

  getRevenue: (startDate, endDate) =>
    api.get('/admin/revenue', { params: { startDate, endDate } }),
  exportRevenue: (startDate, endDate) =>
    api.get('/admin/revenue/export', { params: { startDate, endDate }, responseType: 'blob' }),

  listTickets: (filters = {}) => api.get('/admin/tickets', { params: filters }),
  assignTicket: (id, assignedTo) =>
    api.put(`/admin/tickets/${id}`, { assignedTo }),
  updateTicketStatus: (id, status) =>
    api.put(`/admin/tickets/${id}`, { status }),

  // Exchange rate management
  getExchangeRates: () => api.get('/admin/exchange-rates'),
  setExchangeRates: (rates) => api.put('/admin/exchange-rates', { rates }),
}

export default api
