// ==UserScript==
// @name         Avito — скрытие/подсветка «Забронировано» (v7.2)
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  Выделяет красным или скрывает карточки с пометкой "Забронировано" на Avito
// @author       https://github.com/p166/avito-anti-booked
// @include      https://www.avito.ru/*
// @match        https://www.avito.ru/*
// @match        https://avito.ru/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BADGE_TEXT = 'Забронировано';
  const STORAGE_KEY = 'avito_booked_mode';
  const BUTTON_ID = 'avito-booked-toggle-btn';

  // Состояние: true = скрывать, false = подсвечивать
  let isHideMode = true;

  try {
    isHideMode = GM_getValue(STORAGE_KEY, true);
  } catch (e) {
    isHideMode = localStorage.getItem(STORAGE_KEY) !== 'false';
  }

  // ── Применение стилей ─────────────────────────────────────
  function applyHideStyle(card) {
    // Используем setProperty для !important
    card.style.setProperty('height', '0', 'important');
    card.style.setProperty('min-height', '0', 'important');
    card.style.setProperty('max-height', '0', 'important');
    card.style.setProperty('margin', '0', 'important');
    card.style.setProperty('padding', '0', 'important');
    card.style.setProperty('border', '0', 'important');
    card.style.setProperty('overflow', 'hidden', 'important');
    card.style.setProperty('opacity', '0', 'important');
    card.style.setProperty('pointer-events', 'none', 'important');
    card.style.setProperty('visibility', 'hidden', 'important');
    card.style.outline = '';
    card.style.boxShadow = '';
  }

  function applyHighlightStyle(card) {
    // Сбрасываем стили скрытия
    card.style.removeProperty('height');
    card.style.removeProperty('min-height');
    card.style.removeProperty('max-height');
    card.style.removeProperty('margin');
    card.style.removeProperty('padding');
    card.style.removeProperty('border');
    card.style.removeProperty('overflow');
    card.style.removeProperty('opacity');
    card.style.removeProperty('pointer-events');
    card.style.removeProperty('visibility');

    // Применяем подсветку
    card.style.outline = '3px solid red';
    card.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.4)';
  }

  // ── Основная логика ───────────────────────────────────────
  function processBadges() {
    const allSpans = document.querySelectorAll('span');

    for (const span of allSpans) {
      if (span.closest('[data-broned="1"]')) continue;
      if (span.textContent.trim() !== BADGE_TEXT) continue;

      let card = span.closest('[data-marker="item"]');

      if (!card) {
        let parent = span.parentElement;
        while (parent) {
          if (parent.getAttribute && parent.getAttribute('data-marker') === 'item') {
            card = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (card && !card.dataset.broned) {
        card.dataset.broned = '1';
        isHideMode ? applyHideStyle(card) : applyHighlightStyle(card);
      }
    }
  }

  // ── Обновление всех карточек при переключении ─────────────
  function refreshAllCards() {
    const cards = document.querySelectorAll('[data-broned="1"]');
    cards.forEach(card => {
      isHideMode ? applyHideStyle(card) : applyHighlightStyle(card);
    });
  }

  // ── Кнопка ─────────────────────────────────────────────────
  function createToggleButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('div');
    btn.id = BUTTON_ID;
    btn.innerHTML = isHideMode ? '🚫 Скрыто' : '👁️ Показано';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: #fff;
      padding: 10px 20px;
      border-radius: 25px;
      cursor: pointer;
      z-index: 99999;
      font-family: sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      border: 2px solid #fff;
      user-select: none;
      transition: background 0.2s;
    `;

    btn.onclick = () => {
      isHideMode = !isHideMode;

      try { GM_setValue(STORAGE_KEY, isHideMode); } catch(e) {}
      localStorage.setItem(STORAGE_KEY, isHideMode);

      btn.innerHTML = isHideMode ? '🚫 Скрыто' : '👁️ Показано';
      btn.style.background = isHideMode ? '#333' : '#2ecc71';

      refreshAllCards();
    };

    document.body.appendChild(btn);
  }

  // ── Инициализация ──────────────────────────────────────────
  function init() {
    processBadges();
    createToggleButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  const observer = new MutationObserver(() => {
    processBadges();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();