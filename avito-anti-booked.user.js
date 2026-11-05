// ==UserScript==
// @name         Avito — скрытие/подсветка «Забронировано» (v7.5)
// @namespace    http://tampermonkey.net/
// @version      7.5
// @icon         https://www.avito.st/dstatic/favicon.ico
// @description  Выделяет красным или скрывает карточки с пометкой "Забронировано" на Avito
// @author       p166
// @license      MIT
// @homepageURL  https://github.com/p166/avito-anti-booked
// @source       https://github.com/p166/avito-anti-booked.git
// @supportURL   https://github.com/p166/avito-anti-booked/issues
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
  const BLACKLIST_ENABLED_KEY = 'avito_seller_blacklist_enabled';
  const BLACKLIST_SELLERS_KEY = 'avito_seller_blacklist';
  const BLACKLIST_BRANDS_KEY = 'avito_brand_blacklist';
  const BLACKLIST_SELLER_NAMES_KEY = 'avito_seller_blacklist_names';
  const BLACKLIST_BRAND_NAMES_KEY = 'avito_brand_blacklist_names';
  const BLACKLIST_DIALOG_ID = 'avito-blacklist-manager-dialog';
  const BUTTON_ID = 'avito-booked-toggle-btn';
  const BLACKLIST_BUTTON_ID = 'avito-seller-blacklist-toggle-btn';
  const BLACKLIST_EDIT_BUTTON_ID = 'avito-seller-blacklist-edit-btn';

  // Тексты для кнопки
  const TEXT_HIDDEN = '🚫 Скрыто';
  const TEXT_VISIBLE = '👁️ Показано';

  // Состояние: true = скрывать, false = подсвечивать
  let isHideMode = true;
  let isSellerBlacklistEnabled = true;
  let blockedSellerKeys = [];
  let blockedBrandKeys = [];
  let blockedSellerNames = {};
  let blockedBrandNames = {};
  
  try {
    isHideMode = GM_getValue(STORAGE_KEY, true);
  } catch (e) {
    isHideMode = localStorage.getItem(STORAGE_KEY) !== 'false';
  }

  try {
    isSellerBlacklistEnabled = GM_getValue(BLACKLIST_ENABLED_KEY, true);
    blockedSellerKeys = GM_getValue(BLACKLIST_SELLERS_KEY, []);
    blockedBrandKeys = GM_getValue(BLACKLIST_BRANDS_KEY, []);
    blockedSellerNames = GM_getValue(BLACKLIST_SELLER_NAMES_KEY, {});
    blockedBrandNames = GM_getValue(BLACKLIST_BRAND_NAMES_KEY, {});
  } catch (e) {
    isSellerBlacklistEnabled = localStorage.getItem(BLACKLIST_ENABLED_KEY) !== 'false';
    try {
      blockedSellerKeys = JSON.parse(localStorage.getItem(BLACKLIST_SELLERS_KEY) || '[]');
    } catch (parseError) {
      blockedSellerKeys = [];
    }
    try {
      blockedBrandKeys = JSON.parse(localStorage.getItem(BLACKLIST_BRANDS_KEY) || '[]');
    } catch (parseError) {
      blockedBrandKeys = [];
    }
    try {
      blockedSellerNames = JSON.parse(localStorage.getItem(BLACKLIST_SELLER_NAMES_KEY) || '{}');
    } catch (parseError) {
      blockedSellerNames = {};
    }
    try {
      blockedBrandNames = JSON.parse(localStorage.getItem(BLACKLIST_BRAND_NAMES_KEY) || '{}');
    } catch (parseError) {
      blockedBrandNames = {};
    }
  }

  function getSellerKey(value) {
    const text = value.trim();
    if (!text) return '';

    try {
      const url = new URL(text, location.origin);
      const match = url.pathname.match(/^\/user\/([^/]+)/);
      if (match) return decodeURIComponent(match[1]).toLowerCase();
    } catch (e) {}

    return text.replace(/^@/, '').toLowerCase();
  }

  function getBrandKey(value) {
    const text = value.trim();
    if (!text) return '';

    try {
      const url = new URL(text, location.origin);
      const match = url.pathname.match(/^\/brands\/([^/]+)/);
      if (match) return decodeURIComponent(match[1]).toLowerCase();
    } catch (e) {}

    return text.toLowerCase();
  }

  function getSellerKeyFromLink(link) {
    try {
      const url = new URL(link.getAttribute('href'), location.origin);
      const match = url.pathname.match(/^\/user\/([^/]+)/);
      return match ? decodeURIComponent(match[1]).toLowerCase() : '';
    } catch (e) {
      return '';
    }
  }

  function getBrandKeyFromLink(link) {
    try {
      const url = new URL(link.getAttribute('href'), location.origin);
      const match = url.pathname.match(/^\/brands\/([^/]+)/);
      return match ? decodeURIComponent(match[1]).toLowerCase() : '';
    } catch (e) {
      return '';
    }
  }

  function getBlacklistEntryLink(type, key) {
    return Array.from(document.querySelectorAll('a[href]')).find(link => {
      const linkKey = type === 'brand'
        ? getBrandKeyFromLink(link)
        : getSellerKeyFromLink(link);
      return linkKey === key;
    });
  }

  function getBlacklistDisplayName(type, key) {
    const names = type === 'brand' ? blockedBrandNames : blockedSellerNames;
    const fallbackName = type === 'brand' ? 'Название не найдено' : 'Имя не найдено';
    if (names[key] && names[key] !== fallbackName) return names[key];

    const link = getBlacklistEntryLink(type, key);
    const name = link && (link.innerText || link.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name) {
      names[key] = name;
      return name;
    }

    return fallbackName;
  }

  function getBlacklistEntryUrl(type, key) {
    const link = getBlacklistEntryLink(type, key);
    if (link) return link.href;
    return type === 'brand'
      ? `https://www.avito.ru/brands/${encodeURIComponent(key)}`
      : `https://www.avito.ru/user/${encodeURIComponent(key)}/profile`;
  }

  function getSellerKeysInScope(scope) {
    return new Set(Array.from(scope.querySelectorAll('a[href]'))
      .map(getSellerKeyFromLink)
      .filter(Boolean));
  }

  function getBrandKeysInScope(scope) {
    return new Set(Array.from(scope.querySelectorAll('a[href]'))
      .map(getBrandKeyFromLink)
      .filter(Boolean));
  }

  function saveBlacklist() {
    try {
      GM_setValue(BLACKLIST_ENABLED_KEY, isSellerBlacklistEnabled);
      GM_setValue(BLACKLIST_SELLERS_KEY, blockedSellerKeys);
      GM_setValue(BLACKLIST_BRANDS_KEY, blockedBrandKeys);
      GM_setValue(BLACKLIST_SELLER_NAMES_KEY, blockedSellerNames);
      GM_setValue(BLACKLIST_BRAND_NAMES_KEY, blockedBrandNames);
    } catch (e) {}
    localStorage.setItem(BLACKLIST_ENABLED_KEY, isSellerBlacklistEnabled);
    localStorage.setItem(BLACKLIST_SELLERS_KEY, JSON.stringify(blockedSellerKeys));
    localStorage.setItem(BLACKLIST_BRANDS_KEY, JSON.stringify(blockedBrandKeys));
    localStorage.setItem(BLACKLIST_SELLER_NAMES_KEY, JSON.stringify(blockedSellerNames));
    localStorage.setItem(BLACKLIST_BRAND_NAMES_KEY, JSON.stringify(blockedBrandNames));
  }

  function updateBlacklistToggleButton() {
    const toggleBtn = document.getElementById(BLACKLIST_BUTTON_ID);
    if (!toggleBtn) return;
    toggleBtn.textContent = `🚫 Фильтр: ${isSellerBlacklistEnabled ? 'вкл' : 'выкл'}`;
    toggleBtn.style.background = isSellerBlacklistEnabled ? '#333' : '#2ecc71';
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

  function clearHideStyle(card) {
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
  }

  function applyHighlightStyle(card) {
    clearHideStyle(card);
    card.style.outline = '3px solid red';
    card.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.4)';
  }

  function applyBlacklistHighlightStyle(card) {
    clearHideStyle(card);
    card.style.outline = '3px solid #111';
    card.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.35)';
  }

  function restoreCardStyle(card) {
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
    card.style.outline = '';
    card.style.boxShadow = '';
  }

  function refreshCard(card) {
    const isBlacklisted = card.dataset.blacklistedSeller === '1' ||
      card.dataset.blacklistedBrand === '1';
    const isBooked = card.dataset.broned === '1';

    if ((isSellerBlacklistEnabled && isBlacklisted) || (isBooked && isHideMode)) {
      applyHideStyle(card);
    } else if (isBlacklisted) {
      applyBlacklistHighlightStyle(card);
    } else if (isBooked) {
      applyHighlightStyle(card);
    } else {
      restoreCardStyle(card);
    }
  }

  // ── Основная логика ───────────────────────────────────────
  function getElementsInScope(scope, selector) {
    const elements = [];
    if (scope.nodeType === 1 && scope.matches(selector)) elements.push(scope);
    elements.push(...scope.querySelectorAll(selector));
    return elements;
  }

  function processBadges(scope = document) {
    const allSpans = getElementsInScope(scope, 'span');

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
        refreshCard(card);
      }
    }
  }

  function processBlacklistedSellers(scope = document) {
    const blockedKeys = new Set(blockedSellerKeys);
    const cards = getElementsInScope(scope, '[data-marker="item"]');

    cards.forEach(card => {
      const wasBlocked = card.dataset.blacklistedSeller === '1';
      const isBlocked = Array.from(card.querySelectorAll('a[href]')).some(link => {
        const sellerKey = getSellerKeyFromLink(link);
        return sellerKey && blockedKeys.has(sellerKey);
      });

      if (isBlocked) {
        card.dataset.blacklistedSeller = '1';
        refreshCard(card);
      } else if (wasBlocked) {
        delete card.dataset.blacklistedSeller;
        refreshCard(card);
      }
    });
  }

  function processBlacklistedBrands(scope = document) {
    const blockedKeys = new Set(blockedBrandKeys);
    const cards = getElementsInScope(scope, '[data-marker="item"]');

    cards.forEach(card => {
      const wasBlocked = card.dataset.blacklistedBrand === '1';
      const isBlocked = Array.from(card.querySelectorAll('a[href]')).some(link => {
        const brandKey = getBrandKeyFromLink(link);
        return brandKey && blockedKeys.has(brandKey);
      });

      if (isBlocked) {
        card.dataset.blacklistedBrand = '1';
        refreshCard(card);
      } else if (wasBlocked) {
        delete card.dataset.blacklistedBrand;
        refreshCard(card);
      }
    });
  }

  function getSellerKeyForContactAction(action) {
    const itemCard = action.closest('[data-marker="item"]');
    if (itemCard) {
      const keys = getSellerKeysInScope(itemCard);
      return keys.size === 1 ? keys.values().next().value : '';
    }

    let scope = action.parentElement;
    let depth = 0;
    while (scope && scope !== document.body && depth < 14) {
      const keys = getSellerKeysInScope(scope);
      if (keys.size === 1) return keys.values().next().value;
      if (keys.size > 1) return '';
      scope = scope.parentElement;
      depth += 1;
    }
    return '';
  }

  function updateBlacklistActionButton(button) {
    const isBrand = button.dataset.blacklistType === 'brand';
    const list = isBrand ? blockedBrandKeys : blockedSellerKeys;
    const isBlocked = list.includes(button.dataset.blacklistKey);
    const label = isBrand ? 'бренд' : 'продавца';
    button.textContent = isBlocked ? '✓' : '⛔';
    button.title = isBlocked ? `Разблокировать ${label}` : `Заблокировать ${label}`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(isBlocked));
  }

  function updateBlacklistActionLabels() {
    document.querySelectorAll('[data-avito-blacklist-action="1"]')
      .forEach(updateBlacklistActionButton);
  }

  function createBlacklistAction(type, key, displayName = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.avitoBlacklistAction = '1';
    button.dataset.blacklistType = type;
    button.dataset.blacklistKey = key;
    button.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid #d5d5d5;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.96);
      color: #222;
      font: 14px/1 sans-serif;
      cursor: pointer;
      vertical-align: middle;
    `;
    updateBlacklistActionButton(button);

    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();

      const list = type === 'brand' ? blockedBrandKeys : blockedSellerKeys;
      const index = list.indexOf(key);
      if (index >= 0) {
        list.splice(index, 1);
        const names = type === 'brand' ? blockedBrandNames : blockedSellerNames;
        delete names[key];
      } else {
        list.push(key);
        const names = type === 'brand' ? blockedBrandNames : blockedSellerNames;
        const name = displayName.trim() || getBlacklistDisplayName(type, key);
        if (name !== 'Имя не найдено' && name !== 'Название не найдено') {
          names[key] = name;
        }
      }
      isSellerBlacklistEnabled = true;
      saveBlacklist();
      updateBlacklistToggleButton();
      updateBlacklistActionLabels();
      processBlacklistedSellers();
      processBlacklistedBrands();
    };

    return button;
  }

  function processBlacklistActions(scope = document) {
    const actions = getElementsInScope(scope, 'button, a, [role="button"]');
    actions.forEach(action => {
      const label = (action.innerText || action.textContent || '').trim();
      const ariaLabel = (action.getAttribute('aria-label') || '').trim();
      if (!label.startsWith('Написать') && !ariaLabel.startsWith('Написать')) return;

      const itemCard = action.closest('[data-marker="item"]');
      const sellerKey = getSellerKeyForContactAction(action);
      if (!sellerKey) return;

      const existingSellerAction = itemCard?.querySelector(
        '[data-avito-blacklist-action="1"][data-blacklist-type="seller"]'
      );
      if (existingSellerAction) return;

      const sellerLink = itemCard
        ? Array.from(itemCard.querySelectorAll('a[href]'))
          .find(link => getSellerKeyFromLink(link) === sellerKey)
        : getBlacklistEntryLink('seller', sellerKey);
      if (itemCard && !sellerLink) return;

      const displayName = sellerLink && (sellerLink.innerText || sellerLink.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      const button = createBlacklistAction('seller', sellerKey, displayName);
      if (itemCard) {
        button.style.marginLeft = '4px';
        sellerLink.insertAdjacentElement('afterend', button);
      } else if (action.nextElementSibling?.dataset.blacklistType !== 'seller') {
        button.style.marginLeft = '4px';
        action.insertAdjacentElement('afterend', button);
      }
    });

    const brandLinks = getElementsInScope(scope, 'a[href]');
    brandLinks.forEach(link => {
      const brandKey = getBrandKeyFromLink(link);
      if (!brandKey) return;

      const itemCard = link.closest('[data-marker="item"]');
      const existingButtons = itemCard
        ? itemCard.querySelectorAll('[data-avito-blacklist-action="1"][data-blacklist-type="brand"]')
        : [];
      if (Array.from(existingButtons).some(button => button.dataset.blacklistKey === brandKey)) return;
      if (!itemCard && link.nextElementSibling?.dataset.blacklistType === 'brand') return;

      const displayName = (link.innerText || link.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      const button = createBlacklistAction('brand', brandKey, displayName);
      button.style.marginLeft = '4px';
      link.insertAdjacentElement('afterend', button);
    });
  }

  // ── Обновление всех карточек при переключении ─────────────
  function refreshAllCards() {
    const cards = document.querySelectorAll(
      '[data-broned="1"], [data-blacklisted-seller="1"], [data-blacklisted-brand="1"]'
    );
    cards.forEach(refreshCard);
  }

  // ── Кнопка ─────────────────────────────────────────────────
  function createToggleButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('div');
    btn.id = BUTTON_ID;
    btn.innerHTML = isHideMode ? TEXT_HIDDEN : TEXT_VISIBLE;
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

      btn.innerHTML = isHideMode ? TEXT_HIDDEN : TEXT_VISIBLE;
      btn.style.background = isHideMode ? '#333' : '#2ecc71';

      refreshAllCards();
    };

    document.body.appendChild(btn);
  }

  function createBlacklistManagerDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = BLACKLIST_DIALOG_ID;
    dialog.innerHTML = `
      <form>
        <header>
          <h2>Списки блокировки</h2>
          <button type="button" data-action="close" aria-label="Закрыть">×</button>
        </header>
        <div class="lists">
          <section>
            <h3>Продавцы <small>user</small></h3>
            <div class="entries" data-list="sellers"></div>
          </section>
          <section>
            <h3>Бренды <small>brands</small></h3>
            <div class="entries" data-list="brands"></div>
          </section>
        </div>
        <p>Новые записи добавляются значками в карточках. Удалите лишние и нажмите «Сохранить».</p>
        <footer>
          <button type="button" data-action="cancel">Отмена</button>
          <button type="button" data-action="save">Сохранить</button>
        </footer>
      </form>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #${BLACKLIST_DIALOG_ID} {
        width: min(1200px, calc(100vw - 48px)) !important;
        height: min(820px, calc(100vh - 48px)) !important;
        max-width: calc(100vw - 40px) !important;
        max-height: calc(100vh - 40px) !important;
        overflow: auto;
        padding: 0;
        border: 1px solid #d5d5d5;
        border-radius: 8px;
        color: #222;
        background: #fff;
        font: 16px/1.5 sans-serif;
      }
      #${BLACKLIST_DIALOG_ID}::backdrop { background: rgba(0, 0, 0, 0.45); }
      #${BLACKLIST_DIALOG_ID} form { padding: 28px; }
      #${BLACKLIST_DIALOG_ID} header,
      #${BLACKLIST_DIALOG_ID} footer { display: flex; align-items: center; gap: 12px; }
      #${BLACKLIST_DIALOG_ID} header { justify-content: space-between; margin-bottom: 22px; }
      #${BLACKLIST_DIALOG_ID} h2 { margin: 0; font-size: 24px; }
      #${BLACKLIST_DIALOG_ID} .lists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
      #${BLACKLIST_DIALOG_ID} h3 { margin: 0 0 12px; font-size: 20px; }
      #${BLACKLIST_DIALOG_ID} small { color: #666; font-weight: 400; }
      #${BLACKLIST_DIALOG_ID} .entries { display: grid; gap: 8px; max-height: min(440px, 55vh); overflow: auto; }
      #${BLACKLIST_DIALOG_ID} .entry { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 50px; padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 6px; }
      #${BLACKLIST_DIALOG_ID} .entry a { flex: 1; min-width: 0; overflow: hidden; color: #222; font-size: 16px; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
      #${BLACKLIST_DIALOG_ID} .entry a:hover { text-decoration: underline; }
      #${BLACKLIST_DIALOG_ID} .entry button { flex: 0 0 40px; width: 40px; height: 40px; border: 1px solid #bbb; border-radius: 6px; background: #fff; color: #222; font-size: 24px; cursor: pointer; }
      #${BLACKLIST_DIALOG_ID} .empty { margin: 0; padding: 16px; color: #777; }
      #${BLACKLIST_DIALOG_ID} p { margin: 14px 0 20px; color: #666; font-size: 15px; }
      #${BLACKLIST_DIALOG_ID} footer { justify-content: flex-end; }
      #${BLACKLIST_DIALOG_ID} footer button,
      #${BLACKLIST_DIALOG_ID} header button { padding: 11px 18px; border: 1px solid #bbb; border-radius: 4px; background: #fff; color: #222; font-size: 15px; cursor: pointer; }
      #${BLACKLIST_DIALOG_ID} footer [data-action="save"] { border-color: #222; background: #222; color: #fff; }
      #${BLACKLIST_DIALOG_ID} header button { width: 40px; height: 40px; padding: 0; font-size: 26px; }
      @media (max-width: 560px) { #${BLACKLIST_DIALOG_ID} form { padding: 18px; } #${BLACKLIST_DIALOG_ID} .lists { grid-template-columns: 1fr; } #${BLACKLIST_DIALOG_ID} .entries { max-height: min(240px, 32vh); } }
    `;
    dialog.prepend(style);
    dialog.style.setProperty('width', 'min(1200px, calc(100vw - 48px))', 'important');
    dialog.style.setProperty('height', 'min(820px, calc(100vh - 48px))', 'important');
    dialog.style.setProperty('max-width', 'calc(100vw - 40px)', 'important');
    dialog.style.setProperty('max-height', 'calc(100vh - 40px)', 'important');

    const sellerList = dialog.querySelector('[data-list="sellers"]');
    const brandList = dialog.querySelector('[data-list="brands"]');
    let editingSellerKeys = [];
    let editingBrandKeys = [];

    function renderEntries(type) {
      const container = type === 'brand' ? brandList : sellerList;
      const keys = type === 'brand' ? editingBrandKeys : editingSellerKeys;
      container.replaceChildren();

      if (!keys.length) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'Список пуст';
        container.appendChild(empty);
        return;
      }

      keys.forEach((key, index) => {
        const row = document.createElement('div');
        row.className = 'entry';

        const nameLink = document.createElement('a');
        nameLink.textContent = getBlacklistDisplayName(type, key);
        nameLink.href = getBlacklistEntryUrl(type, key);
        nameLink.target = '_blank';
        nameLink.rel = 'noopener noreferrer';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.title = 'Удалить из списка';
        removeButton.setAttribute('aria-label', `Удалить ${nameLink.textContent}`);
        removeButton.onclick = () => {
          keys.splice(index, 1);
          renderEntries(type);
        };

        row.append(nameLink, removeButton);
        container.appendChild(row);
      });
    }

    const closeDialog = () => dialog.close();

    dialog.querySelector('[data-action="close"]').onclick = closeDialog;
    dialog.querySelector('[data-action="cancel"]').onclick = closeDialog;
    dialog.querySelector('[data-action="save"]').onclick = () => {
      blockedSellerKeys = editingSellerKeys.slice();
      blockedBrandKeys = editingBrandKeys.slice();
      blockedSellerNames = Object.fromEntries(blockedSellerKeys.map(key => [
        key,
        getBlacklistDisplayName('seller', key)
      ]));
      blockedBrandNames = Object.fromEntries(blockedBrandKeys.map(key => [
        key,
        getBlacklistDisplayName('brand', key)
      ]));
      saveBlacklist();
      updateBlacklistActionLabels();
      processBlacklistedSellers();
      processBlacklistedBrands();
      dialog.close();
    };
    dialog.openBlacklistManager = () => {
      editingSellerKeys = blockedSellerKeys.slice();
      editingBrandKeys = blockedBrandKeys.slice();
      renderEntries('seller');
      renderEntries('brand');
      dialog.showModal();
    };
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog();
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  function createBlacklistButtons() {
    if (!document.getElementById(BLACKLIST_BUTTON_ID)) {
      const toggleBtn = document.createElement('div');
      toggleBtn.id = BLACKLIST_BUTTON_ID;
      toggleBtn.style.cssText = `
        position: fixed;
        bottom: 68px;
        right: 20px;
        background: #333;
        color: #fff;
        padding: 10px 16px;
        border-radius: 25px;
        cursor: pointer;
        z-index: 99999;
        font-family: sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 2px solid #fff;
        user-select: none;
      `;

      toggleBtn.onclick = () => {
        isSellerBlacklistEnabled = !isSellerBlacklistEnabled;
        saveBlacklist();
        updateBlacklistToggleButton();
        processBlacklistedSellers();
        processBlacklistedBrands();
      };

      document.body.appendChild(toggleBtn);
      updateBlacklistToggleButton();
    }

    if (!document.getElementById(BLACKLIST_EDIT_BUTTON_ID)) {
      const editBtn = document.createElement('div');
      editBtn.id = BLACKLIST_EDIT_BUTTON_ID;
      editBtn.textContent = '✎ Списки user / brands';
      editBtn.style.cssText = `
        position: fixed;
        bottom: 116px;
        right: 20px;
        background: #333;
        color: #fff;
        padding: 10px 16px;
        border-radius: 25px;
        cursor: pointer;
        z-index: 99999;
        font-family: sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 2px solid #fff;
        user-select: none;
      `;

      const dialog = document.getElementById(BLACKLIST_DIALOG_ID) || createBlacklistManagerDialog();
      editBtn.onclick = () => dialog.openBlacklistManager();

      document.body.appendChild(editBtn);
    }
  }

  // ── Инициализация ──────────────────────────────────────────
  function init() {
    processBadges();
    processBlacklistedSellers();
    processBlacklistedBrands();
    processBlacklistActions();
    createToggleButton();
    createBlacklistButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  const pendingScanRoots = new Set();
  let scanScheduled = false;

  const observer = new MutationObserver(records => {

    records.forEach(record => {
      const nodes = Array.from(record.addedNodes).filter(node =>
        !(node.nodeType === 1 && node.matches('[data-avito-blacklist-action="1"]'))
      );
      if (!nodes.length && record.removedNodes.length) nodes.push(record.target);

      nodes.forEach(node => {
        const element = node.nodeType === 1 ? node : node.parentElement || record.target;
        if (!element || element.nodeType !== 1) return;

        const card = element.closest('[data-marker="item"]');
        if (card) {
          pendingScanRoots.add(card);
          return;
        }

        getElementsInScope(element, '[data-marker="item"]').forEach(item => pendingScanRoots.add(item));

        const contact = element.closest('[data-marker="item-contact"]');
        if (contact) pendingScanRoots.add(contact);
        getElementsInScope(element, '[data-marker="item-contact"]').forEach(item => pendingScanRoots.add(item));
      });
    });

    if (!pendingScanRoots.size || scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      const roots = Array.from(pendingScanRoots);
      pendingScanRoots.clear();
      scanScheduled = false;
      roots.forEach(root => {
        processBadges(root);
        processBlacklistedSellers(root);
        processBlacklistedBrands(root);
        processBlacklistActions(root);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();
