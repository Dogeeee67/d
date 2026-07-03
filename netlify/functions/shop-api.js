const { getStore } = require('@netlify/blobs');

function getShopStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  // Ak sú nastavené manuálne premenné, použi ich (rieši chybu "environment
  // has not been configured to use Netlify Blobs"). Inak skús automatickú
  // detekciu kontextu (funguje v niektorých typoch nasadenia bez zásahu).
  if (siteID && token) {
    return getStore({ name: 'shop', siteID: siteID, token: token });
  }
  return getStore('shop');
}

// ====================================================================
// OWNER ÚČTY — meno + heslo musia sedieť presne, aby mal niekto admin práva.
// Toto je teraz na serveri, takže sa to nedá vyčítať zo zdrojového kódu stránky.
// ====================================================================
const OWNER_CREDENTIALS = {
  'andrej kotrbal': 'x36gbUCLgbV2rYS#',
  'matias alejandro cabrera': 'Ct9-Owner-Vault-42x',
  'james redwood': 'Ct9-Owner-Vault-42x'
};

function isOwner(meno, heslo) {
  const key = normKey(meno);
  return Object.prototype.hasOwnProperty.call(OWNER_CREDENTIALS, key) && OWNER_CREDENTIALS[key] === heslo;
}

function normKey(meno) {
  return (meno || '').trim().toLowerCase();
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez mätúcich znakov (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3) code += '-';
  }
  return code;
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(obj)
  };
}

async function loadAccounts(store) {
  const raw = await store.get('accounts', { type: 'json' });
  return raw || {};
}

async function saveAccounts(store, accounts) {
  await store.setJSON('accounts', accounts);
}

