/* ------------------------------------------------------------------ */
/*  CSS Animations + Responsive (injected once)                        */
/* ------------------------------------------------------------------ */

export const injectStyles = () => {
  if (typeof document === "undefined") return
  const id = "kami-animations"
  if (document.getElementById(id)) return
  const style = document.createElement("style")
  style.id = id
  style.textContent = `
    @keyframes kami-fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes kami-pulse-dot {
      0%, 100% { opacity: 0.2; }
      50% { opacity: 1; }
    }
    @keyframes kami-stream-caret {
      0%, 45% { opacity: 1; }
      46%, 100% { opacity: 0; }
    }
    .kami-fade-in {
      animation: kami-fadeIn 0.3s ease-out;
    }
    .kami-msg-enter {
      animation: kami-fadeIn 0.25s ease-out;
    }
    .kami-thinking-dot { animation: kami-pulse-dot 1.4s infinite ease-in-out; }
    .kami-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
    .kami-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
    .kami-stream-caret {
      display: inline-block;
      width: 2px;
      height: 1em;
      margin-left: 3px;
      border-radius: 999px;
      background: currentColor;
      animation: kami-stream-caret 1s infinite;
      vertical-align: -0.12em;
    }
    @keyframes kami-slideInLeft {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes kami-slideOutLeft {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(-100%); opacity: 0; }
    }
    @keyframes kami-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .kami-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(99, 102, 241, 0.22);
      border-right-color: #6366f1;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: kami-spin 0.8s linear infinite;
      flex-shrink: 0;
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.08);
    }

    /* ===== Consolidated "more tools" expander (topbar ⚙) ===== */
    /* The extra tabs live in a horizontal strip that expands from the gear
       icon. On desktop it grows in place; on mobile it wraps below. */
    @keyframes kami-expand-x {
      from { opacity: 0; transform: translateX(6px) scaleX(0.96); }
      to { opacity: 1; transform: translateX(0) scaleX(1); }
    }
    .kami-more-strip {
      display: flex;
      align-items: center;
      gap: 2px;
      overflow: hidden;
      transform-origin: right center;
      animation: kami-expand-x 0.2s ease-out;
    }
    .kami-more-strip > * {
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      .kami-spinner { animation: none; }
      .kami-more-strip { animation: none; }
    }

    /* ===== MOBILE RESPONSIVE (<768px) ===== */
    @media (max-width: 767px) {
      /* Top bar — compact, single row that scrolls horizontally */
      .kami-topbar { padding: 6px 10px !important; gap: 6px !important; }
      .kami-topbar-left { gap: 6px !important; min-width: 0; }
      .kami-topbar-left .kami-title { display: none !important; }
      .kami-topbar-right {
        gap: 2px !important;
        overflow-x: auto;
        flex-wrap: nowrap;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .kami-topbar-right::-webkit-scrollbar { display: none; }
      .kami-topbar .kami-hamburger-btn { display: inline-flex !important; }
      .kami-topbar .kami-topbar-desktop-btn { display: none !important; }

      /* The more-strip wraps to its own scrollable row on mobile */
      .kami-more-strip {
        overflow-x: auto;
        max-width: 60vw;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .kami-more-strip::-webkit-scrollbar { display: none; }

      /* Sidebar overlay */
      .kami-sidebar-overlay {
        position: fixed !important;
        inset: 0;
        z-index: 50;
        background: rgba(0,0,0,0.4);
      }
      .kami-sidebar-panel {
        position: fixed !important;
        top: 0; left: 0; bottom: 0;
        width: 280px !important;
        max-width: 85vw;
        z-index: 51;
        box-shadow: 4px 0 24px rgba(0,0,0,0.15);
      }
      .kami-sidebar-panel.kami-slide-in-left {
        animation: kami-slideInLeft 0.2s ease-out;
      }
      .kami-sidebar-panel.kami-slide-out-left {
        animation: kami-slideOutLeft 0.2s ease-in forwards;
      }

      /* Chat area */
      .kami-chat-area { padding-left: 8px !important; padding-right: 8px !important; }
      .kami-messages-area { padding: 8px !important; }

      /* Message bubbles — wider on mobile */
      .kami-msg-bubble {
        max-width: 92% !important;
      }

      /* Execution trace — compact */
      .kami-execution-trace .kami-trace-summary { gap: 2px !important; }
      .kami-execution-trace .kami-trace-steps { flex-wrap: wrap !important; }

      /* Input area */
      .kami-input-area {
        padding: 8px 10px !important;
        padding-bottom: max(8px, env(safe-area-inset-bottom, 8px)) !important;
      }
      .kami-input-composer { border-radius: 12px !important; }

      /* Welcome state */
      .kami-welcome { padding: 16px !important; }
      .kami-welcome-suggestions { gap: 6px !important; }
      .kami-welcome-suggestions button { padding: 6px 10px !important; font-size: 11px !important; }

      /* Drawer — Medusa's Drawer adapts but we ensure scroll */
      [data-kami-drawer-body] { max-height: 70vh !important; }

      /* Touch-friendly targets */
      .kami-touch-btn {
        min-width: 36px !important;
        min-height: 36px !important;
        padding: 6px 10px !important;
        font-size: 12px !important;
      }
    }

    /* ===== TABLET (768px–1023px) ===== */
    @media (min-width: 768px) and (max-width: 1023px) {
      .kami-topbar-right { gap: 2px !important; }
      .kami-topbar .kami-topbar-desktop-btn { font-size: 10px !important; padding: 4px 6px !important; }
    }
  `
  document.head.appendChild(style)
}
