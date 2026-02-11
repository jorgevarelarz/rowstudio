const GRAPH_VERSION = 'v21.0';
const DEFAULT_PIXEL_ID = '5125940327515351';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (!forwarded) return '';
  return String(forwarded).split(',')[0].trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;

  if (!accessToken) {
    return res.status(500).json({
      ok: false,
      error: 'Missing META_ACCESS_TOKEN env var',
    });
  }

  let body = {};
  if (req.body && typeof req.body === 'object') body = req.body;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch {
      body = {};
    }
  }
  const eventName = body.event_name || 'PageView';
  const eventSourceUrl = body.event_source_url || req.headers.referer || '';
  const testEventCode = body.test_event_code || process.env.META_TEST_EVENT_CODE;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: eventSourceUrl,
        event_id: body.event_id || `evt_${Date.now()}`,
        custom_data: body.custom_data && typeof body.custom_data === 'object' ? body.custom_data : undefined,
        user_data: {
          client_ip_address: getClientIp(req),
          client_user_agent: req.headers['user-agent'] || '',
        },
      },
    ],
  };

  if (testEventCode) payload.test_event_code = testEventCode;

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  try {
    const fbResp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const fbJson = await fbResp.json();
    if (!fbResp.ok) {
      return res.status(fbResp.status).json({
        ok: false,
        source: 'meta',
        response: fbJson,
      });
    }

    return res.status(200).json({ ok: true, response: fbJson });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