async function sendDiscordMessage(webhookUrl, acc, items, titleSuffix) {
  if (!webhookUrl) return;

  let total = 0;
  const lines = items.map(function (item) {
    total += Number(String(item.price).replace(/[^\d]/g, '')) || 0;
    return '• **' + item.weapon + '** — ' + item.tier + ' · ' + item.price;
  });

  const payload = {
    embeds: [{
      title: 'Nová objednávka' + (titleSuffix ? ' ' + titleSuffix : '') + ' (' + items.length + ' položiek)',
      description: lines.join('\n'),
      color: 12609074,
      fields: [
        { name: 'Meno (RP)', value: acc.meno, inline: true },
        { name: 'Spolu', value: total.toLocaleString('sk-SK') + '$', inline: true }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // Discord notifikácia je len bonus, objednávka je uložená aj tak
  }
}

async function sendDiscordSimpleMessage(webhookUrl, payload) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // notifikácia je len bonus
  }
}

async function sendDiscordOrder(acc, items) {
  // Rozdeľ položky podľa zdroja — verejný cenník (bežní ľudia) posiela na
  // iný Discord kanál ako skrytý shop "Obľúbenci".
  const publicItems = items.filter(function (i) { return i.source === 'public' || i.source === 'cigarettes'; });
  const hiddenItems = items.filter(function (i) { return i.source !== 'public' && i.source !== 'cigarettes'; });

  const hiddenWebhook = process.env.DISCORD_WEBHOOK_URL;
  const publicWebhook = process.env.DISCORD_WEBHOOK_URL_PUBLIC || hiddenWebhook;

  if (hiddenItems.length > 0) {
    await sendDiscordMessage(hiddenWebhook, acc, hiddenItems, '(Obľúbenci)');
  }
  if (publicItems.length > 0) {
    await sendDiscordMessage(publicWebhook, acc, publicItems, '(Verejný cenník)');
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, {});
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Neplatný požiadavok.' });
  }

  const store = getShopStore();
  const action = body.action;

  try {
    // ---------------- REGISTRÁCIA ----------------
    if (action === 'register') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!meno || !heslo) return json(400, { error: 'Vyplň meno aj heslo.' });

      const accounts = await loadAccounts(store);
      const key = normKey(meno);
      if (accounts[key]) return json(409, { error: 'Toto meno je už zaregistrované. Prihlás sa.' });

      accounts[key] = { meno: meno, heslo: heslo, orders: [] };
      await saveAccounts(store, accounts);

      return json(200, { ok: true, meno: meno, isOwner: isOwner(meno, heslo), orders: [] });
    }

    // ---------------- PRIHLÁSENIE ----------------
    if (action === 'login') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      const accounts = await loadAccounts(store);
      const acc = accounts[normKey(meno)];

      if (!acc || acc.heslo !== heslo) return json(401, { error: 'Nesprávne meno alebo heslo.' });

      return json(200, { ok: true, meno: acc.meno, isOwner: isOwner(acc.meno, acc.heslo), orders: acc.orders || [] });
    }

    // ---------------- OBNOVENIE STAVU (napr. po refresh stránky) ----------------
    if (action === 'whoami') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      const accounts = await loadAccounts(store);
      const acc = accounts[normKey(meno)];

      if (!acc || acc.heslo !== heslo) return json(401, { error: 'Neplatná session.' });

      return json(200, { ok: true, meno: acc.meno, isOwner: isOwner(acc.meno, acc.heslo), orders: acc.orders || [] });
    }

    // ---------------- PRIDANIE OBJEDNÁVKY (z košíka) ----------------
    if (action === 'addOrders') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      const items = Array.isArray(body.items) ? body.items : [];

      const accounts = await loadAccounts(store);
      const key = normKey(meno);
      const acc = accounts[key];
      if (!acc || acc.heslo !== heslo) return json(401, { error: 'Nie si prihlásený.' });
      if (items.length === 0) return json(400, { error: 'Košík je prázdny.' });

      const now = new Date().toISOString();
      const cleanItems = items.map(function (item) {
        return {
          weapon: String(item.weapon || '').slice(0, 120),
          tier: String(item.tier || '').slice(0, 120),
          price: String(item.price || '').slice(0, 50),
          source: (item.source === 'public' || item.source === 'cigarettes') ? item.source : 'hidden',
          date: now,
          status: 'nova'
        };
      });
      acc.orders = (acc.orders || []).concat(cleanItems);
      await saveAccounts(store, accounts);

      await sendDiscordOrder(acc, cleanItems);

      return json(200, { ok: true, orders: acc.orders });
    }

    // ---------------- ADMIN: VŠETKY ÚČTY + OBJEDNÁVKY ----------------
    if (action === 'adminGetAll') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const accounts = await loadAccounts(store);
      return json(200, { ok: true, accounts: accounts });
    }

    // ---------------- ADMIN: ZOBRAZIŤ AKTUÁLNY PRÍSTUPOVÝ KÓD ----------------
    if (action === 'getAccessCode') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const target = body.target === 'elite' ? 'elite' : 'cennik';
      const data = await store.get('accessCode_' + target, { type: 'json' });
      return json(200, { ok: true, code: data ? data.code : null, forWhom: data ? data.forWhom : null });
    }

    // ---------------- ADMIN: VYGENEROVAŤ NOVÝ PRÍSTUPOVÝ KÓD ----------------
    if (action === 'generateAccessCode') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const target = body.target === 'elite' ? 'elite' : 'cennik';
      const forWhom = String(body.forWhom || '').trim().slice(0, 120) || 'neuvedené';
      const code = generateCode();
      await store.setJSON('accessCode_' + target, { code: code, forWhom: forWhom, createdAt: new Date().toISOString() });

      const codesWebhook = process.env.DISCORD_WEBHOOK_URL_CODES;
      await sendDiscordSimpleMessage(codesWebhook, {
        embeds: [{
          title: 'Nový vstupný kód vygenerovaný (' + (target === 'elite' ? 'Obľúbenci' : 'Cenník') + ')',
          color: 12609074,
          fields: [
            { name: 'Kód', value: '`' + code + '`', inline: true },
            { name: 'Pre koho', value: forWhom, inline: true },
            { name: 'Vygeneroval', value: meno, inline: true }
          ],
          timestamp: new Date().toISOString()
        }]
      });

      return json(200, { ok: true, code: code });
    }

    // ---------------- VEREJNÉ: OVERENIE PRÍSTUPOVÉHO KÓDU (odomknutie shopu) ----------------
    // Kód je JEDNORAZOVÝ — po úspešnom použití sa okamžite zneplatní.
    if (action === 'checkAccessCode') {
      const target = body.target === 'elite' ? 'elite' : 'cennik';
      const inputCode = (body.code || '').trim().toUpperCase();
      const data = await store.get('accessCode_' + target, { type: 'json' });
      const validCode = data ? data.code : null;

      if (!validCode || inputCode === '' || inputCode !== validCode) {
        return json(401, { error: 'Nesprávny kód.' });
      }

      // Kód spotrebovaný — zneplatniť ho, nech ho nikto iný nepoužije znova.
      await store.setJSON('accessCode_' + target, { code: null, usedAt: new Date().toISOString() });

      return json(200, { ok: true });
    }

    // ---------------- ADMIN: ZMENA STAVU OBJEDNÁVKY ----------------
    if (action === 'adminSetStatus') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const accounts = await loadAccounts(store);
      const tKey = normKey(body.targetMeno);
      const target = accounts[tKey];
      if (!target || !target.orders || !target.orders[body.orderIndex]) {
        return json(404, { error: 'Objednávka nenájdená.' });
      }
      target.orders[body.orderIndex].status = body.status;
      await saveAccounts(store, accounts);
      return json(200, { ok: true });
    }

    // ---------------- ADMIN: VYMAZAŤ JEDNU OBJEDNÁVKU ----------------
    if (action === 'adminDeleteOrder') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const accounts = await loadAccounts(store);
      const tKey = normKey(body.targetMeno);
      const target = accounts[tKey];
      if (!target || !target.orders || !target.orders[body.orderIndex]) {
        return json(404, { error: 'Objednávka nenájdená.' });
      }
      target.orders.splice(body.orderIndex, 1);
      await saveAccounts(store, accounts);
      return json(200, { ok: true });
    }

    // ---------------- ADMIN: HROMADNÉ VYMAZANIE OBJEDNÁVOK ----------------
    if (action === 'adminBulkDeleteOrders') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return json(400, { error: 'Nič nebolo vybrané.' });

      const accounts = await loadAccounts(store);

      // Zoskup indexy podľa účtu, zoraď zostupne (aby mazanie neposúvalo
      // ostávajúce indexy pod nohami).
      const byAccount = {};
      items.forEach(function (it) {
        const tKey = normKey(it.meno);
        if (!byAccount[tKey]) byAccount[tKey] = [];
        byAccount[tKey].push(Number(it.orderIndex));
      });

      Object.keys(byAccount).forEach(function (tKey) {
        const target = accounts[tKey];
        if (!target || !target.orders) return;
        const indices = byAccount[tKey].sort(function (a, b) { return b - a; });
        indices.forEach(function (idx) {
          if (target.orders[idx]) target.orders.splice(idx, 1);
        });
      });

      await saveAccounts(store, accounts);
      return json(200, { ok: true });
    }

    // ---------------- ADMIN: VYMAZAŤ JEDEN ÚČET ----------------
    if (action === 'adminDeleteAccount') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const accounts = await loadAccounts(store);
      delete accounts[normKey(body.targetMeno)];
      await saveAccounts(store, accounts);
      return json(200, { ok: true });
    }

    // ---------------- ADMIN: VYMAZAŤ VŠETKY ÚČTY (okrem ownerov) ----------------
    if (action === 'adminWipeAll') {
      const meno = (body.meno || '').trim();
      const heslo = body.heslo || '';
      if (!isOwner(meno, heslo)) return json(403, { error: 'Nemáš admin práva.' });

      const accounts = await loadAccounts(store);
      const keep = {};
      Object.keys(accounts).forEach(function (k) {
        const a = accounts[k];
        if (isOwner(a.meno, a.heslo)) keep[k] = a;
      });
      await saveAccounts(store, keep);
      return json(200, { ok: true });
    }

    return json(400, { error: 'Neznáma akcia.' });
  } catch (err) {
    return json(500, { error: 'Serverová chyba: ' + err.message });
  }
};
