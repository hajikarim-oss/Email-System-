import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  searchApolloPeople,
  enrichAndSavePerson,
  enrichAndSaveBatch,
  getSavedApolloLeads,
} from '../server/apolloService';

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export default async function apolloHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  const method = req.method || 'GET';

  try {
    // 1. POST /api/apollo/search
    if (pathname === '/api/apollo/search' && method === 'POST') {
      const body = await parseBody(req);
      const results = await searchApolloPeople({
        q_keywords: body.q_keywords,
        person_titles: body.person_titles,
        person_locations: body.person_locations,
        organization_num_employees_ranges: body.organization_num_employees_ranges,
        q_organization_domains: body.q_organization_domains,
        page: body.page || 1,
        per_page: body.per_page || 25,
      });
      return sendJson(res, 200, results);
    }

    // 2. POST /api/apollo/enrich-and-save
    if (pathname === '/api/apollo/enrich-and-save' && method === 'POST') {
      const body = await parseBody(req);
      if (Array.isArray(body.personIds) && body.personIds.length > 0) {
        const batchRes = await enrichAndSaveBatch(body.personIds, {
          categoryKey: body.categoryKey,
          tags: body.tags,
        });
        return sendJson(res, 200, batchRes);
      } else if (body.personId) {
        const saved = await enrichAndSavePerson(body.personId, {
          categoryKey: body.categoryKey,
          tags: body.tags,
        });
        return sendJson(res, 200, { success: true, lead: saved });
      } else {
        return sendJson(res, 400, { error: 'personId or personIds array required' });
      }
    }

    // 3. GET /api/apollo/saved
    if (pathname === '/api/apollo/saved' && method === 'GET') {
      const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
      const search = url.searchParams.get('search') || undefined;
      const categoryKey = url.searchParams.get('categoryKey') || undefined;

      const data = await getSavedApolloLeads({ limit, offset, search, categoryKey });
      return sendJson(res, 200, data);
    }

    return sendJson(res, 404, { error: `Not found: ${pathname}` });
  } catch (err: any) {
    console.error('[apolloHandler error]', err);
    return sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
}
