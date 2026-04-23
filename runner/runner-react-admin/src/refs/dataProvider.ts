import { DataProvider, fetchUtils } from 'react-admin';
import { getToken } from './authProvider';

const apiUrl = '/api';

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetchUtils.fetchJson(url, { ...options, headers });
};

const buildQuery = (params: Record<string, unknown>): string => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
};

export const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const skip = (page - 1) * perPage;
    const take = perPage;
    const orderBy = JSON.stringify({ [field]: order.toLowerCase() });
    const where =
      params.filter && Object.keys(params.filter).length > 0
        ? JSON.stringify(params.filter)
        : undefined;

    const query = buildQuery({ skip, take, orderBy, where });
    const { json } = await httpClient(`${apiUrl}/${resource}?${query}`);
    return { data: json.data, total: json.total };
  },

  getOne: async (resource, params) => {
    const { json } = await httpClient(`${apiUrl}/${resource}/${params.id}`);
    return { data: json };
  },

  getMany: async (resource, params) => {
    const where = JSON.stringify({ id: { in: params.ids } });
    const query = buildQuery({ skip: 0, take: params.ids.length, where });
    const { json } = await httpClient(`${apiUrl}/${resource}?${query}`);
    return { data: json.data };
  },

  getManyReference: async (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const skip = (page - 1) * perPage;
    const take = perPage;
    const orderBy = JSON.stringify({ [field]: order.toLowerCase() });
    const where = JSON.stringify({
      ...(params.filter || {}),
      [params.target]: params.id,
    });
    const query = buildQuery({ skip, take, orderBy, where });
    const { json } = await httpClient(`${apiUrl}/${resource}?${query}`);
    return { data: json.data, total: json.total };
  },

  create: async (resource, params) => {
    const { json } = await httpClient(`${apiUrl}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(params.data),
    });
    return { data: json };
  },

  update: async (resource, params) => {
    const { json } = await httpClient(`${apiUrl}/${resource}/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params.data),
    });
    return { data: json };
  },

  updateMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) =>
        httpClient(`${apiUrl}/${resource}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(params.data),
        }),
      ),
    );
    return { data: params.ids };
  },

  delete: async (resource, params) => {
    const { json } = await httpClient(`${apiUrl}/${resource}/${params.id}`, {
      method: 'DELETE',
    });
    return { data: json };
  },

  deleteMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) =>
        httpClient(`${apiUrl}/${resource}/${id}`, { method: 'DELETE' }),
      ),
    );
    return { data: params.ids };
  },
};
