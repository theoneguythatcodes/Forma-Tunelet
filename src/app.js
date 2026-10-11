"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const audio = $("#audio-element");
  const fileInput = $("#file-input");
  const sidebar = $("#sidebar");
  const toast = $("#toast");

  if (!audio || !fileInput || !sidebar || !toast) {
    console.error("Tunelet: faltan elementos necesarios en index.html.");
    return;
  }

  // Estado de Tunelet
  let tracks = [];
  let currentTrack = null;
  let currentIndex = -1;
  let isPlaying = false;
  let isShuffle = false;
  let isRepeat = false;
  let toastTimer = null;
  let currentView = "home";
  let searchQuery = "";
  let queue = [];
  const objectUrls = [];

  const colors = [
    "#009688",
    "#5c6bc0",
    "#ef6c5b",
    "#7e57c2",
    "#039be5",
    "#8d6e63"
  ];
  // Jamendo API
  const JAMENDO_CLIENT_ID = "19ffe5c5";
  const JAMENDO_API = "https://api.jamendo.com/v3.0/tracks/";


  let jamendoTracks = [];
  let jamendoSearchTimer = null;
  let jamendoRequestId = 0;

  // Favoritos persistentes
  const FAVORITES_KEY = "tunelet-favorites";
  let favoriteIds = new Set();

  try {
    favoriteIds = new Set(
      JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")
    );
  } catch (error) {
    console.warn("Tunelet: no se pudieron cargar los favoritos.", error);
  }

  function saveFavorites() {
    try {
      localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify([...favoriteIds])
      );
    } catch (error) {
      console.error("Tunelet: no se pudieron guardar los favoritos.", error);
      showToast("No se pudieron guardar los favoritos.");
    }
  }


  function getAllTracks() {
    return [...tracks, ...jamendoTracks];
  }


  // Utilidades

  async function searchJamendo(query) {
    const requestId = ++jamendoRequestId;
    const search = query.trim();

    if (!search) {
      jamendoTracks = [];
      renderLibrary();
      return;
    }

    
    const params = new URLSearchParams({
      client_id: JAMENDO_CLIENT_ID,
      format: "json",
      limit: "20",
      search
    });


    try {
      const response = await fetch(`${JAMENDO_API}?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (requestId !== jamendoRequestId) return;

      if (data.headers?.status !== "success") {
        throw new Error(data.headers?.error_message || "Error de Jamendo");
      }

      jamendoTracks = (data.results || [])
        .filter(track => track.audio)
        .map(track => ({
          id: `jamendo-${track.id}`,
          title: track.name,
          artist: track.artist_name || "Artista desconocido",
          album: track.album_name || "Sencillo",
          duration: Number(track.duration) || 0,
          color: colors[Number(track.id) % colors.length],
          type: "jamendo",
          url: track.audio,
          image: track.image || track.album_image || "",
          favorite: favoriteIds.has(`jamendo-${track.id}`)
        }));

      renderLibrary();

      if (!jamendoTracks.length) {
        showToast("No encontramos canciones en Jamendo.");
      }
    } catch (error) {
      console.error("Tunelet / Jamendo:", error);
      showToast("No se pudo conectar con Jamendo.");
    }
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 2600);
  }


  function getTrackById(id) {
    return getAllTracks().find(track => track.id === id);
  }


  
  function getFilteredTracks() {
    const query = searchQuery.trim().toLocaleLowerCase();

    let result = getAllTracks().filter(track => {
      const matchesSearch = !query || [
        track.title,
        track.artist,
        track.album
      ].some(value =>
        String(value ?? "").toLocaleLowerCase().includes(query)
      );

      if (!matchesSearch) return false;

      if (currentView === "favorites") {
        return Boolean(track.favorite);
      }

      return true;
    });

    if (currentView === "artists") {
      const seen = new Set();

      result = result.filter(track => {
        const artist = track.artist.toLocaleLowerCase();

        if (seen.has(artist)) return false;

        seen.add(artist);
        return true;
      });
    }

    if (currentView === "albums") {
      const seen = new Set();

      result = result.filter(track => {
        const album = track.album.toLocaleLowerCase();

        if (seen.has(album)) return false;

        seen.add(album);
        return true;
      });
    }

    return result;
  }


  function artMarkup(track, className = "track-art") {
    if (track.image) {
      return `
        <div class="${className}">
          <img
            src="${escapeHTML(track.image)}"
            alt=""
            loading="lazy"
            onerror="this.style.display='none'"
          >
        </div>
      `;
    }

    return `
      <div class="${className}" style="--track-color: ${track.color || "#009688"}">
        <span class="material-symbol">audiotrack</span>
      </div>
    `;
  }

  // Biblioteca
  function renderLibrary() {
    const container = $("#track-list");
    const empty = $("#empty-state");

    if (!container || !empty) return;

    const filtered = getFilteredTracks();

    container.innerHTML = filtered.map((track, index) => {
      const playing = currentTrack?.id === track.id;
      const duration = Number.isFinite(track.duration) && track.duration > 0
        ? formatTime(track.duration)
        : "—";

      return `
        <div class="track-row ${playing ? "playing" : ""}"
             data-track-row="${escapeHTML(track.id)}">

          <span class="track-number">
            ${playing && isPlaying
              ? '<span class="material-symbol">graphic_eq</span>'
              : index + 1}
          </span>

          <div class="track-title-cell">
            ${artMarkup(track)}

            <div class="track-title-copy">
              <strong title="${escapeHTML(track.title)}">
                ${escapeHTML(track.title)}
              </strong>

              <span title="${escapeHTML(track.artist)}">
                ${escapeHTML(track.artist)}
              </span>
            </div>
          </div>

          <span class="track-origin">${
            track.type === "jamendo" ? "Jamendo" : "Archivo local"
          }</span>
          <span class="track-duration">${duration}</span>

          <div class="track-actions">
            <button class="icon-button ripple"
                    data-play-track="${escapeHTML(track.id)}"
                    aria-label="Reproducir ${escapeHTML(track.title)}">
              <span class="material-symbol">
                ${playing && isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            <button class="icon-button ripple"
                    data-favorite-track="${escapeHTML(track.id)}"
                    aria-label="${track.favorite
                      ? "Quitar de favoritos"
                      : "Añadir a favoritos"}">
              <span class="material-symbol">
                ${track.favorite ? "favorite" : "favorite_border"}
              </span>
            </button>
          </div>
        </div>
      `;
    }).join("");

    empty.hidden = filtered.length > 0;
    container.hidden = filtered.length === 0;

    const count = $("#track-count");

    if (count) {
      count.textContent =
        `${filtered.length} ${filtered.length === 1 ? "canción" : "canciones"}`;
    }

    renderQueue();
  }

  function renderQueue() {
    const container = $("#queue-list");
    const count = $("#queue-count");

    if (count) {
      count.textContent =
        `${queue.length} ${queue.length === 1 ? "canción" : "canciones"}`;
    }

    if (!container) return;

    container.innerHTML = queue.length
      ? queue.map(track => `
          <button class="queue-item ${
            currentTrack?.id === track.id ? "current" : ""
          }"
            data-queue-track="${escapeHTML(track.id)}">

            ${artMarkup(track)}

            <span class="queue-item-copy">
              <strong>${escapeHTML(track.title)}</strong>
              <span>${escapeHTML(track.artist)}</span>
            </span>

            <span class="material-symbol">
              ${currentTrack?.id === track.id ? "graphic_eq" : "play_arrow"}
            </span>
          </button>
        `).join("")
      : '<div class="empty-state"><p>Tu cola está vacía.</p></div>';
  }

  // Reproductor
  function updatePlayer() {
    const track = currentTrack;
    const title = track?.title || "Nada está sonando";
    const artist = track?.artist || "Elige una canción";
    const color = track?.color || colors[0];

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };

    setText("#player-title", title);
    setText("#player-artist", artist);
    setText("#expanded-title", title);

    setText(
      "#expanded-artist",
      track ? `${artist} · ${track.album}` : "Elige una canción de tu biblioteca"
    );

    const miniArt = $("#mini-art");
    if (miniArt) {
      miniArt.style.setProperty("--art-color", color);
    }

    const expandedArt = $("#expanded-art");
    if (expandedArt) {
      expandedArt.style.background =
        `linear-gradient(145deg, ${color}, #263238)`;
    }

    setText(
      "#play-button .material-symbol",
      isPlaying ? "pause" : "play_arrow"
    );

    setText(
      "#expanded-play .material-symbol",
      isPlaying ? "pause" : "play_arrow"
    );

    $("#play-button")?.setAttribute(
      "aria-label",
      isPlaying ? "Pausar" : "Reproducir"
    );

    $("#expanded-play")?.setAttribute(
      "aria-label",
      isPlaying ? "Pausar" : "Reproducir"
    );

    const shuffleButton = $("#shuffle-button");
    const expandedShuffle = $("#expanded-shuffle");
    const expandedRepeat = $("#expanded-repeat");

    if (shuffleButton) {
      shuffleButton.style.color = isShuffle ? "#80cbc4" : "";
    }

    if (expandedShuffle) {
      expandedShuffle.style.color = isShuffle ? "#80cbc4" : "";
    }

    if (expandedRepeat) {
      expandedRepeat.style.color = isRepeat ? "#80cbc4" : "";
    }

    const favorite = Boolean(track?.favorite);

    setText(
      "#favorite-button .material-symbol",
      favorite ? "favorite" : "favorite_border"
    );

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const progress = duration > 0
      ? Math.min(position / duration, 1) * 1000
      : 0;

    setText("#current-time", formatTime(position));
    setText("#expanded-current-time", formatTime(position));
    setText("#total-time", formatTime(duration));
    setText("#expanded-total-time", formatTime(duration));

    const progressControl = $("#progress");
    const expandedProgress = $("#expanded-progress");

    if (progressControl) progressControl.value = progress;
    if (expandedProgress) expandedProgress.value = progress;

    setText(
      "#player-status",
      isPlaying
        ? "Reproduciendo"
        : track
          ? "En pausa"
          : "Listo para reproducir"
    );

    renderLibrary();
  }

  function pausePlayback() {
    audio.pause();
    isPlaying = false;
    updatePlayer();
  }


    async function playTrack(track) {
      if (!track || !track.url) {
        showToast("Esta canción no tiene una URL de audio.");
        return;
      }

      if (currentTrack?.id === track.id && isPlaying) {
        pausePlayback();
        return;
      }

      const allTracks = getAllTracks();
      const sameTrack = currentTrack?.id === track.id;

      if (!sameTrack) {
        audio.pause();

        currentTrack = track;
        currentIndex = allTracks.findIndex(item => item.id === track.id);

        audio.src = track.url;
        console.log("CANCIÓN:", track.title);
        console.log("URL:", track.url);
        console.log("TIPO:", track.type);

        audio.addEventListener("error", () => {
          console.error("ERROR DE AUDIO:", audio.error?.code, audio.error?.message);
        }, { once: true });
        audio.load();
      }

      queue = allTracks;
      updatePlayer();

      try {
        await audio.play();
        isPlaying = true;
        updatePlayer();
      } catch (error) {
        isPlaying = false;
        updatePlayer();

        console.error("Error al reproducir:", error);
        console.error("URL de audio:", track.url);

        if (error.name !== "AbortError") {
          showToast("No se pudo reproducir la canción. Revisa la consola.");
        }
      }
    }


  async function togglePlayback() {
    if (!currentTrack) {
      if (!tracks.length) {
        showToast("Importa archivos de audio para empezar.");
        fileInput.click();
        return;
      }

      await playTrack(tracks[0]);
      return;
    }

    if (isPlaying) {
      pausePlayback();
      return;
    }

    try {
      await audio.play();
      isPlaying = true;
      updatePlayer();
    } catch {
      showToast("No se pudo reanudar la reproducción.");
    }
  }

  function playNext() {
    if (!tracks.length) return;

    let nextIndex;

    if (isShuffle && tracks.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === currentIndex);
    } else {
      nextIndex = currentIndex + 1;
    }

    if (nextIndex >= tracks.length) {
      if (!isRepeat) {
        isPlaying = false;
        audio.pause();
        updatePlayer();
        return;
      }

      nextIndex = 0;
    }

    playTrack(tracks[nextIndex]);
  }

  function playPrevious() {
    if (!tracks.length) return;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      updatePlayer();
      return;
    }

    const previousIndex = currentIndex <= 0
      ? tracks.length - 1
      : currentIndex - 1;

    playTrack(tracks[previousIndex]);
  }

  function seek(value) {
    if (!currentTrack || !Number.isFinite(audio.duration)) return;

    const fraction = Math.max(0, Math.min(1, Number(value) / 1000));

    audio.currentTime = fraction * audio.duration;
    updatePlayer();
  }

  // Panel del reproductor expandido
  function openExpandedPlayer() {
    const panel = $("#expanded-player");
    if (!panel) return;

    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }

  function closeExpandedPlayer() {
    const panel = $("#expanded-player");
    if (!panel) return;

    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }

  // Cola
  function openQueue() {
    closeExpandedPlayer();

    const drawer = $("#queue-drawer");
    const overlay = $("#overlay");

    drawer?.classList.add("open");
    drawer?.setAttribute("aria-hidden", "false");
    overlay?.classList.add("visible");

    renderQueue();
  }

  function closeQueue() {
    const drawer = $("#queue-drawer");
    const overlay = $("#overlay");

    drawer?.classList.remove("open");
    drawer?.setAttribute("aria-hidden", "true");
    overlay?.classList.remove("visible");
  }

  // Importación de archivos
  function importFiles(files) {
    const audioFiles = [...files].filter(file =>
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|aiff|wma|webm)$/i.test(file.name)
    );

    if (!audioFiles.length) {
      showToast("Selecciona archivos de audio compatibles.");
      fileInput.value = "";
      return;
    }

    for (const file of audioFiles) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);

      const title = file.name.replace(/\.[^.]+$/, "");

      tracks.push({
        id: `local-${crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + "-" + Math.random()}`,
        title,
        artist: "Archivo local",
        album: "Tu biblioteca",
        duration: 0,
        color: colors[tracks.length % colors.length],
        type: "local",
        url,
        file,
        favorite: false
      });
    }

    queue = [...tracks];
    currentView = "songs";
    updateView();

    showToast(
      `${audioFiles.length} ${
        audioFiles.length === 1 ? "archivo importado" : "archivos importados"
      }.`
    );

    fileInput.value = "";
  }

  // Vistas
  function updateView() {
    const views = {
      home: [
        "Tu espacio musical",
        "Todo lo que escuchas, en un solo lugar.",
        "Tu biblioteca",
        "Importa tus archivos de audio para comenzar."
      ],
      songs: [
        "Canciones",
        "Todo tu catálogo musical.",
        "Todas las canciones",
        "Tu música importada."
      ],
      artists: [
        "Artistas",
        "Explora tu música por artista.",
        "Artistas de tu biblioteca",
        "Artistas de los archivos importados."
      ],
      albums: [
        "Álbumes",
        "Explora tus álbumes.",
        "Álbumes de tu biblioteca",
        "Álbumes de los archivos importados."
      ],
      favorites: [
        "Favoritos",
        "Tu música favorita.",
        "Tus favoritos",
        "Las canciones que marques con un corazón."
      ],
      playlists: [
        "Listas de reproducción",
        "Tu música, organizada a tu manera.",
        "Tu colección",
        "Canciones disponibles en Tunelet."
      ]
    };

    const [title, description, libraryTitle, libraryDescription] =
      views[currentView] || views.home;

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };

    setText("#page-title", title);
    setText("#page-description", description);
    setText("#library-title", libraryTitle);
    setText("#library-description", libraryDescription);

    $$(".nav-link").forEach(link => {
      link.classList.toggle("active", link.dataset.view === currentView);
    });

    renderLibrary();
  }

  
  function toggleFavorite(track = currentTrack) {
    if (!track) {
      showToast("Primero elige una canción.");
      return;
    }

    track.favorite = !track.favorite;

    if (track.favorite) {
      favoriteIds.add(track.id);
    } else {
      favoriteIds.delete(track.id);
    }

    saveFavorites();
    updatePlayer();

    showToast(
      track.favorite
        ? "Añadida a favoritos."
        : "Eliminada de favoritos."
    );
  }


  // Botones de importación
  $("#import-button")?.addEventListener("click", () => fileInput.click());
  $("#import-top")?.addEventListener("click", () => fileInput.click());
  $("#empty-import")?.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", event => {
    importFiles(event.target.files || []);
  });

  // Búsqueda
  $("#search-input")?.addEventListener("input", event => {
    searchQuery = event.target.value.trim();

    const clearButton = $("#clear-search");
    if (clearButton) {
      clearButton.hidden = !searchQuery;
    }

    renderLibrary();

    clearTimeout(jamendoSearchTimer);

    if (!searchQuery) {
      jamendoRequestId++;
      jamendoTracks = [];
      renderLibrary();
      return;
    }

    jamendoSearchTimer = setTimeout(() => {
      searchJamendo(searchQuery);
    }, 400);
  });

  $("#clear-search")?.addEventListener("click", () => {
    const searchInput = $("#search-input");
    if (!searchInput) return;

    searchInput.value = "";
    searchQuery = "";

    const clearButton = $("#clear-search");
    if (clearButton) clearButton.hidden = true;

    renderLibrary();
    searchInput.focus();
  });

  // Menú lateral
  $("#menu-toggle")?.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      sidebar.classList.toggle("mobile-open");
    } else {
      sidebar.classList.toggle("collapsed");
    }
  });

  // Navegación
  $$(".nav-link, [data-view]").forEach(button => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (!view) return;

      currentView = view;
      updateView();

      if (window.matchMedia("(max-width: 760px)").matches) {
        sidebar.classList.remove("mobile-open");
      }
    });
  });

  // Acciones sobre canciones
  document.addEventListener("click", event => {
    const playButton = event.target.closest("[data-play-track]");

    if (playButton) {
      const track = getTrackById(playButton.dataset.playTrack);
      if (track) playTrack(track);
      return;
    }

    const favoriteButton = event.target.closest("[data-favorite-track]");

    if (favoriteButton) {
      const track = getTrackById(favoriteButton.dataset.favoriteTrack);
      if (track) toggleFavorite(track);
      return;
    }

    const queueButton = event.target.closest("[data-queue-track]");

    if (queueButton) {
      const track = getTrackById(queueButton.dataset.queueTrack);

      if (track) {
        closeQueue();
        playTrack(track);
      }
    }
  });

  // Controles del reproductor
  $("#play-button")?.addEventListener("click", togglePlayback);
  $("#expanded-play")?.addEventListener("click", togglePlayback);

  $("#previous-button")?.addEventListener("click", playPrevious);
  $("#expanded-previous")?.addEventListener("click", playPrevious);

  $("#next-button")?.addEventListener("click", playNext);
  $("#expanded-next")?.addEventListener("click", playNext);

  $("#shuffle-button")?.addEventListener("click", () => {
    isShuffle = !isShuffle;
    updatePlayer();

    showToast(
      isShuffle ? "Aleatorio activado." : "Aleatorio desactivado."
    );
  });

  $("#expanded-shuffle")?.addEventListener("click", () => {
    isShuffle = !isShuffle;
    updatePlayer();
  });

  $("#expanded-repeat")?.addEventListener("click", () => {
    isRepeat = !isRepeat;
    updatePlayer();

    showToast(
      isRepeat ? "Repetición activada." : "Repetición desactivada."
    );
  });

  $("#favorite-button")?.addEventListener("click", () => {
    toggleFavorite();
  });

  $("#hero-play")?.addEventListener("click", () => {
    if (tracks.length) {
      playTrack(tracks[0]);
    } else {
      fileInput.click();
    }
  });

  // Reproductor expandido
  $("#expand-player")?.addEventListener("click", openExpandedPlayer);
  $("#expand-player-icon")?.addEventListener("click", openExpandedPlayer);
  $("#collapse-player")?.addEventListener("click", closeExpandedPlayer);

  // Cola
  $("#queue-button")?.addEventListener("click", openQueue);
  $("#expanded-queue-button")?.addEventListener("click", openQueue);
  $("#show-queue")?.addEventListener("click", openQueue);
  $("#close-queue")?.addEventListener("click", closeQueue);
  $("#overlay")?.addEventListener("click", closeQueue);

  // Posición de reproducción
  $("#progress")?.addEventListener("input", event => {
    seek(event.target.value);
  });

  $("#expanded-progress")?.addEventListener("input", event => {
    seek(event.target.value);
  });

  // Eventos del audio real
  audio.addEventListener("play", () => {
    isPlaying = true;
    updatePlayer();
  });

  audio.addEventListener("pause", () => {
    isPlaying = false;
    updatePlayer();
  });

  audio.addEventListener("timeupdate", () => {
    const position = Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : 0;

    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : 0;

    const progress = duration > 0 ? position / duration * 1000 : 0;

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };

    setText("#current-time", formatTime(position));
    setText("#expanded-current-time", formatTime(position));
    setText("#total-time", formatTime(duration));
    setText("#expanded-total-time", formatTime(duration));

    const progressControl = $("#progress");
    const expandedProgress = $("#expanded-progress");

    if (progressControl) progressControl.value = progress;
    if (expandedProgress) expandedProgress.value = progress;
  });

  audio.addEventListener("loadedmetadata", () => {
    if (currentTrack) {
      currentTrack.duration = Number.isFinite(audio.duration)
        ? audio.duration
        : 0;

      updatePlayer();
    }
  });

  audio.addEventListener("ended", () => {
    isPlaying = false;

    if (isRepeat) {
      audio.currentTime = 0;

      audio.play().catch(() => {
        showToast("No se pudo repetir la canción.");
      });

      return;
    }

    playNext();
  });

  audio.addEventListener("error", () => {
    if (!currentTrack) return;

    isPlaying = false;
    updatePlayer();
    showToast("No se pudo leer este archivo de audio.");
  });

  // Cerrar paneles con Escape
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeExpandedPlayer();
      closeQueue();
      sidebar.classList.remove("mobile-open");
    }
  });

  // Efecto ripple
  document.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;

    const target = event.target.closest(".ripple");

    if (!target || target.matches(":disabled")) return;

    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const ripple = document.createElement("span");
    ripple.className = "forma-ripple";

    const size = Math.hypot(rect.width, rect.height) * 2;

    Object.assign(ripple.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${event.clientX - rect.left}px`,
      top: `${event.clientY - rect.top}px`
    });

    target.appendChild(ripple);

    ripple.addEventListener(
      "animationend",
      () => ripple.remove(),
      { once: true }
    );
  });

  // Liberar recursos temporales
  window.addEventListener("beforeunload", () => {
    audio.pause();
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    clearTimeout(toastTimer);
  });

  // Inicio
  updateView();
  updatePlayer();
  renderQueue();
})();