(() => {
  "use strict";
  const places = window.DONSKOY_PLACES || [];
  const categoryNames = {
    all: "Все места", history: "История", architecture: "Архитектура",
    memorial: "Памятные места", leisure: "Отдых"
  };
  const $ = (selector) => document.querySelector(selector);
  const mapList = $("#map-place-list");
  const grid = $("#place-grid");
  const count = $("#result-count");
  const catalogCount = $("#catalog-count");
  const emptyState = $("#empty-state");
  const searchInput = $("#search-input");
  const favoritesToggle = $("#favorites-toggle");
  let activeCategory = "all";
  let favoritesOnly = false;
  let favorites = readFavorites();
  let map = null;
  let markers = new Map();
  let markerLayer = null;
  let toastTimer;

  function readFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem("donskoy-favorites") || "[]")); }
    catch (_) { return new Set(); }
  }
  function saveFavorites() {
    try { localStorage.setItem("donskoy-favorites", JSON.stringify([...favorites])); }
    catch (_) { showToast("Не удалось сохранить избранное в этом браузере."); }
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }
  function getFilteredPlaces() {
    const query = searchInput.value.trim().toLocaleLowerCase("ru");
    return places.filter((place) => {
      const matchesCategory = activeCategory === "all" || place.category === activeCategory;
      const searchable = `${place.name} ${place.address} ${place.description} ${place.categoryLabel}`.toLocaleLowerCase("ru");
      const matchesQuery = !query || searchable.includes(query);
      const matchesFavorites = !favoritesOnly || favorites.has(place.id);
      return matchesCategory && matchesQuery && matchesFavorites;
    });
  }
  function markerIcon(place) {
    const colors = {history:"#c87551", architecture:"#557a69", memorial:"#b29a6a", leisure:"#7e9a74"};
    return L.divIcon({
      className: "custom-map-marker",
      html: `<span style="display:grid;place-items:center;width:32px;height:32px;border-radius:50% 50% 50% 8px;transform:rotate(-45deg);background:${colors[place.category] || "#173f35"};border:2px solid #fffdf7;box-shadow:0 3px 9px #173f3540"><span style="transform:rotate(45deg);font-size:12px;font-weight:800;color:white">${escapeHTML(place.icon || "•")}</span></span>`,
      iconSize: [32, 38], iconAnchor: [16, 34], popupAnchor: [0, -30]
    });
  }
  function initMap() {
    const fallbackCenter = [53.9715, 38.3300];
    if (!window.L) {
      $("#map").innerHTML = '<div class="map-load-error">Не удалось загрузить библиотеку карты. Проверьте подключение к интернету и обновите страницу.</div>';
      return;
    }
    map = L.map("map", {scrollWheelZoom: false}).setView(fallbackCenter, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    markerLayer = L.featureGroup().addTo(map);
    places.forEach((place) => {
      const marker = L.marker(place.coords, {icon: markerIcon(place), title: place.name});
      marker.bindPopup(`<div class="popup-category">${escapeHTML(place.categoryLabel)}</div><div class="popup-title">${escapeHTML(place.name)}</div><div>${escapeHTML(place.short)}</div><a class="popup-link" href="#places-section" data-open-place="${escapeHTML(place.id)}">Подробнее →</a>`);
      marker.on("click", () => highlightListItem(place.id));
      markers.set(place.id, marker);
    });
    render();
    setTimeout(() => map && map.invalidateSize(), 250);
  }
  function renderMapMarkers(filtered) {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    filtered.forEach(place => {
      const marker = markers.get(place.id);
      if (marker) marker.addTo(markerLayer);
    });
    if (filtered.length) {
      const bounds = markerLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), {maxZoom: 14, animate: false});
    }
  }
  function renderList(filtered) {
    mapList.innerHTML = "";
    if (!filtered.length) {
      mapList.innerHTML = '<p class="sidebar-empty">По вашему запросу ничего не найдено.</p>';
    } else {
      filtered.forEach((place, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "map-place-item";
        item.dataset.placeId = place.id;
        item.innerHTML = `<span class="place-number">${String(index + 1).padStart(2, "0")}</span><span><b>${escapeHTML(place.name)}</b><small>${escapeHTML(place.categoryLabel)} · ${escapeHTML(place.address)}</small></span>`;
        item.addEventListener("click", () => focusPlace(place));
        mapList.appendChild(item);
      });
    }
    count.textContent = `${filtered.length} ${pluralPlaces(filtered.length)}`;
  }
  function renderCards(filtered) {
    grid.innerHTML = "";
    emptyState.hidden = filtered.length !== 0;
    if (!filtered.length) {
      catalogCount.textContent = "Нет объектов по выбранным условиям";
      return;
    }
    catalogCount.textContent = favoritesOnly ? `Избранное · ${filtered.length}` : `Объектов в подборке: ${filtered.length}`;
    filtered.forEach((place) => {
      const card = document.createElement("article");
      card.className = "place-card";
      card.innerHTML = `
        <div class="place-visual">
          <div class="visual-fallback"><span class="visual-icon">${escapeHTML(place.icon || "⌖")}</span><span>${escapeHTML(place.categoryLabel.toUpperCase())}</span></div>
          ${place.image ? `<img src="${escapeHTML(place.image)}" alt="${escapeHTML(place.name)}" loading="lazy" onerror="this.remove()">` : ""}
          <span class="place-tag">${escapeHTML(place.categoryLabel)}</span>
          <button class="favorite-button ${favorites.has(place.id) ? "active" : ""}" data-favorite="${escapeHTML(place.id)}" aria-label="${favorites.has(place.id) ? "Убрать из избранного" : "Добавить в избранное"}" aria-pressed="${favorites.has(place.id)}">${favorites.has(place.id) ? "♥" : "♡"}</button>
        </div>
        <div class="place-content">
          <h3>${escapeHTML(place.name)}</h3>
          <p>${escapeHTML(place.description)}</p>
          <div class="place-meta"><span title="${escapeHTML(place.address)}">⌖ ${escapeHTML(place.address)}</span><button type="button" data-show-map="${escapeHTML(place.id)}">На карте ↗</button></div>
        </div>`;
      grid.appendChild(card);
    });
  }
  function render() {
    const filtered = getFilteredPlaces();
    renderList(filtered);
    renderCards(filtered);
    renderMapMarkers(filtered);
    favoritesToggle.setAttribute("aria-pressed", String(favoritesOnly));
    favoritesToggle.innerHTML = favoritesOnly ? "♥ Показать все" : "♡ Избранное";
  }
  function focusPlace(place) {
    if (map && markers.has(place.id)) {
      map.setView(place.coords, 16, {animate: true});
      markers.get(place.id).openPopup();
      $("#map-section").scrollIntoView({behavior: "smooth", block: "start"});
    }
    highlightListItem(place.id);
  }
  function highlightListItem(id) {
    mapList.querySelectorAll(".map-place-item").forEach(item => {
      item.style.background = item.dataset.placeId === id ? "#e9efe4" : "";
    });
  }
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }
  function pluralPlaces(n) {
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return "мест";
    switch (n % 10) { case 1: return "место"; case 2: case 3: case 4: return "места"; default: return "мест"; }
  }
  document.addEventListener("click", (event) => {
    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton) {
      activeCategory = categoryButton.dataset.category;
      document.querySelectorAll(".filter-chip").forEach(button => button.classList.toggle("active", button === categoryButton));
      render();
      return;
    }
    const favoriteButton = event.target.closest("[data-favorite]");
    if (favoriteButton) {
      const id = favoriteButton.dataset.favorite;
      if (favorites.has(id)) { favorites.delete(id); showToast("Удалено из избранного"); }
      else { favorites.add(id); showToast("Добавлено в избранное"); }
      saveFavorites(); render(); return;
    }
    const showButton = event.target.closest("[data-show-map]");
    if (showButton) {
      const place = places.find(item => item.id === showButton.dataset.showMap);
      if (place) focusPlace(place);
      return;
    }
    const popupLink = event.target.closest("[data-open-place]");
    if (popupLink) {
      const place = places.find(item => item.id === popupLink.dataset.openPlace);
      if (place) setTimeout(() => focusPlace(place), 150);
    }
  });
  searchInput.addEventListener("input", render);
  favoritesToggle.addEventListener("click", () => { favoritesOnly = !favoritesOnly; render(); });
  $("#map-reset").addEventListener("click", () => {
    if (map) {
      map.setView([53.9715, 38.3300], 13, {animate: true});
      showToast("Показан общий вид карты");
    }
  });
  const menuToggle = $("#menu-toggle");
  menuToggle.addEventListener("click", () => {
    const nav = $(".main-nav");
    const open = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.textContent = open ? "×" : "☰";
  });
  document.querySelectorAll(".main-nav a").forEach(link => link.addEventListener("click", () => {
    $(".main-nav").classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
  }));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMap);
  else initMap();
})();