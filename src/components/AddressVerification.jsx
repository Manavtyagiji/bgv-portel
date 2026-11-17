import { useState, useEffect, useRef, useCallback } from "react";
import { BASE } from "../api/api";

/* ═══════════════════════════════════════════════════════════
   CSS  (unchanged from original)
═══════════════════════════════════════════════════════════ */
export const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --brand: #1e3a8a; --accent: #2563eb; --light: #eff6ff; --border: #bfdbfe; --border2: #93c5fd;
    --success: #16a34a; --danger: #dc2626; --text: #0f172a; --muted: #64748b;
    --bg: #f1f5f9; --card: #fff; --r: 12px;
    --sh: 0 1px 4px rgba(0,0,0,.07), 0 4px 16px rgba(0,0,0,.05);
  }

  .av-root { font-family: 'DM Sans', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding-bottom: 60px; display: flex; flex-direction: column; }

  /* ── TOP NAVBAR ── */
  .tv-navbar {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0 24px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
  }
  .tv-navbar-left { display: flex; align-items: center; gap: 12px; }
  .tv-logo { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg,#1e3a8a,#2563eb); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 800; }
  .tv-brand-name { font-size: 17px; font-weight: 800; color: #1e3a8a; letter-spacing: .3px; }
  .tv-brand-sub { font-size: 11px; color: var(--muted); }
  .tv-navbar-right { display: flex; align-items: center; gap: 10px; }
  .tv-badge-role { background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; display: flex; align-items: center; gap: 5px; }
  .tv-total-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 16px; text-align: center; }
  .tv-total-lbl { font-size: 9px; font-weight: 700; color: var(--muted); letter-spacing: .8px; text-transform: uppercase; }
  .tv-total-val { font-size: 20px; font-weight: 800; color: #1e3a8a; line-height: 1.1; }
  .tv-nav-btn { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1.5px solid #e2e8f0; background: #fff; color: #334155; font-family: inherit; transition: .15s; }
  .tv-nav-btn:hover { background: #f8fafc; }
  .tv-nav-btn.danger { color: #dc2626; border-color: #fecaca; }
  .tv-nav-btn.danger:hover { background: #fef2f2; }

  /* ── LAYOUT ── */
  .tv-layout { display: flex; flex: 1; min-height: 0; }

  /* ── SIDEBAR ── */
  .tv-sidebar {
    width: 240px;
    flex-shrink: 0;
    background: #fff;
    border-right: 1px solid #e2e8f0;
    padding: 20px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tv-sidebar-section { font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; padding: 12px 10px 6px; }
  .tv-sidebar-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-radius: 10px; cursor: pointer;
    font-size: 14px; font-weight: 500; color: #475569;
    transition: .15s;
  }
  .tv-sidebar-item:hover { background: #f8fafc; color: #1e3a8a; }
  .tv-sidebar-item.active { background: #eff6ff; color: #1e3a8a; font-weight: 700; }
  .tv-sidebar-item-left { display: flex; align-items: center; gap: 10px; }
  .tv-sidebar-icon { font-size: 18px; width: 22px; text-align: center; }
  .tv-sidebar-count { background: #1e3a8a; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; min-width: 24px; text-align: center; }

  /* ── MAIN ── */
  .tv-main { flex: 1; overflow-y: auto; padding: 24px; min-width: 0; }
  .tv-page-header { margin-bottom: 22px; }
  .tv-page-title { font-size: 22px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
  .tv-page-sub { font-size: 13px; color: var(--muted); margin-top: 3px; display: flex; align-items: center; gap: 6px; }
  .tv-online-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; }

  /* ── STAT CARDS ── */
  .tv-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .tv-stat-card {
    background: #fff; border-radius: 16px; padding: 18px 16px 14px;
    border: 1px solid #e8eef6; cursor: pointer; transition: .2s;
    position: relative; overflow: hidden;
  }
  .tv-stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,.1); }
  .tv-stat-card.active-filter { box-shadow: 0 0 0 2.5px var(--stat-color, #2563eb); }
  .tv-stat-icon-wrap {
    width: 42px; height: 42px; border-radius: 12px;
    background: var(--stat-bg, #eff6ff);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; margin-bottom: 12px;
  }
  .tv-stat-num { font-size: 30px; font-weight: 800; color: var(--stat-color, #2563eb); line-height: 1; margin-bottom: 4px; }
  .tv-stat-lbl { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .tv-stat-hint { font-size: 11px; color: #94a3b8; }
  .tv-stat-bar { position: absolute; bottom: 0; left: 0; height: 3px; background: var(--stat-color, #2563eb); width: var(--stat-pct, 0%); border-radius: 0 3px 3px 0; opacity: .5; }

  /* ── QUICK ACTIONS ── */
  .tv-quick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .tv-quick-card {
    background: #fff; border-radius: 16px; padding: 20px 18px;
    border: 1px solid #e8eef6; cursor: pointer; transition: .2s;
    display: flex; flex-direction: column; gap: 6px;
  }
  .tv-quick-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,.1); border-color: #bfdbfe; }
  .tv-quick-icon { font-size: 28px; margin-bottom: 4px; }
  .tv-quick-title { font-size: 15px; font-weight: 700; color: #0f172a; }
  .tv-quick-desc { font-size: 12px; color: #94a3b8; }

  /* ── SECTION CARD ── */
  .tv-section { background: #fff; border-radius: 16px; border: 1px solid #e8eef6; margin-bottom: 20px; overflow: hidden; }
  .tv-section-head { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .tv-section-title { font-size: 15px; font-weight: 700; color: #0f172a; }
  .tv-section-body { padding: 0; }

  /* ── TOOLBAR ── */
  .db-toolbar { display: flex; gap: 10px; padding: 14px 20px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid #f1f5f9; }
  .db-search { flex: 1; min-width: 180px; padding: 9px 14px; font-size: 13px; border: 1.5px solid #e2e8f0; border-radius: 9px; background: #f8fafc; color: #0f172a; font-family: inherit; outline: none; }
  .db-search:focus { border-color: #2563eb; background: #fff; }
  .db-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer; border-radius: 9px; font-family: inherit; transition: .15s; white-space: nowrap; }
  .db-btn-primary { background: #1e3a8a; color: #fff; border: none; }
  .db-btn-primary:hover { background: #1e40af; }
  .db-btn-outline { background: #fff; color: #334155; border: 1.5px solid #e2e8f0; }
  .db-btn-outline:hover { background: #f8fafc; }
  .db-btn-wa { background: #25d366; color: #fff; border: none; }
  .db-btn-wa:hover { background: #22c55e; }
  .db-btn-sm { padding: 6px 11px; font-size: 12px; }
  .db-filter-btn { padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; border-radius: 20px; font-family: inherit; border: 1.5px solid #e2e8f0; background: #fff; color: #64748b; transition: .15s; }
  .db-filter-btn.active { background: #1e3a8a; color: #fff; border-color: #1e3a8a; }

  /* ── TABLE ── */
  .db-table-wrap { overflow-x: auto; }
  .db-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .db-table thead tr { background: #f8fafc; }
  .db-table th { padding: 10px 14px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; border-bottom: 1px solid #e2e8f0; letter-spacing: .5px; text-transform: uppercase; }
  .db-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .db-table tr:last-child td { border-bottom: none; }
  .db-table tbody tr:hover td { background: #f8fafc; }

  /* ── STATUS BADGES ── */
  .db-status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .db-status-pending { background: #fef3c7; color: #92400e; }
  .db-status-sent { background: #d1fae5; color: #065f46; }
  .db-status-submitted { background: #dbeafe; color: #1e40af; }
  .db-status-closed { background: #f1f5f9; color: #475569; }
  .db-status-insuff { background: #ede9fe; color: #5b21b6; }
  .db-status-hold { background: #fff7ed; color: #c2410c; }
  .db-status-stop { background: #fef2f2; color: #dc2626; }

  /* ── TAT BADGE ── */
  .tv-tat { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
  .tv-tat.ok { background: #d1fae5; color: #065f46; }
  .tv-tat.warn { background: #fef3c7; color: #92400e; }
  .tv-tat.over { background: #fef2f2; color: #dc2626; }

  /* ── UPLOAD ZONE ── */
  .db-upload-zone { border: 2px dashed #cbd5e1; border-radius: 14px; padding: 28px 20px; text-align: center; cursor: pointer; background: #fff; transition: .2s; margin-bottom: 14px; }
  .db-upload-zone:hover, .db-upload-zone.dragging { border-color: #2563eb; background: #eff6ff; }
  .db-upload-icon { font-size: 30px; margin-bottom: 8px; }
  .db-upload-title { font-size: 14px; font-weight: 700; color: #334155; margin-bottom: 4px; }
  .db-upload-hint { font-size: 12px; color: #94a3b8; }
  .db-upload-hint code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-family: 'DM Mono', monospace; }

  /* ── EMPTY STATE ── */
  .db-empty { text-align: center; padding: 50px 20px; color: #94a3b8; }
  .db-empty-icon { font-size: 36px; margin-bottom: 10px; }
  .db-empty-title { font-size: 14px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
  .db-empty-sub { font-size: 13px; }

  /* ── ACTIONS ── */
  .db-actions { display: flex; gap: 5px; flex-wrap: nowrap; }

  /* ── MODAL ── */
  .db-modal-bg { position: fixed; inset: 0; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
  .db-modal { background: #fff; border-radius: 16px; width: min(540px, 96vw); max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.25); border: 1px solid #e2e8f0; }
  .db-modal-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: #fff; z-index: 1; }
  .db-modal-title { font-size: 16px; font-weight: 800; color: #0f172a; }
  .db-modal-close { background: none; border: none; font-size: 22px; cursor: pointer; color: #94a3b8; line-height: 1; padding: 2px 6px; }
  .db-modal-body { padding: 20px; }
  .db-section-label { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: .6px; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin: 14px 0 10px; }
  .db-field { margin-bottom: 12px; }
  .db-field label { display: block; font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px; }
  .db-field input, .db-field select, .db-field textarea { width: 100%; padding: 8px 11px; font-size: 13px; border: 1.5px solid #e2e8f0; border-radius: 8px; background: #f8fafc; color: #0f172a; font-family: inherit; outline: none; transition: .15s; }
  .db-field input:focus, .db-field select:focus, .db-field textarea:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.08); }
  .db-field select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; }
  .db-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .db-link-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #1e40af; word-break: break-all; font-family: 'DM Mono', monospace; line-height: 1.6; margin: 10px 0 8px; }
  .db-link-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .db-wa-btn { display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; text-decoration: none; }
  .db-wa-btn:hover { background: #22c55e; }
  .db-view-row { display: flex; border-bottom: 1px solid #f1f5f9; }
  .db-view-key { min-width: 130px; padding: 9px 12px; font-size: 12px; font-weight: 700; color: #64748b; background: #f8fafc; flex-shrink: 0; }
  .db-view-val { padding: 9px 12px; font-size: 13px; color: #0f172a; flex: 1; word-break: break-word; }

  /* ── CLIENT MANAGER ── */
  .cm-wrap { max-width: 860px; }
  .cm-add-row { display: flex; gap: 10px; margin-bottom: 20px; }
  .cm-add-input { flex: 1; padding: 10px 14px; font-size: 14px; border: 1.5px solid #e2e8f0; border-radius: 10px; background: #fff; color: #0f172a; font-family: inherit; outline: none; transition: .15s; }
  .cm-add-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.08); }
  .cm-add-btn { padding: 10px 22px; background: #1e3a8a; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: .15s; white-space: nowrap; }
  .cm-add-btn:hover { background: #1e40af; }
  .cm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .cm-card {
    padding: 18px 16px; border: 1.5px solid #e2e8f0; border-radius: 14px;
    background: #fff; cursor: pointer; transition: .18s;
    display: flex; flex-direction: column; gap: 4px;
  }
  .cm-card:hover { border-color: #93c5fd; background: #f8fafc; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,.07); }
  .cm-card.selected { border-color: #2563eb; background: #eff6ff; box-shadow: 0 0 0 2px #bfdbfe; }
  .cm-card-icon { font-size: 26px; margin-bottom: 6px; }
  .cm-card-name { font-size: 14px; font-weight: 700; color: #0f172a; }
  .cm-card-count { font-size: 12px; color: #64748b; }
  .cm-card-del { margin-top: 8px; align-self: flex-start; font-size: 11px; color: #dc2626; background: none; border: none; cursor: pointer; font-family: inherit; padding: 0; opacity: 0; transition: opacity .15s; }
  .cm-card:hover .cm-card-del { opacity: 1; }
  .cm-divider { height: 1px; background: #e2e8f0; margin-bottom: 24px; }
  .cm-cases-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .cm-cases-title { font-size: 17px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
  .cm-cases-tag { font-size: 12px; font-weight: 600; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 20px; padding: 3px 10px; }
  .cm-empty { text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 14px; border: 1.5px dashed #e2e8f0; }
  .cm-empty-icon { font-size: 32px; margin-bottom: 8px; }
  .cm-empty-title { font-size: 14px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
  .cm-empty-sub { font-size: 13px; color: #94a3b8; }
  .cm-hint { font-size: 13px; color: #94a3b8; text-align: center; padding: 32px 20px; }

  /* ── CANDIDATE / ADMIN FORM STYLES (existing) ── */
  .av-header { background: linear-gradient(135deg,#1e3a8a 0%,#1e40af 50%,#2563eb 100%); padding: 18px 20px 16px; color: #fff; }
  .av-hd-eye { font-size: 10px; letter-spacing: 2.5px; opacity: .6; text-transform: uppercase; font-weight: 600; }
  .av-hd-title { font-size: 18px; font-weight: 700; margin-top: 3px; display: flex; align-items: center; gap: 8px; }
  .av-hd-sub { font-size: 11px; opacity: .55; margin-top: 2px; }
  .av-badge { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 20px; letter-spacing: .5px; text-transform: uppercase; }
  .av-badge.admin { background: rgba(255,255,255,.2); color: #fff; }
  .av-badge.candidate { background: #fbbf24; color: #78350f; }
  .av-page { padding: 16px; max-width: 520px; margin: 0 auto; }
  .av-card { background: #fff; border-radius: var(--r); padding: 20px; margin-bottom: 14px; box-shadow: var(--sh); border: 1px solid rgba(0,0,0,.04); }
  .av-card-title { font-size: 15px; font-weight: 700; color: var(--brand); margin-bottom: 14px; }
  .av-sh { font-size: 11px; font-weight: 700; color: var(--brand); letter-spacing: .8px; text-transform: uppercase; border-bottom: 2px solid var(--light); padding-bottom: 7px; margin: 18px 0 13px; }
  .av-sh:first-child { margin-top: 0; }
  .av-note { background: var(--light); border-radius: 8px; padding: 9px 12px; font-size: 12px; color: var(--muted); line-height: 1.55; margin-bottom: 14px; }
  .av-pf-grid { border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 4px; }
  .av-pf-row { display: flex; border-bottom: 1px solid var(--border); }
  .av-pf-row:last-child { border-bottom: none; }
  .av-pf-key { background: var(--light); padding: 10px 12px; font-size: 12px; font-weight: 600; color: var(--brand); min-width: 130px; flex-shrink: 0; border-right: 1px solid var(--border); }
  .av-pf-val { padding: 10px 12px; font-size: 13px; color: var(--text); font-weight: 500; flex: 1; word-break: break-word; }
  .av-pf-val.empty { color: var(--muted); font-style: italic; }
  .av-field { margin-bottom: 13px; }
  .av-field label { display: block; font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 5px; }
  .av-req { color: var(--danger); }
  .av-field input, .av-field select, .av-field textarea { width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 9px; font-size: 14px; color: var(--text); background: #fff; font-family: inherit; outline: none; appearance: none; transition: border-color .2s, box-shadow .2s; }
  .av-field input:focus, .av-field select:focus, .av-field textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,.11); }
  .av-field textarea { resize: vertical; }
  .av-field select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
  .av-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
  .av-photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .av-photo-card { border: 1.5px solid var(--border); border-radius: 11px; padding: 14px 10px; background: #fff; text-align: center; cursor: pointer; transition: .2s; overflow: hidden; }
  .av-photo-card:hover { border-color: var(--accent); background: var(--light); }
  .av-photo-card.done { border-color: var(--success); background: #f0fdf4; }
  .av-pc-icon { font-size: 24px; margin-bottom: 5px; }
  .av-photo-card.done .av-pc-icon { display: none; }
  .av-pc-lbl { font-size: 11px; font-weight: 700; color: var(--text); line-height: 1.3; }
  .av-pc-note { font-size: 10px; color: var(--muted); margin-top: 3px; }
  .av-photo-card.done .av-pc-note { color: var(--success); font-weight: 600; }
  .av-thumb { width: 100%; height: 80px; object-fit: cover; border-radius: 7px; margin-bottom: 6px; }
  .av-gps-card { border: 1.5px solid var(--border); border-radius: 10px; padding: 14px; background: #fff; margin-bottom: 0; transition: .2s; }
  .av-gps-card.done { border-color: var(--success); background: #f0fdf4; }
  .av-gps-live { background: #1a1a2e; border-radius: 12px; overflow: hidden; border: 1.5px solid #2d2d4e; margin-bottom: 0; }
  .av-gps-live-header { background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%); padding: 12px 14px 10px; border-bottom: 1px solid #2d2d4e; display: flex; align-items: center; gap: 8px; }
  .av-gps-live-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.6); animation: gps-pulse 1.8s ease-in-out infinite; flex-shrink: 0; }
  @keyframes gps-pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.6); } 60% { box-shadow: 0 0 0 7px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
  .av-gps-live-title { font-size: 12px; font-weight: 700; color: #e2e8f0; letter-spacing: .5px; }
  .av-gps-live-status { margin-left: auto; font-size: 10px; font-weight: 700; color: #22c55e; letter-spacing: .5px; text-transform: uppercase; }
  .av-gps-live-body { display: flex; gap: 0; }
  .av-gps-live-info { flex: 1; padding: 14px; }
  .av-gps-city { font-size: 16px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; line-height: 1.25; }
  .av-gps-address { font-size: 11px; color: #94a3b8; line-height: 1.55; margin-bottom: 10px; }
  .av-gps-coords { font-family: 'DM Mono', monospace; font-size: 11px; color: #7dd3fc; margin-bottom: 6px; letter-spacing: .3px; }
  .av-gps-datetime { font-size: 10.5px; color: #64748b; margin-bottom: 10px; }
  .av-gps-accuracy-row { display: flex; align-items: center; gap: 6px; }
  .av-gps-acc-dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; border: 2px solid #fca5a5; box-shadow: 0 0 6px rgba(239,68,68,.5); flex-shrink: 0; }
  .av-gps-acc-dot.good { background: #22c55e; border-color: #86efac; box-shadow: 0 0 6px rgba(34,197,94,.5); }
  .av-gps-acc-text { font-size: 11.5px; color: #94a3b8; font-weight: 600; }
  .av-gps-map-thumb { width: 110px; flex-shrink: 0; background: #0f172a; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; border-left: 1px solid #2d2d4e; }
  .av-gps-map-inner { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 4px; }
  .av-gps-map-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(37,99,235,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.12) 1px, transparent 1px); background-size: 16px 16px; }
  .av-gps-map-pin { position: relative; z-index: 2; font-size: 28px; filter: drop-shadow(0 2px 8px rgba(239,68,68,.7)); animation: pin-bounce .6s ease-out; }
  @keyframes pin-bounce { 0% { transform: translateY(-10px); opacity: 0; } 60% { transform: translateY(3px); } 100% { transform: translateY(0); opacity: 1; } }
  .av-gps-map-label { position: relative; z-index: 2; font-size: 9px; color: #475569; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; background: rgba(15,23,42,.8); padding: 2px 6px; border-radius: 4px; }
  .av-gps-map-rings { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .av-gps-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(37,99,235,.25); animation: ring-expand 2.5s ease-out infinite; }
  .av-gps-ring:nth-child(1) { width: 40px; height: 40px; animation-delay: 0s; }
  .av-gps-ring:nth-child(2) { width: 65px; height: 65px; animation-delay: .5s; }
  .av-gps-ring:nth-child(3) { width: 90px; height: 90px; animation-delay: 1s; }
  @keyframes ring-expand { 0% { opacity: .7; transform: scale(.8); } 100% { opacity: 0; transform: scale(1.2); } }
  .av-gps-recapture { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-top: 1px solid #2d2d4e; background: rgba(15,23,42,.5); }
  .av-gps-recapture-btn { margin-left: auto; background: #1e3a8a; color: #93c5fd; border: 1px solid #2563eb; border-radius: 7px; font-size: 11px; font-weight: 700; padding: 5px 12px; cursor: pointer; font-family: inherit; transition: .2s; }
  .av-gps-recapture-btn:hover { background: #2563eb; color: #fff; }
  .av-gps-recapture-text { font-size: 11px; color: #22c55e; font-weight: 600; }
  .av-gps-locating { background: #1a1a2e; border-radius: 12px; border: 1.5px solid #2d2d4e; padding: 24px 16px; text-align: center; }
  .av-gps-spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid #1e3a8a; border-top-color: #3b82f6; animation: spin .8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .av-gps-locating-text { color: #94a3b8; font-size: 13px; font-weight: 600; }
  .av-gps-locating-sub { color: #475569; font-size: 11px; margin-top: 4px; }
  .av-sig-wrap { border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; }
  .av-sig-head { background: var(--light); padding: 7px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
  .av-sig-head span { font-size: 12px; font-weight: 700; }
  .av-sig-clear { font-size: 12px; color: var(--danger); background: none; border: none; cursor: pointer; font-family: inherit; }
  .av-sig-canvas { display: block; cursor: crosshair; touch-action: none; background: #fff; width: 100%; }
  .av-sig-confirm-btn { width: 100%; padding: 9px; background: var(--success); color: #fff; border: none; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .av-sig-ok { margin-top: 8px; padding: 7px 10px; background: #f0fdf4; border-radius: 7px; font-size: 12px; color: var(--success); font-weight: 600; }
  .av-btn { width: 100%; padding: 13px 0; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; font-family: inherit; transition: opacity .2s, transform .1s; }
  .av-btn:active { transform: scale(.98); }
  .av-btn-primary { background: var(--accent); color: #fff; }
  .av-btn-success { background: var(--success); color: #fff; }
  .av-btn:disabled { background: #94a3b8; cursor: not-allowed; }
  .av-btn-outline { background: transparent; color: var(--muted); border: 1.5px solid var(--border) !important; border-radius: 9px; padding: 10px 0; font-size: 13px; margin-top: 10px; }
  .av-share-box { background: var(--light); border: 1.5px dashed var(--border2); border-radius: 10px; padding: 16px; text-align: center; }
  .av-share-url { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--accent); word-break: break-all; margin: 8px 0; padding: 8px; background: #fff; border-radius: 7px; border: 1px solid var(--border); }
  .av-copy-btn { padding: 8px 18px; border-radius: 7px; background: var(--accent); color: #fff; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .av-err-bar { background: #fef2f2; border: 1px solid #fecaca; border-radius: 9px; padding: 10px 14px; margin-bottom: 14px; color: var(--danger); font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .av-err-bar button { margin-left: auto; background: none; border: none; color: var(--danger); cursor: pointer; font-size: 16px; }
  .av-decl { background: var(--light); border: 1px solid var(--border); border-radius: 10px; padding: 14px; font-size: 12px; color: var(--text); line-height: 1.8; margin-bottom: 14px; }
  .av-check-row { display: flex; gap: 11px; align-items: flex-start; cursor: pointer; }
  .av-check-row input[type=checkbox] { margin-top: 2px; width: 17px; height: 17px; flex-shrink: 0; accent-color: var(--accent); }
  .av-check-row span { font-size: 13px; line-height: 1.5; }
  .av-success-wrap { text-align: center; padding: 32px 16px; }
  .av-success-icon { font-size: 68px; margin-bottom: 14px; }
  .av-success-id-box { background: var(--light); border: 1.5px solid var(--border); border-radius: 12px; padding: 16px 20px; margin: 20px auto; max-width: 300px; }
  .av-sid-lbl { font-size: 10px; font-weight: 700; color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase; }
  .av-sid-val { font-size: 20px; font-weight: 700; color: var(--brand); letter-spacing: 2px; margin-top: 4px; font-family: 'DM Mono', monospace; }
  .av-footer { text-align: center; margin-top: 24px; font-size: 11px; color: var(--muted); line-height: 1.7; }
  .av-thumb-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

  /* ── TAT TRACKER ── */
  .tat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; padding: 20px; }
  .tat-card { background: #fff; border: 1px solid #e8eef6; border-radius: 14px; padding: 16px; }
  .tat-card-name { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .tat-card-ref { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }
  .tat-bar-wrap { height: 6px; background: #f1f5f9; border-radius: 3px; margin-bottom: 6px; overflow: hidden; }
  .tat-bar-fill { height: 100%; border-radius: 3px; transition: width .4s; }
  .tat-bar-fill.ok { background: #22c55e; }
  .tat-bar-fill.warn { background: #f59e0b; }
  .tat-bar-fill.over { background: #ef4444; }
  .tat-days { font-size: 12px; font-weight: 700; }
  .tat-days.ok { color: #16a34a; }
  .tat-days.warn { color: #d97706; }
  .tat-days.over { color: #dc2626; }

  /* ── CANDIDATE NAVBAR ── */
  .tv-candidate-navbar {
    background: linear-gradient(135deg,#1e3a8a 0%,#1e40af 50%,#2563eb 100%);
    padding: 14px 20px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tv-candidate-navbar .tv-logo { background: rgba(255,255,255,.2); }
  .tv-candidate-brand { flex: 1; }
  .tv-candidate-brand-name { font-size: 15px; font-weight: 800; color: #fff; }
  .tv-candidate-brand-sub { font-size: 10px; color: rgba(255,255,255,.6); letter-spacing: 1.5px; text-transform: uppercase; }

  /* ── STEP INDICATOR ── */
  .av-steps { display: flex; align-items: center; justify-content: center; gap: 0; padding: 16px 20px 8px; }
  .av-step-item { display: flex; align-items: center; gap: 0; }
  .av-step-circle {
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; border: 2px solid #cbd5e1; color: #94a3b8; background: #fff;
    transition: .2s;
  }
  .av-step-circle.active { border-color: #2563eb; color: #2563eb; background: #eff6ff; }
  .av-step-circle.done { border-color: #22c55e; color: #fff; background: #22c55e; }
  .av-step-line { width: 40px; height: 2px; background: #e2e8f0; margin: 0 6px; }
  .av-step-line.done { background: #22c55e; }
  .av-step-label { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 4px; font-weight: 600; }
  .av-step-label.active { color: #2563eb; }
  .av-step-label.done { color: #22c55e; }

  @media (max-width: 768px) {
    .tv-sidebar { display: none; }
    .tv-main { padding: 14px; }
    .tv-stats-grid { grid-template-columns: repeat(3, 1fr); }
    .tv-quick-grid { grid-template-columns: 1fr 1fr; }
    .tv-navbar-right { gap: 6px; }
    .tv-navbar { padding: 0 12px; }
    .av-grid2 { grid-template-columns: 1fr; }
  }
`;

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
// Candidate link points at this portal's own public candidate-form route
// (mounted outside the login wall in main.jsx), not the original tool's
// hardcoded tervies.info domain — this is wherever bgv-portel is deployed.
const BASE_URL =
  typeof window !== "undefined" ? `${window.location.origin}/address-verify-form` : "";

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const Note = ({ children }) => <div className="av-note">{children}</div>;
const SH = ({ children }) => <div className="av-sh">{children}</div>;

export function buildLink(c) {
  const p = new URLSearchParams({
    mode: "candidate",
    name: c.name || "",
    mobile: c.phone || "",
    email: c.email || "",
    refid: c.refid || "NA",
    client: c.client || "",
    address: c.address || "",
    addrtype: c.addrtype || "Permanent",
    vdate: c.vdate || "",
  });
  return `${BASE_URL}?${p.toString()}`;
}

export function buildWA(link, name, phone) {
  const msg = encodeURIComponent(
    `Dear ${name || "Candidate"},\n\nPlease complete your Residential Address Verification using the secure link below:\n\n${link}\n\nKindly:\n• Allow GPS/location access when prompted\n• Keep your address proof ready (Aadhaar / Voter ID)\n• Complete in one sitting from your residence\n\n— True Verification Services Pvt. Ltd.`
  );
  const cleaned = (phone || "").replace(/\D/g, "");
  const waPhone = cleaned.length === 10 ? `91${cleaned}` : cleaned;
  return waPhone ? `https://wa.me/${waPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
}

/* ═══════════════════════════════════════════════════════════
   GPS HOOK
═══════════════════════════════════════════════════════════ */
function useGPS() {
  const [gpsData, setGpsData] = useState(null);
  const [gpsErr, setGpsErr] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [geoInfo, setGeoInfo] = useState(null);

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      if (!data?.address) return;
      const a = data.address;
      const city = a.city || a.town || a.village || a.county || a.state_district || a.state || "Unknown";
      const countryCode = (a.country_code || "").toUpperCase();
      const flag = countryCode ? countryCode.split("").map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join("") : "";
      setGeoInfo({ city: `${city}, ${a.state || a.country || ""}`, address: data.display_name || "", flag });
    } catch { setGeoInfo(null); }
  }, []);

  const capture = useCallback(() => {
    setCapturing(true); setGpsErr(false); setGeoInfo(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setGpsData(coords); setCapturing(false);
        reverseGeocode(coords.lat, coords.lng);
      },
      () => { setGpsErr(true); setCapturing(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [reverseGeocode]);

  return { gpsData, gpsErr, capturing, capture, geoInfo };
}

/* ═══════════════════════════════════════════════════════════
   LIVE GPS DISPLAY  (unchanged)
═══════════════════════════════════════════════════════════ */
function LiveGPSDisplay({ gpsData, geoInfo, capturing, gpsErr, onCapture }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (!gpsData) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [gpsData]);

  const fmtDateTime = d => {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    let h = d.getHours(), ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const oh = String(Math.floor(Math.abs(offset)/60)).padStart(2,"0");
    const om = String(Math.abs(offset)%60).padStart(2,"0");
    return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(h).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")} ${ampm} GMT${sign}${oh}:${om}`;
  };

  if (capturing) return (
    <div className="av-gps-locating">
      <div className="av-gps-spinner" />
      <div className="av-gps-locating-text">Locating your position…</div>
      <div className="av-gps-locating-sub">Please allow location access if prompted</div>
    </div>
  );

  if (gpsErr && !gpsData) return (
    <div className="av-gps-card">
      <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>⚠️ Location access denied. Enable GPS and retry.</div>
      <button className="av-btn av-btn-outline" style={{ marginTop: 0 }} onClick={onCapture}>📍 Retry Location</button>
    </div>
  );

  if (!gpsData) return (
    <div className="av-gps-card">
      <button className="av-btn av-btn-outline" style={{ marginTop: 0 }} onClick={onCapture}>📍 Capture My Location</button>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>Allow location access when prompted</p>
    </div>
  );

  const isGood = gpsData.accuracy <= 30;
  return (
    <div className="av-gps-live">
      <div className="av-gps-live-header">
        <div className="av-gps-live-dot" />
        <div className="av-gps-live-title">Live GPS Location</div>
        <div className="av-gps-live-status">● Locked</div>
      </div>
      <div className="av-gps-live-body">
        <div className="av-gps-live-info">
          <div className="av-gps-city">{geoInfo ? `${geoInfo.city}${geoInfo.flag ? " "+geoInfo.flag : ""}` : `${gpsData.lat.toFixed(4)}°, ${gpsData.lng.toFixed(4)}°`}</div>
          {geoInfo?.address && <div className="av-gps-address">{geoInfo.address}</div>}
          <div className="av-gps-coords">Lat {gpsData.lat.toFixed(6)}° Long {gpsData.lng.toFixed(6)}°</div>
          <div className="av-gps-datetime">{fmtDateTime(now)}</div>
          <div className="av-gps-accuracy-row">
            <div className={`av-gps-acc-dot${isGood?" good":""}`} />
            <div className="av-gps-acc-text">{gpsData.accuracy.toFixed(2)} m</div>
          </div>
        </div>
        <div className="av-gps-map-thumb">
          <div className="av-gps-map-grid" />
          <div className="av-gps-map-rings">
            <div className="av-gps-ring" /><div className="av-gps-ring" /><div className="av-gps-ring" />
          </div>
          <div className="av-gps-map-inner">
            <div className="av-gps-map-pin">📍</div>
            <div className="av-gps-map-label">Google</div>
          </div>
        </div>
      </div>
      <div className="av-gps-recapture">
        <div className="av-gps-recapture-text">✓ Location verified</div>
        <button className="av-gps-recapture-btn" onClick={onCapture}>↻ Recapture</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SIGNATURE CANVAS  (unchanged)
═══════════════════════════════════════════════════════════ */
function SignatureCanvas({ onConfirm, onClear }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasContent, setHasContent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.min(window.innerWidth - 64, 480);
    const ctx = canvas.getContext("2d");
    const getPos = e => { const r = canvas.getBoundingClientRect(), s = e.touches?.[0] || e; return { x: s.clientX - r.left, y: s.clientY - r.top }; };
    const draw = e => { if (!drawing.current) return; const p = getPos(e); ctx.strokeStyle="#1e3a8a"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineTo(p.x,p.y); ctx.stroke(); setHasContent(true); };
    const start = e => { drawing.current=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
    const stop = () => { drawing.current=false; };
    canvas.addEventListener("mousedown",start); canvas.addEventListener("mousemove",draw); canvas.addEventListener("mouseup",stop);
    canvas.addEventListener("touchstart",e=>{e.preventDefault();start(e);},{passive:false});
    canvas.addEventListener("touchmove",e=>{e.preventDefault();draw(e);},{passive:false});
    canvas.addEventListener("touchend",stop);
    return () => { canvas.removeEventListener("mousedown",start); canvas.removeEventListener("mousemove",draw); canvas.removeEventListener("mouseup",stop); };
  }, []);

  const clear = () => { canvasRef.current.getContext("2d").clearRect(0,0,canvasRef.current.width,canvasRef.current.height); setHasContent(false); setConfirmed(false); onClear(); };
  const confirm = () => { canvasRef.current.toBlob(blob => { setConfirmed(true); onConfirm(blob, URL.createObjectURL(blob)); }, "image/png"); };

  return (
    <div>
      <div className="av-sig-wrap">
        <div className="av-sig-head"><span>Sign here</span><button className="av-sig-clear" onClick={clear}>Clear</button></div>
        <canvas ref={canvasRef} className="av-sig-canvas" height={130} />
        {hasContent && !confirmed && <button className="av-sig-confirm-btn" onClick={confirm}>✓ Confirm Signature</button>}
      </div>
      {confirmed && <div className="av-sig-ok">✓ Signature confirmed</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PHOTO CARD  (unchanged)
═══════════════════════════════════════════════════════════ */
function PhotoCard({ id, icon, label, note, required, onCapture }) {
  const [preview, setPreview] = useState(null);
  const handleChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setPreview(ev.target.result); onCapture(id, file, ev.target.result); };
    reader.readAsDataURL(file);
  };
  const isEnv = id === "housePic" || id === "landmark";
  return (
    <label className={`av-photo-card${preview ? " done" : ""}`}>
      {preview && <img className="av-thumb" src={preview} alt={label} />}
      <div className="av-pc-icon">{icon}</div>
      <div className="av-pc-lbl">{label} {required && <span className="av-req">*</span>}</div>
      <div className="av-pc-note">{preview ? "✓ Captured" : note}</div>
      <input type="file" accept="image/*" capture={isEnv ? "environment" : id === "selfie" ? "user" : undefined} style={{ display: "none" }} onChange={handleChange} />
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════
   WA SVG ICON  (unchanged)
═══════════════════════════════════════════════════════════ */
export const WaIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

/* ═══════════════════════════════════════════════════════════
   STEP INDICATOR  (unchanged)
═══════════════════════════════════════════════════════════ */
function StepIndicator({ current }) {
  const steps = [
    { num: 1, label: "Details" },
    { num: 2, label: "Evidence" },
    { num: 3, label: "Review" },
  ];
  return (
    <div className="av-steps">
      {steps.map((s, i) => (
        <div key={s.num} className="av-step-item">
          {i > 0 && <div className={`av-step-line${current > s.num - 1 ? " done" : ""}`} />}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className={`av-step-circle${current === s.num ? " active" : current > s.num ? " done" : ""}`}>
              {current > s.num ? "✓" : s.num}
            </div>
            <div className={`av-step-label${current === s.num ? " active" : current > s.num ? " done" : ""}`}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CANDIDATE PANE  (unchanged except the submit URL, which now
   points at this portal's own public /address-verify/submit API
   instead of a smart-guessed localhost/same-origin constant)
═══════════════════════════════════════════════════════════ */
export function CandidatePane() {
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [prefill, setPrefill] = useState({});
  const [form, setForm] = useState({ father:"", dob:"", gender:"", vname:"", vrel:"", from:"", to:"", nature:"Owned", landmark:"" });
  const [photos, setPhotos] = useState({});
  const [previews, setPreviews] = useState({});
  const [sigBlob, setSigBlob] = useState(null);
  const [sigConfirmed, setSigConfirmed] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verId, setVerId] = useState("");
  const { gpsData, gpsErr, capturing, capture, geoInfo } = useGPS();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setPrefill({
      "Profile Name": p.get("name") || "",
      "Client Name":  p.get("client") || "",
      "Mobile":       p.get("mobile") || "",
      "Email":        p.get("email") || "",
      "Reference ID": p.get("refid") || "NA",
      "Address":      p.get("address") || "",
      "Verification Date": p.get("vdate") || "",
      "Address Type": p.get("addrtype") || "Permanent",
    });
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const handlePhoto = (id, file, url) => { setPhotos(p=>({...p,[id]:file})); setPreviews(p=>({...p,[id]:url})); };
  const handleSigConfirm = (blob, url) => { setSigBlob(blob); setSigConfirmed(true); setPreviews(p=>({...p,signature:url})); };
  const handleSigClear = () => { setSigBlob(null); setSigConfirmed(false); setPreviews(p=>{const n={...p};delete n.signature;return n;}); };
  const goStep = n => { setErr(""); setStep(n); window.scrollTo({top:0,behavior:"smooth"}); };

  const validateStep1 = () => {
    const checks = [["father","Father's Name"],["dob","Date of Birth"],["gender","Gender"],["vname","Verifier Name"],["vrel","Relation with Verifier"],["from","Period of Stay (From)"],["to","Period of Stay (To)"]];
    for (const [k,lbl] of checks) if (!form[k]) return setErr(`${lbl} is required.`);
    goStep(2);
  };

  const validateStep2 = () => {
    if (!gpsData) return setErr("Please capture your GPS location.");
    if (!photos.selfie) return setErr("Selfie photo is required.");
    if (!photos.addressProof) return setErr("Address proof photo is required.");
    if (!photos.housePic) return setErr("House photo is required.");
    if (!sigConfirmed) return setErr("Please provide and confirm your signature.");
    setErr(""); goStep(3);
  };

  const submit = async () => {
    if (!declared) return setErr("Please agree to the declaration before submitting.");
    setSubmitting(true);
    setErr("");
    try {
      const formPayload = {
        name: prefill["Profile Name"] || "Unknown",
        phone: prefill["Mobile"] || "",
        email: prefill["Email"] || "",
        caseId: (prefill["Reference ID"] && prefill["Reference ID"] !== "NA")
                  ? prefill["Reference ID"]
                  : `AVR-${Date.now()}`,
        presentAddress: prefill["Address"] || geoInfo?.address || "Not provided",
        fatherName: form.father,
        dob: form.dob,
        gender: form.gender,
        verifierName: form.vname,
        relationWithVerifier: form.vrel,
        periodOfStayFrom: form.from,
        periodOfStayTo: form.to,
        natureOfResidence: form.nature,
        nearestLandmark: form.landmark || "",
        addressType: prefill["Address Type"] || "Permanent",
        clientName: prefill["Client Name"] || "",
        gps: gpsData ? { lat: gpsData.lat, lng: gpsData.lng, accuracy: gpsData.accuracy } : null,
        gpsCity: geoInfo?.city || "",
        gpsAddress: geoInfo?.address || "",
      };
      const fd = new FormData();
      fd.append("form", JSON.stringify(formPayload));
      if (photos.selfie) fd.append("selfie", photos.selfie);
      if (photos.addressProof) fd.append("addressProof", photos.addressProof);
      if (photos.housePic) fd.append("housePic", photos.housePic);
      if (photos.landmark) fd.append("landmarkPic", photos.landmark);
      if (sigBlob) fd.append("signature", sigBlob, "signature.png");

      const res = await fetch(`${BASE}/address-verify/submit`, { method:"POST", body:fd });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 404) { setErr("Server endpoint not found. Please contact support."); }
        else if (res.status >= 500) { setErr("Server error. Please try again in a moment."); }
        else {
          try { const errData = JSON.parse(text); setErr(errData.message || `Error ${res.status}. Please try again.`); }
          catch { setErr(`Error ${res.status}. Please try again.`); }
        }
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      if (!data.success) { setErr(data.message || "Submission failed. Please try again."); setSubmitting(false); return; }
      setVerId(data.verificationId); setStep(4); window.scrollTo({top:0,behavior:"smooth"});
    } catch(e) {
      setErr(`Could not reach the server. Please check your internet connection and try again. (${e.message || "Network error"})`);
    } finally { setSubmitting(false); }
  };

  const summaryRows = [
    ["Profile Name",prefill["Profile Name"]],["Client",prefill["Client Name"]],
    ["Mobile",prefill["Mobile"]],["Email",prefill["Email"]],
    ["Reference ID",prefill["Reference ID"]||"NA"],
    ["Address",prefill["Address"]],["Father's Name",form.father],["Date of Birth",form.dob],["Gender",form.gender],
    ["Verifier",`${form.vname} (${form.vrel})`],["Period of Stay",`${form.from} – ${form.to}`],
    ["Nature of Residence",form.nature],["Nearest Landmark",form.landmark||"—"],
    ["GPS",gpsData?`${gpsData.lat.toFixed(6)}, ${gpsData.lng.toFixed(6)}`:"Not captured"],
    ["Location",geoInfo?.city||"—"],
  ];
  const thumbItems = [["selfie","🤳"],["addressProof","🪪"],["housePic","🏠"],["landmark","🏛️"],["signature","✍️"]];

  return (
    <div>
      {step < 4 && <StepIndicator current={step} />}
      {err && <div className="av-err-bar">⚠️ {err}<button onClick={()=>setErr("")}>✕</button></div>}

      {step===1 && (<>
        <div className="av-card">
          <div className="av-card-title">📋 Case Details (Pre-filled)</div>
          <Note>Details below were filled by the verification team. Please review, then complete your personal information.</Note>
          <div className="av-pf-grid">
            {Object.entries(prefill).filter(([k]) => k !== "Email" || prefill[k]).map(([k,val])=>(
              <div className="av-pf-row" key={k}>
                <div className="av-pf-key">{k}</div>
                <div className={`av-pf-val${!val?" empty":""}`}>{val||"—"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="av-card">
          <div className="av-card-title">👤 Your Details</div>
          <SH>Personal Information</SH>
          <div className="av-field"><label>Father's Name *</label><input value={form.father} onChange={set("father")} placeholder="Father's full name" /></div>
          <div className="av-grid2">
            <div className="av-field"><label>Date of Birth *</label><input type="date" value={form.dob} onChange={set("dob")} /></div>
            <div className="av-field"><label>Gender *</label>
              <select value={form.gender} onChange={set("gender")}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select>
            </div>
          </div>
          <SH>Verifier Details</SH>
          <Note>Person who will be present at the address during verification</Note>
          <div className="av-grid2">
            <div className="av-field"><label>Verifier Name *</label><input value={form.vname} onChange={set("vname")} placeholder="Name" /></div>
            <div className="av-field"><label>Relation with Verifier *</label>
              <select value={form.vrel} onChange={set("vrel")}><option value="">Select</option>{["Self","Father","Mother","Spouse","Brother","Sister","Son","Daughter","Relative","Neighbour","Other"].map(r=><option key={r}>{r}</option>)}</select>
            </div>
          </div>
          <SH>Residence Details</SH>
          <div className="av-grid2">
            <div className="av-field"><label>Stay From *</label><input type="date" value={form.from} onChange={set("from")} /></div>
            <div className="av-field"><label>Stay To *</label><input type="date" value={form.to} onChange={set("to")} /></div>
          </div>
          <div className="av-grid2">
            <div className="av-field"><label>Nature of Residence *</label>
              <select value={form.nature} onChange={set("nature")}>{["Owned","Rented","Company Provided","PG / Hostel","Parental"].map(n=><option key={n}>{n}</option>)}</select>
            </div>
            <div className="av-field"><label>Nearest Landmark</label><input value={form.landmark} onChange={set("landmark")} placeholder="Temple, school…" /></div>
          </div>
          <button className="av-btn av-btn-primary" onClick={validateStep1}>Continue →</button>
        </div>
      </>)}

      {step===2 && (<>
        <div className="av-card">
          <div className="av-card-title">📍 GPS Location <span className="av-req">*</span></div>
          <LiveGPSDisplay gpsData={gpsData} geoInfo={geoInfo} capturing={capturing} gpsErr={gpsErr} onCapture={capture} />
        </div>
        <div className="av-card">
          <div className="av-card-title">📸 Photos</div>
          <div className="av-photo-grid">
            <PhotoCard id="selfie" icon="🤳" label="Selfie" note="Front camera" required onCapture={handlePhoto} />
            <PhotoCard id="addressProof" icon="🪪" label="Address Proof" note="Aadhaar / Voter ID" required onCapture={handlePhoto} />
            <PhotoCard id="housePic" icon="🏠" label="House Photo" note="Outside of residence" required onCapture={handlePhoto} />
            <PhotoCard id="landmark" icon="🏛️" label="Landmark Photo" note="Optional" onCapture={handlePhoto} />
          </div>
        </div>
        <div className="av-card">
          <div className="av-card-title">✍️ Digital Signature <span className="av-req">*</span></div>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:11}}>Sign using your finger or stylus below</p>
          <SignatureCanvas onConfirm={handleSigConfirm} onClear={handleSigClear} />
        </div>
        <button className="av-btn av-btn-primary" onClick={validateStep2}>Continue →</button>
        <button className="av-btn av-btn-outline" onClick={()=>goStep(1)}>← Back</button>
      </>)}

      {step===3 && (<>
        <div className="av-card">
          <div className="av-card-title">📋 Review Your Information</div>
          <Note>Please verify all details before submitting. Use the Back button to make changes.</Note>
          <div className="av-pf-grid">
            {summaryRows.map(([k,val])=>(
              <div className="av-pf-row" key={k}><div className="av-pf-key">{k}</div><div className="av-pf-val">{val||"—"}</div></div>
            ))}
          </div>
          <div className="av-thumb-row">
            {thumbItems.filter(([k])=>previews[k]).map(([k,ic])=>(
              <div key={k} style={{textAlign:"center"}}>
                <img src={previews[k]} style={{width:54,height:54,objectFit:"cover",borderRadius:7,border:"2px solid var(--success)"}} alt={k} />
                <div style={{fontSize:9,color:"var(--muted)",marginTop:2}}>{ic} {k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="av-card">
          <div className="av-card-title">📜 Declaration</div>
          <div className="av-decl">
            I, <strong>{prefill["Profile Name"]||"___"}</strong>, hereby declare that all information provided is true and correct to the best of my knowledge. I consent to True Verification Services Pvt. Ltd. using this information for residential address verification on behalf of my employer / client company.<br/><br/>
            The photographs, GPS coordinates, and digital signature are genuine and captured at the time of this verification.
          </div>
          <label className="av-check-row">
            <input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)} />
            <span>I have read and agree to the above declaration. <span className="av-req">*</span></span>
          </label>
        </div>
        <button className="av-btn av-btn-success" disabled={!declared||submitting} onClick={submit}>
          {submitting ? "⏳ Submitting…" : "🚀 Submit Verification"}
        </button>
        <button className="av-btn av-btn-outline" onClick={()=>goStep(2)}>← Back</button>
      </>)}

      {step===4 && (
        <div className="av-card av-success-wrap">
          <div className="av-success-icon">✅</div>
          <h2 style={{color:"var(--success)",fontSize:21,fontWeight:800,marginBottom:8}}>Submitted Successfully!</h2>
          <p style={{color:"var(--muted)",fontSize:14,lineHeight:1.6,maxWidth:320,margin:"0 auto"}}>Your residential address verification has been submitted. Our team will review it shortly.</p>
          <div className="av-success-id-box">
            <div className="av-sid-lbl">Verification ID</div>
            <div className="av-sid-val">{verId}</div>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>Save this for your records</div>
          </div>
          <p style={{fontSize:12,color:"var(--muted)"}}>You may now close this page.</p>
        </div>
      )}
    </div>
  );
}
