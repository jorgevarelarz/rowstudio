const menuBtn = document.getElementById('menu-btn');
const overlay = document.getElementById('overlay');

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const metaQuery =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');

function sendMetaCapiEvent(eventName, extraPayload = {}) {
  if (typeof window === 'undefined') return;

  const payload = {
    event_name: eventName,
    event_source_url: window.location.href,
    ...extraPayload,
  };

  if (metaQuery.get('meta_test') === '1') {
    payload.test_event_code = 'TEST36265';
  }

  fetch('/api/meta-capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })
    .then((r) => r.json().catch(() => ({})))
    .then((data) => {
      if (metaQuery.get('meta_debug') === '1') {
        console.log('Meta CAPI:', data);
      }
    })
    .catch(() => {
      // Non-blocking analytics call
    });
}

function trackConversion(method, href) {
  const eventId = `${method}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metaEvent = method === 'whatsapp' ? 'Lead' : 'Contact';

  if (typeof window.fbq === 'function') {
    window.fbq('track', metaEvent, { method }, { eventID: eventId });
  }

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'generate_lead', {
      method,
      event_label: href,
    });
  }

  sendMetaCapiEvent(metaEvent, {
    event_id: eventId,
    event_source_url: href || window.location.href,
    custom_data: { method },
  });
}

function setMenuOpen(isOpen) {
  if (!menuBtn || !overlay) return;
  menuBtn.classList.toggle('active', isOpen);
  overlay.classList.toggle('open', isOpen);
  overlay.setAttribute('aria-hidden', String(!isOpen));
  document.body.classList.toggle('menu-open', isOpen);
}

// Abrir / Cerrar menu
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    if (!overlay) return;
    setMenuOpen(!overlay.classList.contains('open'));
  });

  // Accesibilidad minima: Enter/Espacio en el "boton"
  menuBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    menuBtn.click();
  });
}

// Cerrar el menu al hacer click en cualquier enlace del overlay
if (overlay) {
  overlay.addEventListener('click', (e) => {
    const target = e.target;
    if (target === overlay) setMenuOpen(false);
    if (target && target.closest && target.closest('a')) setMenuOpen(false);
  });
}

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenuOpen(false);
});

// Cerrar el menu si se usa onclick="closeMenu()" (anclas, mailto, etc.)
function closeMenu() {
  setMenuOpen(false);
}

// Reveal on scroll (simple, no dependencies)
(() => {
  const els = Array.from(document.querySelectorAll('[data-reveal]'));
  if (els.length === 0) return;

  // Stagger per "section" so delays don't accumulate across the whole page.
  const counts = new Map();
  for (const el of els) {
    const container = el.closest('header, section, main') || document.body;
    const idx = counts.get(container) ?? 0;
    el.style.setProperty('--d', `${Math.min(idx, 10) * 70}ms`);
    counts.set(container, idx + 1);
  }

  // If IO isn't available, just show everything.
  if (typeof IntersectionObserver === 'undefined') {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.14, rootMargin: '0px 0px -10% 0px' }
  );

  els.forEach((el) => io.observe(el));
})();

// Magnet hover (subtle) for buttons
(() => {
  if (prefersReducedMotion) return;
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

  const btns = Array.from(document.querySelectorAll('.btn'));
  if (btns.length === 0) return;

  const strength = 0.22;
  const max = 12;

  for (const el of btns) {
    let raf = 0;
    let last = { x: 0, y: 0 };

    const apply = () => {
      raf = 0;
      el.style.setProperty('--mx', `${last.x}px`);
      el.style.setProperty('--my', `${last.y}px`);
    };

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      last.x = Math.max(-max, Math.min(max, dx * strength));
      last.y = Math.max(-max, Math.min(max, dy * strength));
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const reset = () => {
      last.x = 0;
      last.y = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('pointerdown', reset);
  }
})();

// Page transition between internal pages (index.html <-> campanas.html)
(() => {
  if (prefersReducedMotion) return;

  let pt = document.getElementById('page-transition');
  if (!pt) {
    pt = document.createElement('div');
    pt.id = 'page-transition';
    pt.className = 'page-transition';
    pt.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pt);
  }

  const shouldHandleLink = (a) => {
    if (!a) return false;
    if (a.hasAttribute('download')) return false;
    const target = (a.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return false;

    const href = a.getAttribute('href');
    if (!href) return false;
    if (href.startsWith('#')) return false;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return false;
    }
    if (url.origin !== window.location.origin) return false;

    // Same document (including hash-only changes): don't animate.
    if (url.pathname === window.location.pathname) return false;

    // Only handle simple HTML navigation for this static site.
    return url.pathname.endsWith('.html');
  };

  const leaveTo = (url) => {
    pt.classList.add('is-on', 'is-leaving');
    window.setTimeout(() => {
      window.location.href = url;
    }, 220);
  };

  document.addEventListener(
    'click',
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!shouldHandleLink(a)) return;

      e.preventDefault();
      setMenuOpen(false);

      const url = new URL(a.getAttribute('href'), window.location.href);
      leaveTo(url.href);
    },
    { capture: true }
  );
})();

// Server-side PageView via Meta CAPI endpoint (Vercel function)
(() => {
  if (typeof window === 'undefined') return;
  sendMetaCapiEvent('PageView');
})();

// Conversion tracking for contact actions
document.addEventListener(
  'click',
  (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;

    const href = a.getAttribute('href') || '';
    if (!href) return;

    if (href.startsWith('mailto:')) {
      trackConversion('email', href);
      return;
    }

    if (href.includes('wa.me/') || href.includes('api.whatsapp.com/')) {
      trackConversion('whatsapp', href);
    }
  },
  { capture: true }
);
