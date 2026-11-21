import { createApp } from '../apps/api/src/server.mjs';

const app = createApp();

export default function handler(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const route = url.searchParams.get('__route');

  if (route !== null) {
    url.searchParams.delete('__route');
    const path = `/${route.replace(/^\/+/, '')}`;
    request.url = `${path}${url.search}`;
  }

  app.emit('request', request, response);
}