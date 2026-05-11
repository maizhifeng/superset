import api from './index';

export const cohortAPI = {
  analyze: (config) => api.post('/cohort/analyze', config),
  upload: (data) => api.post('/cohort/upload', data, { timeout: 60000 }),
  getTemplates: () => api.get('/cohort/templates'),
  saveTemplate: (data) => api.post('/cohort/templates', data),
  updateTemplate: (id, data) => api.put(`/cohort/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/cohort/templates/${id}`),
};
