import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'
const api  = axios.create({ baseURL: BASE })

export const examApi = {
  list: (folderId, all) => { const p = {}; if (folderId != null) p.folder_id = folderId; if (all) p.all = true; return api.get('/exams/', { params: p }) },
  get:          (id)            => api.get(`/exams/${id}`),
  create:       (data)          => api.post('/exams/', data),
  delete:       (id)            => api.delete(`/exams/${id}`),
  move:         (id, folderId)  => api.patch(`/exams/${id}/move`, { folder_id: folderId ?? null }),
  updateGroups: (id, gids)      => api.patch(`/exams/${id}/groups`, gids),
  gridUrl:      (id)            => `${BASE}/files/grid/${id}`,
}

export const folderApi = {
  list:       (parentId)          => api.get('/folders/', { params: parentId != null ? { parent_id: parentId } : {} }),
  breadcrumb: (folderId)          => api.get(`/folders/breadcrumb/${folderId}`),
  create:     (name, parentId)    => api.post('/folders/', { name, parent_id: parentId ?? null }),
  rename:     (id, name)          => api.patch(`/folders/${id}`, { name }),
  delete:     (id)                => api.delete(`/folders/${id}`),
  move:       (id, newParentId)   => api.patch(`/folders/${id}/move`, null, { params: { new_parent_id: newParentId ?? null } }),
}

export const scanApi = {
  upload: (examId, file, onProgress) => {
    const form = new FormData(); form.append('file', file)
    return api.post(`/scans/${examId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round(e.loaded / e.total * 100)),
    })
  },
  getSessions:      (examId)    => api.get(`/scans/${examId}/sessions`),
  getResults:       (sessionId) => api.get(`/scans/session/${sessionId}/results`),
  getPendingReview: (sessionId) => api.get(`/scans/session/${sessionId}/pending-review`),
  updateReview:     (id, data)  => api.put(`/scans/result/${id}/review`, data),
  exportUrl:        (sessionId) => `${BASE}/scans/session/${sessionId}/export-excel`,
  pageImageUrl:     (sessionId, page) => `${BASE}/files/page/${sessionId}/${page}`,
}

export const studentApi = {
  list:      (search = '') => api.get(`/students/?search=${encodeURIComponent(search)}`),
  create:    (data)        => api.post('/students/', data),
  delete:    (id)          => api.delete(`/students/${id}`),
  deleteAll: ()            => api.delete('/students/'),
  importCsv: (file) => {
    const form = new FormData(); form.append('file', file)
    return api.post('/students/import-csv', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  exportUrl: () => `${BASE}/students/export-csv`,
}

export const groupApi = {
  list:          ()          => api.get('/groups/'),
  create:        (name)      => api.post('/groups/', { name }),
  rename:        (id, name)  => api.patch(`/groups/${id}`, { name }),
  delete:        (id)        => api.delete(`/groups/${id}`),
  getStudents:   (id)        => api.get(`/groups/${id}/students`),
  addStudent:    (gid, sid)  => api.post(`/groups/${gid}/students/${sid}`),
  removeStudent: (gid, sid)  => api.delete(`/groups/${gid}/students/${sid}`),
  importCsv:     (gid, file) => {
    const form = new FormData(); form.append('file', file)
    return api.post(`/groups/${gid}/import-csv`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

export default api
