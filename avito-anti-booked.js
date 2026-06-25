// ==UserScript==
// @name         Avito — выделить/скрыть «Забронировано» (v6)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Выделяет красным или скрывает карточки с пометкой "Забронировано" на Avito
// @author       You
// @match        https://www.avito.ru/*
// @match        https://avito.ru/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BADGE_TEXT = 'Забронировано';
  // true = скрывать карточки, false = только выделять красным
  const HIDE_BOOKED = false;

  function processBadges() {
    const allSpans = document.querySelectorAll('span');

    for (const span of allSpans) {
      if (span.textContent.trim() !== BADGE_TEXT) continue;

      // Ищем корень карточки по data-marker="item"
      let card = span.closest('[data-marker="item"]');

      if (!card) {
        // Фолбэк: ищем вручную вверх по дереву
        let parent = span.parentElement;
        while (parent) {
          if (parent.getAttribute && parent.getAttribute('data-marker') === 'item') {
            card = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      // Если карточка найдена и мы её ещё не обработали
      if (card && !card.dataset.broned) {
        card.dataset.broned = '1';

        if (HIDE_BOOKED) {
          // "Мягкое" скрытие: убираем всё, что занимает место, но не ломаем сетку
          card.style.height = '0';
          card.style.overflow = 'hidden';
          card.style.margin = '0';
          card.style.padding = '0';
          card.style.border = '0';
          card.style.opacity = '0';
          card.style.pointerEvents = 'none'; // Чтобы нельзя было случайно кликнуть
        } else {
          // Подсвечиваем красным
          card.style.outline = '3px solid red';
          card.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.4)';
          card.style.transition = 'all 0.3s';
        }
      }
    }
  }

  // Запуск при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processBadges);
  } else {
    processBadges();
  }

  // Наблюдатель за изменениями (Avito подгружает список динамически)
  const observer = new MutationObserver((mutations) => {
    setTimeout(processBadges, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();