#!/usr/bin/env node
// Firestore snapshot backup via REST.
// Dumps hub/* and students/* to a timestamped folder under backups/.
//
// Usage:
//   FIREBASE_ADMIN_PASSWORD='<pw>' node scripts/backup.js
//
// The GitHub Action workflow (.github/workflows/backup.yml) runs this daily
// and uploads the result as a 90-day retention artifact.

'use strict';
const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyCxthHZazTx6WgDwJ24hSjdb2b1LKMIMmI';
const PROJECT = 'crmcgill-b0631';
const EMAIL = process.env.FIREBASE_ADMIN_EMAIL || 'juan@mcgill.ca';
const PASSWORD = process.env.FIREBASE_ADMIN_PASSWORD;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function signIn() {
    const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true })
        }
    );
    const d = await r.json();
    if (!d.idToken) throw new Error('Sign-in failed: ' + JSON.stringify(d.error || d));
    return d.idToken;
}

async function fetchCollection(token, name) {
    const out = [];
    let pageToken = '';
    for (;;) {
        const url = `${BASE}/${name}?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.error) throw new Error(`Fetch ${name} failed: ${d.error.message}`);
        if (d.documents) out.push(...d.documents);
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
    }
    return out;
}

async function main() {
    if (!PASSWORD) {
        console.error('Missing FIREBASE_ADMIN_PASSWORD env var.');
        process.exit(1);
    }
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    const outDir = path.join(__dirname, '..', 'backups', ts);
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`Signing in as ${EMAIL}...`);
    const token = await signIn();
    for (const coll of ['hub', 'students']) {
        const docs = await fetchCollection(token, coll);
        const p = path.join(outDir, `${coll}.json`);
        fs.writeFileSync(p, JSON.stringify(docs, null, 2));
        console.log(`  ${coll}: ${docs.length} docs → ${coll}.json (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
    }
    console.log(`\nBackup saved: ${outDir}`);
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
