// ── Mock data (replace with Supabase calls in v2) ──────────────────────────

// Agency owner credentials (v1 hardcoded — replaced by Supabase auth in v2)
export const AGENCY_CREDS = { email: 'admin@kalnyesgrowth.com', password: 'agency2025' };

// Per-client credentials (v1 — replaced by Supabase auth in v2)
export const CLIENT_CREDS = {
  '1': { email: 'maria@marias-salon.com',   password: 'salon2025'    },
  '2': { email: 'info@rodriguez-hvac.com',  password: 'hvac2025'     },
  '3': { email: 'carlos@carlos-auto.com',   password: 'auto2025'     },
  '4': { email: 'luna@luna-boutique.com',   password: 'boutique2025' },
  '5': { email: 'info@delreyevents.com',    password: 'events2025'   },
};

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateRevenueSeries(days, baseDaily) {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const variance = 0.6 + Math.random() * 0.8;
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: Math.round(baseDaily * variance),
    };
  });
}

export const MOCK_CLIENTS = [
  {
    id: '1',
    name: "Maria's Beauty Salon",
    domain: 'marias-salon.com',
    color: '#7C3AED',
    initials: 'MB',
    plan: 'Máquina de Clientes',
    status: 'active',
    since: 'Jan 2025',
    niche: 'service',
    metrics: {
      revenue:    { today: 340,   week: 2180,  month: 8640,  all: 32400 },
      orders:     { today: 4,     week: 28,    month: 112,   all: 420   },
      sessions:   { today: 68,    week: 476,   month: 1904,  all: 7200  },
      emails:     { today: 11,    week: 74,    month: 296,   all: 980   },
      addToCarts: { today: 0,     week: 0,     month: 0,     all: 0     },
      leads:      { today: 6,     week: 42,    month: 168,   all: 620   },
    },
    revenueSeries: {
      week:  generateRevenueSeries(7, 300),
      month: generateRevenueSeries(30, 280),
      all:   generateRevenueSeries(90, 260),
    },
    recentOrders: [
      { id: '#1042', customer: 'Jennifer Lopez',  email: 'jlo@email.com',      amount: 85,  status: 'confirmed', date: 'Today, 2:14 PM'    },
      { id: '#1041', customer: 'Rosa Martinez',   email: 'rosa@gmail.com',     amount: 120, status: 'confirmed', date: 'Today, 11:08 AM'   },
      { id: '#1040', customer: 'Ana Reyes',        email: 'ana.r@email.com',    amount: 65,  status: 'pending',   date: 'Yesterday, 4:30 PM' },
      { id: '#1039', customer: 'Carmen Silva',    email: 'carmen@yahoo.com',   amount: 95,  status: 'confirmed', date: 'Yesterday, 1:00 PM' },
      { id: '#1038', customer: 'Lisa Torres',     email: 'lisa.t@gmail.com',   amount: 110, status: 'confirmed', date: 'Jun 12, 10:20 AM'   },
    ],
    recentEmails: [
      { email: 'nuevacliente@gmail.com',  source: 'Popup',          date: 'Today, 3:00 PM'     },
      { email: 'maria.g@hotmail.com',     source: 'Contact Form',   date: 'Today, 1:15 PM'     },
      { email: 'sarah.k@email.com',       source: 'Popup',          date: 'Yesterday, 5:20 PM' },
      { email: 'promo@gmail.com',         source: 'Footer Form',    date: 'Yesterday, 2:00 PM' },
    ],
  },
  {
    id: '2',
    name: 'Rodriguez HVAC',
    domain: 'rodriguez-hvac.com',
    color: '#0369A1',
    initials: 'RH',
    plan: 'Sistema Completo',
    status: 'active',
    since: 'Feb 2025',
    niche: 'service',
    metrics: {
      revenue:    { today: 1200,  week: 7800,  month: 31200, all: 94000 },
      orders:     { today: 3,     week: 19,    month: 76,    all: 228   },
      sessions:   { today: 112,   week: 784,   month: 3136,  all: 9400  },
      emails:     { today: 18,    week: 126,   month: 504,   all: 1500  },
      addToCarts: { today: 0,     week: 0,     month: 0,     all: 0     },
      leads:      { today: 9,     week: 63,    month: 252,   all: 756   },
    },
    revenueSeries: {
      week:  generateRevenueSeries(7, 1100),
      month: generateRevenueSeries(30, 1000),
      all:   generateRevenueSeries(90, 900),
    },
    recentOrders: [
      { id: '#0088', customer: 'David Chen',       email: 'dchen@gmail.com',     amount: 480, status: 'confirmed', date: 'Today, 9:00 AM'     },
      { id: '#0087', customer: 'Patricia Nguyen',  email: 'pat.n@email.com',     amount: 320, status: 'confirmed', date: 'Yesterday, 3:45 PM'  },
      { id: '#0086', customer: 'James Williams',   email: 'jwill@yahoo.com',     amount: 550, status: 'pending',   date: 'Jun 12, 11:30 AM'    },
      { id: '#0085', customer: 'Emma Rodriguez',   email: 'emma.r@gmail.com',    amount: 290, status: 'confirmed', date: 'Jun 11, 2:00 PM'     },
    ],
    recentEmails: [
      { email: 'newlead@gmail.com',    source: 'Quote Form',     date: 'Today, 10:00 AM'    },
      { email: 'house@email.com',      source: 'Contact Form',   date: 'Yesterday, 6:30 PM' },
    ],
  },
  {
    id: '3',
    name: "Carlos's Auto Shop",
    domain: 'carlos-auto.com',
    color: '#B45309',
    initials: 'CA',
    plan: 'Presencia Pro',
    status: 'active',
    since: 'Mar 2025',
    niche: 'service',
    metrics: {
      revenue:    { today: 0,    week: 0,     month: 0,     all: 0     },
      orders:     { today: 0,    week: 0,     month: 0,     all: 0     },
      sessions:   { today: 34,   week: 238,   month: 952,   all: 2856  },
      emails:     { today: 5,    week: 35,    month: 140,   all: 420   },
      addToCarts: { today: 0,    week: 0,     month: 0,     all: 0     },
      leads:      { today: 3,    week: 21,    month: 84,    all: 252   },
    },
    revenueSeries: { week: [], month: [], all: [] },
    recentOrders: [],
    recentEmails: [
      { email: 'fix@gmail.com',         source: 'Contact Form',   date: 'Today, 1:00 PM'     },
      { email: 'carservice@yahoo.com',  source: 'Popup',          date: 'Today, 11:40 AM'    },
      { email: 'mike.d@email.com',      source: 'Footer Form',    date: 'Yesterday, 4:10 PM' },
    ],
  },
  {
    id: '4',
    name: 'Luna Boutique',
    domain: 'luna-boutique.com',
    color: '#BE185D',
    initials: 'LB',
    plan: 'Sistema Completo',
    status: 'active',
    since: 'Dec 2024',
    niche: 'ecommerce',
    metrics: {
      revenue:    { today: 680,   week: 4320,  month: 17280, all: 72000 },
      orders:     { today: 12,    week: 78,    month: 312,   all: 1248  },
      sessions:   { today: 204,   week: 1428,  month: 5712,  all: 22400 },
      emails:     { today: 32,    week: 224,   month: 896,   all: 3360  },
      addToCarts: { today: 48,    week: 312,   month: 1248,  all: 4800  },
      leads:      { today: 0,     week: 0,     month: 0,     all: 0     },
    },
    revenueSeries: {
      week:  generateRevenueSeries(7, 620),
      month: generateRevenueSeries(30, 580),
      all:   generateRevenueSeries(90, 520),
    },
    recentOrders: [
      { id: '#2210', customer: 'Sofia Ramirez',   email: 'sofia.r@email.com',   amount: 147, status: 'confirmed', date: 'Today, 4:02 PM'     },
      { id: '#2209', customer: 'Mia Johnson',     email: 'mia.j@gmail.com',     amount: 89,  status: 'confirmed', date: 'Today, 2:48 PM'     },
      { id: '#2208', customer: 'Valentina Cruz',  email: 'val.c@hotmail.com',   amount: 212, status: 'shipped',   date: 'Today, 12:00 PM'    },
      { id: '#2207', customer: 'Isabella Park',   email: 'isa.p@gmail.com',     amount: 65,  status: 'confirmed', date: 'Yesterday, 7:30 PM'  },
      { id: '#2206', customer: 'Elena Morales',   email: 'elena.m@email.com',   amount: 178, status: 'shipped',   date: 'Yesterday, 3:15 PM'  },
    ],
    recentEmails: [
      { email: 'fashionlover@gmail.com',  source: 'Popup',        date: 'Today, 5:00 PM'     },
      { email: 'style@email.com',         source: 'Checkout',     date: 'Today, 2:30 PM'     },
      { email: 'new@gmail.com',           source: 'Popup',        date: 'Today, 11:00 AM'    },
      { email: 'boutique@yahoo.com',      source: 'Footer Form',  date: 'Yesterday, 6:00 PM' },
      { email: 'shopping@gmail.com',      source: 'Checkout',     date: 'Yesterday, 4:20 PM' },
    ],
  },
  {
    id: '5',
    name: 'Del Rey Events',
    domain: 'delreyevents.com',
    color: '#0F766E',
    initials: 'DR',
    plan: 'Máquina de Clientes',
    status: 'active',
    since: 'Apr 2025',
    niche: 'service',
    metrics: {
      revenue:    { today: 0,    week: 0,     month: 0,     all: 0     },
      orders:     { today: 0,    week: 0,     month: 0,     all: 0     },
      sessions:   { today: 52,   week: 364,   month: 1456,  all: 2912  },
      emails:     { today: 8,    week: 56,    month: 224,   all: 448   },
      addToCarts: { today: 0,    week: 0,     month: 0,     all: 0     },
      leads:      { today: 5,    week: 35,    month: 140,   all: 280   },
    },
    revenueSeries: { week: [], month: [], all: [] },
    recentOrders: [],
    recentEmails: [
      { email: 'party@gmail.com',        source: 'Contact Form',  date: 'Today, 4:30 PM'     },
      { email: 'events@yahoo.com',       source: 'Popup',         date: 'Today, 2:10 PM'     },
      { email: 'quinces@hotmail.com',    source: 'Contact Form',  date: 'Yesterday, 5:45 PM' },
      { email: 'rentals@gmail.com',      source: 'Footer Form',   date: 'Yesterday, 1:20 PM' },
      { email: 'celebration@email.com',  source: 'Popup',         date: 'Jun 12, 3:00 PM'    },
    ],
  },
];

export function getClient(id) {
  return MOCK_CLIENTS.find(c => c.id === id) || null;
}

export function getAgencySummary() {
  const clients = MOCK_CLIENTS;
  return {
    totalClients: clients.length,
    totalRevenueMonth: clients.reduce((s, c) => s + c.metrics.revenue.month, 0),
    totalOrdersMonth:  clients.reduce((s, c) => s + c.metrics.orders.month, 0),
    totalLeadsMonth:   clients.reduce((s, c) => s + c.metrics.leads.month + c.metrics.emails.month, 0),
    activeClients: clients.filter(c => c.status === 'active').length,
  };
}
