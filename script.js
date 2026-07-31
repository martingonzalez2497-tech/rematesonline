// ===== Configuración =====
// En desarrollo local (Live Server en :5500) el backend vive en :3000 aparte.
// Una vez desplegado, frontend y backend se sirven juntos desde el mismo origen.
const esDesarrolloLocal = window.location.port === "5500" || window.location.protocol === "file:";
const API_URL = esDesarrolloLocal ? "http://localhost:3000/api" : `${window.location.origin}/api`;

const SVG_FUEGO = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c2 2 2 5 0 7a7 7 0 0 1-11-6c0-4 3-5 3-8 1 1 2 2 4 0z"/></svg>`;
const SVG_RELOJ = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`;
const SVG_ESTRELLA_LLENA = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`;
const SVG_ESTRELLA_VACIA = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`;

// ===== Sincronización en tiempo real (Socket.IO) =====
// Si el cliente de socket.io no llegó a cargar (ej. backend caído, CDN
// bloqueado), el sitio sigue funcionando igual — solo sin la actualización
// en vivo entre navegadores.
if (typeof io !== "undefined") {
  const socket = io(new URL(API_URL).origin, { reconnectionDelay: 2000 });
  let debounceActualizar = null;
  socket.on("actualizar", () => {
    clearTimeout(debounceActualizar);
    debounceActualizar = setTimeout(() => {
      cargarLotes();
    }, 400);
  });

  socket.on("nuevo_usuario_pendiente", ({ nombre }) => {
    const sesion = leerSesion();
    if (!sesion || sesion.usuario.rol !== "administrador") return;
    agregarNotificacionAdmin(`Nuevo registro pendiente: ${nombre}`);
  });
}

// ===== Año en el footer =====
document.getElementById("anio").textContent = new Date().getFullYear();

// Ocultar botón flotante WhatsApp cuando el footer es visible
{
  const btnWA = document.getElementById("whatsappFlotante");
  const footer = document.querySelector(".site-footer");
  if (btnWA && footer) {
    const observer = new IntersectionObserver(
      ([entry]) => btnWA.classList.toggle("oculto", entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(footer);
  }
}

// ===== Toggle de modo oscuro =====
const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme");

function actualizarIconoTema() {
  const esOscuro = root.getAttribute("data-theme") === "dark";
  document.querySelector(".icono-sol").hidden = esOscuro;
  document.querySelector(".icono-luna").hidden = !esOscuro;
}

if (savedTheme) {
  root.setAttribute("data-theme", savedTheme);
} else {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (prefersDark) root.setAttribute("data-theme", "dark");
}
actualizarIconoTema();

themeToggle.addEventListener("click", () => {
  const isDark = root.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  root.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  themeToggle.setAttribute("aria-pressed", String(!isDark));
  actualizarIconoTema();
});

// ===== Carrusel del hero (armado dinámicamente con lotes activos reales) =====
let slides = [];
const dotsNav = document.querySelector(".hero-dots");
let currentSlide = 0;
let intervaloHero = null;

async function renderOfertasRecientes() {
  const seccion = document.getElementById("ofertasRecientesSeccion");
  const lista = document.getElementById("ofertasRecientesLista");

  try {
    const resp = await fetch(`${API_URL}/ofertas/recientes`);
    if (!resp.ok) throw new Error("no ok");
    const ofertas = await resp.json();

    if (ofertas.length === 0) {
      seccion.hidden = true;
      return;
    }

    lista.innerHTML = "";
    ofertas.forEach((oferta) => {
      const li = document.createElement("li");
      li.className = "ofertas-recientes-item";

      const avatar = document.createElement("span");
      avatar.className = "ofertas-recientes-avatar";
      avatar.textContent = (oferta.usuario_nombre || "?").trim().charAt(0).toUpperCase();

      const texto = document.createElement("span");
      texto.className = "ofertas-recientes-texto";
      texto.innerHTML = `${oferta.usuario_nombre} ofertó <strong>${formatoMonto(oferta.monto)}</strong> por "${oferta.lote_titulo}"
        <span class="ofertas-recientes-tiempo">${tiempoRelativo(oferta.fecha)}</span>`;

      li.append(avatar, texto);
      lista.appendChild(li);
    });
    seccion.hidden = false;
  } catch (err) {
    seccion.hidden = true;
  }
}

function tiempoRelativo(fechaTexto) {
  const segundos = Math.floor((new Date() - new Date(fechaTexto + "Z")) / 1000);
  if (segundos < 60) return "recién";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} hs`;
  return `hace ${Math.floor(horas / 24)} día(s)`;
}

setInterval(renderOfertasRecientes, 20000); // se refresca solo, ya que no tenemos tiempo real de verdad (websockets)

function renderHeroDesdeLotes() {
  const heroSlidesEl = document.getElementById("heroSlides");
  const rematesConFoto = new Map();
  LOTES.filter((l) => !loteEstaCerrado(l)).forEach((l) => {
    const actual = rematesConFoto.get(l.remate_id);
    if (!actual || (!actual.imagen && l.imagen)) rematesConFoto.set(l.remate_id, l);
  });
  const conFoto = Array.from(rematesConFoto.values());

  heroSlidesEl.innerHTML = "";
  dotsNav.innerHTML = "";
  if (intervaloHero) clearInterval(intervaloHero);

  if (conFoto.length === 0) {
    // Hero de fallback: diseño con gradiente y estadísticas del sitio
    const totalLotes = LOTES.filter(l => !loteEstaCerrado(l)).length;
    const totalRemates = REMATES.length;
    heroSlidesEl.innerHTML = `
      <li class="hero-slide hero-slide-fallback is-active">
        <div class="hero-fallback-contenido">
          <p class="hero-fallback-tag">Subastas online en Uruguay</p>
          <h2 class="hero-fallback-titulo">Comprá al mejor<br>precio en subasta</h2>
          <p class="hero-fallback-sub">Registrate gratis y ofertá en 30 segundos.<br>Sin comisiones ocultas.</p>
          ${totalLotes > 0 ? `<div class="hero-fallback-stats">
            <div class="hero-stat"><strong>${totalLotes}</strong><span>lotes activos</span></div>
            <div class="hero-stat"><strong>${totalRemates}</strong><span>remates</span></div>
          </div>` : ""}
          <a href="#activas" class="btn btn-primary hero-fallback-cta">Ver subastas activas</a>
        </div>
        <div class="hero-fallback-deco" aria-hidden="true">
          <span class="hero-fallback-martillo">🔨</span>
        </div>
      </li>`;
    return;
  }

  conFoto.forEach((lote, i) => {
    const li = document.createElement("li");
    li.className = "hero-slide" + (i === 0 ? " is-active" : "");
    if (lote.imagen) {
      const imgFondo = document.createElement("img");
      imgFondo.src = lote.imagen;
      imgFondo.alt = "";
      imgFondo.className = "hero-slide-fondo";
      imgFondo.setAttribute("aria-hidden", "true");
      li.appendChild(imgFondo);

      const imgPrincipal = document.createElement("img");
      imgPrincipal.src = lote.imagen;
      imgPrincipal.alt = "";
      imgPrincipal.className = "hero-slide-img";
      li.appendChild(imgPrincipal);
    }
    const caption = document.createElement("p");
    caption.className = "slide-caption";
    caption.textContent = lote.remate_titulo || lote.titulo;
    li.appendChild(caption);
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      const remate = REMATES.find((r) => r.id === lote.remate_id);
      const lotesDelRemate = LOTES.filter((l) => l.remate_id === lote.remate_id && !loteEstaCerrado(l));
      const cualquierTarjeta = document.querySelector("#activasGrid .subasta-card");
      if (remate && cualquierTarjeta) abrirRemateDetalle(remate, lotesDelRemate, cualquierTarjeta);
      const seccionActivas = document.getElementById("activas");
      if (seccionActivas.scrollIntoView) seccionActivas.scrollIntoView({ behavior: "smooth" });
    });
    heroSlidesEl.appendChild(li);
  });

  slides = Array.from(document.querySelectorAll(".hero-slide"));
  currentSlide = 0;

  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Ir a la imagen ${i + 1}`);
    if (i === 0) dot.classList.add("is-active");
    dot.addEventListener("click", () => goToSlide(i));
    dotsNav.appendChild(dot);
  });

  if (slides.length > 1) {
    intervaloHero = setInterval(() => goToSlide((currentSlide + 1) % slides.length), 5000);
  }
}

function goToSlide(index) {
  slides[currentSlide].classList.remove("is-active");
  dotsNav.children[currentSlide].classList.remove("is-active");
  currentSlide = index;
  slides[currentSlide].classList.add("is-active");
  dotsNav.children[currentSlide].classList.add("is-active");
}

// ===== Newsletter (sin backend todavía) =====
document.querySelector(".form-newsletter").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.textContent = "¡Suscripto!";
  button.disabled = true;
});

// ===== Buscador =====
function buscarLotes() {
  const texto = document.getElementById("buscar").value.toLowerCase().trim();
  if (!texto) return;
  aplicarFiltros();
}

// ===== Sistema de filtros en tiempo real =====
function aplicarFiltros() {
  const texto = (document.getElementById("filtroTexto")?.value || document.getElementById("buscar")?.value || "").toLowerCase().trim();
  const rubroSel = document.getElementById("filtroRubroSelect")?.value || "";
  const estadoSel = document.getElementById("filtroEstado")?.value || "";
  const precioMin = Number(document.getElementById("filtroPrecioMin")?.value) || 0;
  const precioMax = Number(document.getElementById("filtroPrecioMax")?.value) || Infinity;
  const btnLimpiar = document.getElementById("btnLimpiarFiltros");
  const resultado = document.getElementById("filtrosResultado");

  const hayFiltros = texto || rubroSel || estadoSel || precioMin || precioMax < Infinity;
  if (btnLimpiar) btnLimpiar.hidden = !hayFiltros;

  const lotesFiltrados = LOTES.filter((l) => {
    if (loteEstaCerrado(l)) return false;
    if (texto && !(
      (l.titulo || "").toLowerCase().includes(texto) ||
      (l.numero || "").toLowerCase().includes(texto) ||
      (l.remate_titulo || "").toLowerCase().includes(texto) ||
      (l.rubro || l.remate_rubro || "").toLowerCase().includes(texto)
    )) return false;
    if (rubroSel && (l.remate_rubro || l.rubro) !== rubroSel) return false;
    if (estadoSel === "sin-ofertas" && l.cantidad_ofertas > 0) return false;
    if (estadoSel === "con-ofertas" && l.cantidad_ofertas === 0) return false;
    if (l.oferta_actual < precioMin) return false;
    if (l.oferta_actual > precioMax) return false;
    return true;
  });

  if (!hayFiltros) {
    renderLotes();
    if (resultado) resultado.hidden = true;
    return;
  }

  mostrarSoloSeccion("activas");
  const activasGrid = document.getElementById("activasGrid");
  renderGridComoListaDeLotes(activasGrid, texto ? `Resultados para "${texto}"` : "Lotes filtrados", "", lotesFiltrados);
  if (resultado) {
    resultado.hidden = false;
    resultado.textContent = `${lotesFiltrados.length} lote${lotesFiltrados.length !== 1 ? "s" : ""} encontrado${lotesFiltrados.length !== 1 ? "s" : ""}`;
  }
}

// Conectar filtros con debounce
let debounceFilters = null;
function iniciarFiltros() {
  const inputs = ["filtroTexto", "filtroRubroSelect", "filtroEstado", "filtroPrecioMin", "filtroPrecioMax"];
  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => {
      clearTimeout(debounceFilters);
      debounceFilters = setTimeout(aplicarFiltros, 300);
    });
  });
  const btnLimpiar = document.getElementById("btnLimpiarFiltros");
  if (btnLimpiar) btnLimpiar.addEventListener("click", () => {
    ["filtroTexto", "filtroPrecioMin", "filtroPrecioMax"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
    ["filtroRubroSelect", "filtroEstado"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
    renderLotes();
    document.getElementById("filtrosResultado").hidden = true;
    btnLimpiar.hidden = true;
  });
}
iniciarFiltros();
document.querySelector(".search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  buscarLotes();
});

// ===== Búsqueda mobile =====
(function() {
  const btnBuscarMobile = document.getElementById("btnBuscarMobile");
  const searchExpandida = document.getElementById("searchExpandida");
  const inputMobile = document.getElementById("buscarMobile");
  const btnSubmitMobile = document.getElementById("btnBuscarMobileSubmit");
  const btnCerrar = document.getElementById("btnCerrarBusqueda");

  // Mostrar botón lupa sólo en mobile
  function actualizarVisibilidadBusqueda() {
    const esMobile = window.matchMedia("(max-width: 30rem)").matches;
    if (btnBuscarMobile) btnBuscarMobile.style.display = esMobile ? "flex" : "none";
  }
  actualizarVisibilidadBusqueda();
  window.addEventListener("resize", actualizarVisibilidadBusqueda);

  if (btnBuscarMobile) {
    btnBuscarMobile.addEventListener("click", () => {
      searchExpandida.style.display = "flex";
      inputMobile.focus();
    });
  }
  if (btnCerrar) {
    btnCerrar.addEventListener("click", () => {
      searchExpandida.style.display = "none";
      inputMobile.value = "";
    });
  }
  if (btnSubmitMobile) {
    btnSubmitMobile.addEventListener("click", () => {
      document.getElementById("buscar").value = inputMobile.value;
      buscarLotes();
      searchExpandida.style.display = "none";
    });
  }
  if (inputMobile) {
    inputMobile.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        document.getElementById("buscar").value = inputMobile.value;
        buscarLotes();
        searchExpandida.style.display = "none";
      }
    });
  }
})();

// ===== Dropdown de Rubros =====
// ===== Menú hamburguesa (mobile) =====
const navToggle = document.getElementById("navToggle");
const navLista = document.getElementById("navLista");
const panelLateralFondo = document.getElementById("panelLateralFondo");

function abrirPanelLateral() {
  navLista.classList.add("is-open");
  navLista.style.display = "flex"; // forzar visible aunque site-nav tenga display:none
  panelLateralFondo.classList.add("is-open");
  navToggle.classList.add("is-open");
  navToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}
function cerrarPanelLateral() {
  navLista.classList.remove("is-open");
  navLista.style.display = ""; // volver a dejar que el CSS controle
  panelLateralFondo.classList.remove("is-open");
  navToggle.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

navToggle.addEventListener("click", () => {
  if (navLista.classList.contains("is-open")) cerrarPanelLateral();
  else abrirPanelLateral();
});
panelLateralFondo.addEventListener("click", cerrarPanelLateral);
// Cerrar el menú mobile al navegar a una sección o abrir un panel
navLista.querySelectorAll("a, button.link-cuenta").forEach((el) => {
  el.addEventListener("click", cerrarPanelLateral);
});

const rubrosToggle = document.getElementById("rubrosToggle");
const rubrosMenu = document.getElementById("rubrosMenu");

function abrirMenuRubros() {
  rubrosMenu.classList.add("is-open");
  rubrosToggle.setAttribute("aria-expanded", "true");
  const rect = rubrosToggle.getBoundingClientRect();
  rubrosMenu.style.top = `${rect.bottom + 4}px`;
  rubrosMenu.style.left = `${rect.left}px`;
}
function cerrarMenuRubros() {
  rubrosMenu.classList.remove("is-open");
  rubrosToggle.setAttribute("aria-expanded", "false");
}

let temporizadorCierreRubros = null;
function cancelarCierreRubros() { clearTimeout(temporizadorCierreRubros); }
function programarCierreRubros() {
  temporizadorCierreRubros = setTimeout(cerrarMenuRubros, 250);
}

document.querySelector(".has-dropdown").addEventListener("mouseenter", () => {
  cancelarCierreRubros();
  abrirMenuRubros();
});
document.querySelector(".has-dropdown").addEventListener("mouseleave", programarCierreRubros);
rubrosMenu.addEventListener("mouseenter", cancelarCierreRubros);
rubrosMenu.addEventListener("mouseleave", programarCierreRubros);

// Clic sigue funcionando para mobile/tablet, donde no existe el "hover"
rubrosToggle.addEventListener("click", () => {
  if (rubrosMenu.classList.contains("is-open")) cerrarMenuRubros();
  else abrirMenuRubros();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".has-dropdown")) cerrarMenuRubros();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    rubrosMenu.classList.remove("is-open");
    rubrosToggle.setAttribute("aria-expanded", "false");
  }
});

function filtrarPorRubro(rubro) {
  document.querySelectorAll("#activasGrid .subasta-card, #finalizadasGrid .subasta-card")
    .forEach((tarjeta) => {
      tarjeta.style.display = tarjeta.dataset.rubro === rubro ? "" : "none";
    });

  // Mostrar badge de filtro activo con botón para limpiar
  let badge = document.getElementById("filtroRubroBadge");
  if (!badge) {
    badge = document.createElement("p");
    badge.id = "filtroRubroBadge";
    badge.style.cssText = "margin: 0 0 1rem; font-size: 0.85rem; color: var(--fg-muted);";
    const activasGrid = document.getElementById("activasGrid");
    activasGrid.parentElement.insertBefore(badge, activasGrid);
  }
  badge.innerHTML = `Filtrando: <strong>${rubro}</strong> · <button type="button" style="background:none;border:none;color:var(--accent);cursor:pointer;font:inherit;text-decoration:underline;padding:0" id="btnLimpiarFiltroRubro">Ver todos</button>`;
  document.getElementById("btnLimpiarFiltroRubro").addEventListener("click", () => {
    document.querySelectorAll("#activasGrid .subasta-card, #finalizadasGrid .subasta-card")
      .forEach((t) => { t.style.display = ""; });
    badge.remove();
  });
}

function revisarLandingDeRubro() {
  const params = new URLSearchParams(window.location.search);
  const rubro = params.get("rubro");
  if (rubro) {
    filtrarPorRubro(rubro);
    document.getElementById("activas").scrollIntoView();
  }

  // Soporte para URL limpia /lote/123 Y param ?lote=123
  const pathMatch = window.location.pathname.match(/^\/lote\/(\d+)$/);
  const loteId = pathMatch ? pathMatch[1] : params.get("lote");
  if (loteId) {
    const lote = LOTES.find((l) => String(l.id) === loteId);
    if (lote) {
      abrirModal(lote);
      // Normalizar URL a formato limpio
      window.history.replaceState({}, "", `/lote/${lote.id}`);
    }
  }
}

/* ==========================================================================
   SESIÓN (login / registro / logout)
   El token y los datos del usuario logueado se guardan en localStorage para
   no perder la sesión al recargar la página.
   ========================================================================== */
function leerSesion() {
  try {
    const token = localStorage.getItem("token");
    const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
    return token && usuario ? { token, usuario } : null;
  } catch (e) {
    return null;
  }
}
function guardarSesion(token, usuario) {
  localStorage.setItem("token", token);
  localStorage.setItem("usuario", JSON.stringify(usuario));
}
function cerrarSesion() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  misOfertasLoteIds = new Set();
  renderCuentaArea();
  renderLotes();
  document.getElementById("cartCount").textContent = "0";
  document.getElementById("avisoSuperado").hidden = true;
}

const NOMBRES_ROL = { publico: "Público", rematador: "Rematador", administrador: "Administrador" };

function renderCuentaArea() {
  const area = document.getElementById("cuentaArea");
  const sesion = leerSesion();
  const panelNavItem = document.getElementById("panelNavItem");

  if (!sesion) {
    area.innerHTML = `<button type="button" id="btnAbrirLogin" class="link-cuenta">◐ Ingresar</button>`;
    document.getElementById("btnAbrirLogin").addEventListener("click", () => abrirLogin());
    panelNavItem.hidden = true;
    document.getElementById("usuariosNavItem").hidden = true;
    document.getElementById("misOfertasNavItem").hidden = true;
    const itemMobile = document.getElementById("cerrarSesionMobileItem");
    if (itemMobile) itemMobile.remove();
    return;
  }

  area.innerHTML = `
    <span class="cuenta-nombre cuenta-nombre-desktop">${sesion.usuario.nombre}</span>
    <span class="cuenta-rol cuenta-rol-header">${NOMBRES_ROL[sesion.usuario.rol] || sesion.usuario.rol}</span>
    <button type="button" class="link-salir cuenta-salir-header" id="btnCerrarSesion">Cerrar sesión</button>
  `;
  document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);

  // En mobile: agregar rol y cerrar sesión al final del menú lateral
  const itemCerrarSesionMobile = document.getElementById("cerrarSesionMobileItem");
  if (itemCerrarSesionMobile) itemCerrarSesionMobile.remove();
  const li = document.createElement("li");
  li.id = "cerrarSesionMobileItem";
  li.innerHTML = `
    <span class="cuenta-rol" style="font-size:0.8rem;margin-bottom:0.25rem;display:block">${NOMBRES_ROL[sesion.usuario.rol] || sesion.usuario.rol}</span>
    <button type="button" class="link-salir" id="btnCerrarSesionMobile">Cerrar sesión</button>
  `;
  document.getElementById("navLista").appendChild(li);
  document.getElementById("btnCerrarSesionMobile").addEventListener("click", () => { cerrarPanelLateral(); cerrarSesion(); });

  panelNavItem.hidden = !["rematador", "administrador"].includes(sesion.usuario.rol);
  document.getElementById("usuariosNavItem").hidden = sesion.usuario.rol !== "administrador";
  document.getElementById("misOfertasNavItem").hidden = sesion.usuario.rol !== "publico";

  // Si es admin, verificar si hay usuarios pendientes de aprobación
  if (sesion.usuario.rol === "administrador") {
    fetch(`${API_URL}/usuarios`, { headers: { Authorization: `Bearer ${sesion.token}` } })
      .then((r) => r.json())
      .then((usuarios) => {
        const pendientes = usuarios.filter((u) => !u.aprobado);
        pendientes.forEach((u) => agregarNotificacionAdmin(`Registro pendiente de aprobación: ${u.nombre}`));
      })
      .catch(() => {});
  }
}

// ===== Modal de login/registro =====
const loginOverlay = document.getElementById("loginOverlay");
const loginClose = document.getElementById("loginClose");
const loginMensaje = document.getElementById("loginMensaje");
const formLogin = document.getElementById("formLogin");
const formRegistro = document.getElementById("formRegistro");

function abrirLogin(tab = "login") {
  loginMensaje.textContent = "";
  loginMensaje.className = "login-mensaje";
  cambiarTabLogin(tab);
  loginOverlay.hidden = false;
  (tab === "login" ? document.getElementById("loginEmail") : document.getElementById("registroNombre")).focus();
}
function cerrarLogin() {
  loginOverlay.hidden = true;
}
function cambiarTabLogin(tab) {
  document.querySelectorAll(".login-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  formLogin.hidden = tab !== "login";
  formRegistro.hidden = tab !== "registro";
  document.getElementById("formOlvidePassword").hidden = true;
}
document.querySelectorAll(".login-tab").forEach((btn) => {
  btn.addEventListener("click", () => cambiarTabLogin(btn.dataset.tab));
});
loginClose.addEventListener("click", cerrarLogin);
loginOverlay.addEventListener("click", (event) => {
  if (event.target === loginOverlay) cerrarLogin();
});

formLogin.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const resp = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (data.requiereVerificacion) {
        mostrarFormularioVerificacion(email.toLowerCase());
        return;
      }
      loginMensaje.textContent = data.error || "No se pudo iniciar sesión.";
      loginMensaje.className = "login-mensaje error";
      return;
    }

    guardarSesion(data.token, data.usuario);
    renderCuentaArea();
    cerrarLogin();
    cargarLotes().then(retomarOfertaPendiente);
  } catch (err) {
    loginMensaje.textContent = "No se pudo conectar con el servidor. ¿Está corriendo el backend?";
    loginMensaje.className = "login-mensaje error";
  }
});

formRegistro.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nombre = document.getElementById("registroNombre").value;
  const email = document.getElementById("registroEmail").value;
  const cedula = document.getElementById("registroCedula").value;
  const password = document.getElementById("registroPassword").value;
  const aceptaTerminos = document.getElementById("registroTerminos").checked;

  try {
    const resp = await fetch(`${API_URL}/auth/registro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, cedula, password, aceptaTerminos }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      loginMensaje.textContent = data.error || "No se pudo registrar.";
      loginMensaje.className = "login-mensaje error";
      return;
    }

    // Sin verificación de email: mostrar mensaje de aprobación pendiente
    formRegistro.reset();
    cambiarTabLogin("login");
    loginMensaje.textContent = "¡Registro exitoso! Un administrador tiene que aprobar tu cuenta antes de que puedas ingresar.";
    loginMensaje.className = "login-mensaje exito";
  } catch (err) {
    loginMensaje.textContent = "No se pudo conectar con el servidor. ¿Está corriendo el backend?";
    loginMensaje.className = "login-mensaje error";
  }
});

/* ==========================================================================
   VERIFICACIÓN DE EMAIL (código de 6 dígitos)
   ========================================================================== */
const formVerificarCodigo = document.getElementById("formVerificarCodigo");
let emailPendienteDeVerificar = "";

function mostrarFormularioVerificacion(email) {
  emailPendienteDeVerificar = email;
  document.getElementById("verificarEmailTexto").textContent = email;
  formLogin.hidden = true;
  formRegistro.hidden = true;
  formOlvidePassword.hidden = true;
  formVerificarCodigo.hidden = false;
  document.querySelectorAll(".login-tab").forEach((btn) => btn.classList.remove("is-active"));
  loginMensaje.textContent = "";
  document.getElementById("verificarCodigoInput").focus();
}

formVerificarCodigo.addEventListener("submit", async (event) => {
  event.preventDefault();
  const codigo = document.getElementById("verificarCodigoInput").value.trim();

  try {
    const resp = await fetch(`${API_URL}/auth/verificar-codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailPendienteDeVerificar, codigo }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      loginMensaje.textContent = data.error || "No se pudo verificar el código.";
      loginMensaje.className = "login-mensaje error";
      return;
    }

    formVerificarCodigo.hidden = true;
    cambiarTabLogin("login");
    loginMensaje.textContent = "¡Email verificado! Ahora falta que un administrador apruebe tu cuenta para poder ingresar.";
    loginMensaje.className = "login-mensaje exito";
  } catch (err) {
    loginMensaje.textContent = "No se pudo conectar con el servidor.";
    loginMensaje.className = "login-mensaje error";
  }
});

document.getElementById("btnReenviarCodigo").addEventListener("click", async () => {
  try {
    await fetch(`${API_URL}/auth/reenviar-codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailPendienteDeVerificar }),
    });
    loginMensaje.textContent = "Te mandamos un código nuevo.";
    loginMensaje.className = "login-mensaje exito";
  } catch (err) {
    loginMensaje.textContent = "No se pudo conectar con el servidor.";
    loginMensaje.className = "login-mensaje error";
  }
});

/* ==========================================================================
   RECUPERACIÓN DE CONTRASEÑA
   ========================================================================== */
const formOlvidePassword = document.getElementById("formOlvidePassword");
const btnOlvidePassword = document.getElementById("btnOlvidePassword");
const btnVolverALogin = document.getElementById("btnVolverALogin");

btnOlvidePassword.addEventListener("click", () => {
  loginMensaje.textContent = "";
  loginMensaje.className = "login-mensaje";
  formLogin.hidden = true;
  formOlvidePassword.hidden = false;
  document.getElementById("olvideEmail").focus();
});
btnVolverALogin.addEventListener("click", () => {
  formOlvidePassword.hidden = true;
  formLogin.hidden = false;
  document.getElementById("loginEmail").focus();
});

formOlvidePassword.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("olvideEmail").value;

  try {
    await fetch(`${API_URL}/auth/olvide-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    loginMensaje.textContent = "Si el email está registrado, te llegó un link para elegir una contraseña nueva.";
    loginMensaje.className = "login-mensaje exito";
    formOlvidePassword.reset();
  } catch (err) {
    loginMensaje.textContent = "No se pudo conectar con el servidor.";
    loginMensaje.className = "login-mensaje error";
  }
});

// ===== Restablecer contraseña (cuando se llega con ?resetToken=... en la URL) =====
const restablecerOverlay = document.getElementById("restablecerOverlay");
const restablecerClose = document.getElementById("restablecerClose");
const restablecerMensaje = document.getElementById("restablecerMensaje");
const formRestablecer = document.getElementById("formRestablecer");
let tokenRestablecer = null;

function revisarLinkDeRecuperacion() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("resetToken");
  if (!token) return;

  tokenRestablecer = token;
  restablecerOverlay.hidden = false;
  document.getElementById("restablecerPassword").focus();

  params.delete("resetToken");
  const nuevaUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
  window.history.replaceState({}, "", nuevaUrl);
}

restablecerClose.addEventListener("click", () => { restablecerOverlay.hidden = true; });
restablecerOverlay.addEventListener("click", (event) => {
  if (event.target === restablecerOverlay) restablecerOverlay.hidden = true;
});

formRestablecer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("restablecerPassword").value;

  try {
    const resp = await fetch(`${API_URL}/auth/restablecer-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenRestablecer, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      restablecerMensaje.textContent = data.error || "No se pudo restablecer la contraseña.";
      restablecerMensaje.className = "login-mensaje error";
      return;
    }

    restablecerMensaje.textContent = "¡Contraseña actualizada! Ya podés iniciar sesión con la nueva.";
    restablecerMensaje.className = "login-mensaje exito";
    formRestablecer.reset();
    setTimeout(() => {
      restablecerOverlay.hidden = true;
      abrirLogin("login");
    }, 1500);
  } catch (err) {
    restablecerMensaje.textContent = "No se pudo conectar con el servidor.";
    restablecerMensaje.className = "login-mensaje error";
  }
});

/* ==========================================================================
   LOTES — se traen del backend real (ya no hay datos inventados a mano).
   Necesitás el backend corriendo (carpeta backend/, "npm start") para que
   esto cargue. Si no está corriendo, se muestra un aviso en vez de romper.
   ========================================================================== */
let LOTES = [];

// Un lote se considera "cerrado" para mostrarlo en la sección correcta ya sea
// porque el rematador lo finalizó, o porque se venció el tiempo (aunque el
// rematador todavía no haya hecho clic en "Finalizar" desde su Panel).
function loteEstaCerrado(lote) {
  return lote.estado === "finalizada" || new Date(lote.cierre) <= new Date();
}

function confirmarEnPagina(mensaje) {
  const overlay = document.getElementById("confirmarOverlay");
  document.getElementById("confirmarTexto").textContent = mensaje;
  overlay.hidden = false;

  return new Promise((resolve) => {
    const btnAceptar = document.getElementById("btnConfirmarAceptar");
    const btnCancelar = document.getElementById("btnConfirmarCancelar");

    function limpiar(resultado) {
      overlay.hidden = true;
      btnAceptar.removeEventListener("click", onAceptar);
      btnCancelar.removeEventListener("click", onCancelar);
      resolve(resultado);
    }
    function onAceptar() { limpiar(true); }
    function onCancelar() { limpiar(false); }

    btnAceptar.addEventListener("click", onAceptar);
    btnCancelar.addEventListener("click", onCancelar);
    btnAceptar.focus();
  });
}
let ofertaPendiente = null; // { loteId, monto } — para retomarla apenas se loguee/registre
let REMATES = [];
let misOfertasLoteIds = new Set(); // ids de lote donde el usuario logueado ya ofertó

async function actualizarMisOfertasLoteIds() {
  const sesion = leerSesion();
  if (!sesion) {
    misOfertasLoteIds = new Set();
    return;
  }
  try {
    const resp = await fetch(`${API_URL}/ofertas/mias`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const ofertas = await resp.json();
    if (resp.ok) {
      misOfertasLoteIds = new Set(ofertas.map((o) => o.lote_id));
    }
  } catch (err) {
    misOfertasLoteIds = new Set();
  }
}

async function cargarLotes() {
  const activasGrid = document.getElementById("activasGrid");
  const finalizadasGrid = document.getElementById("finalizadasGrid");
  const enVistaHome = !activasGrid.querySelector(".remate-volver");

  if (enVistaHome) {
    activasGrid.innerHTML = Array(4).fill(`
    <li class="subasta-card skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton skeleton-linea" style="width: 40%; margin: 0.9rem 0.9rem 0.5rem;"></div>
      <div class="skeleton skeleton-linea" style="width: 70%; margin: 0 0.9rem 0.5rem;"></div>
      <div class="skeleton skeleton-linea" style="width: 55%; margin: 0 0.9rem 0.9rem;"></div>
    </li>`).join("");
  }

  try {
    const [respRemates, respLotes] = await Promise.all([
      fetch(`${API_URL}/remates`),
      fetch(`${API_URL}/lotes`),
    ]);
    if (!respRemates.ok || !respLotes.ok) throw new Error("Respuesta no OK");
    REMATES = await respRemates.json();
    LOTES = await respLotes.json();
    await actualizarMisOfertasLoteIds();
    actualizarAvisoSuperado();

    renderRubros();
    if (enVistaHome) renderLotes();
    renderHeroDesdeLotes();
    actualizarContadorCarrito();
    actualizarCuentasRegresivas();
  } catch (err) {
    activasGrid.innerHTML = `<li class="aviso-backend">No se pudo conectar con el servidor. Revisá que el backend esté corriendo (carpeta <code>backend/</code>, comando <code>npm start</code>).</li>`;
    finalizadasGrid.innerHTML = "";
  }
}

function renderRubros() {
  rubrosMenu.innerHTML = "";

  const todosLi = document.createElement("li");
  const todosLink = document.createElement("a");
  todosLink.href = "#activas";
  todosLink.textContent = "Todos";
  todosLink.addEventListener("click", () => {
    document.querySelectorAll(".remate-grupo").forEach((grupo) => { grupo.style.display = ""; });
    document.querySelectorAll(".subasta-card").forEach((card) => { card.style.display = ""; });
    rubrosMenu.classList.remove("is-open");
  });
  todosLi.appendChild(todosLink);
  rubrosMenu.appendChild(todosLi);

  const rubros = [...new Set(REMATES.map((r) => r.rubro))];
  rubros.forEach((rubro) => {
    const li = document.createElement("li");
    li.className = "rubro-item-con-link";

    const a = document.createElement("a");
    a.href = "#activas";
    a.textContent = rubro;
    a.addEventListener("click", () => {
      rubrosMenu.classList.remove("is-open");
      filtrarPorRubro(rubro);
    });

    const btnLink = document.createElement("button");
    btnLink.type = "button";
    btnLink.className = "rubro-link-copiar";
    btnLink.title = `Copiar link directo a ${rubro}`;
    btnLink.textContent = "🔗";
    btnLink.addEventListener("click", async (e) => {
      e.stopPropagation();
      const url = `${window.location.origin}${window.location.pathname}?rubro=${encodeURIComponent(rubro)}`;
      try {
        await navigator.clipboard.writeText(url);
        btnLink.textContent = "✅";
      } catch (err) {
        btnLink.textContent = url;
      }
      setTimeout(() => { btnLink.textContent = "🔗"; }, 2000);
    });

    li.append(a, btnLink);
    rubrosMenu.appendChild(li);
  });
}

// Espejo de incrementoPara() del backend, solo para mostrar el mínimo en pantalla
// (el backend siempre valida esto de nuevo del lado del servidor)
const FRANJAS_INCREMENTO_FRONTEND = [
  { hasta: 300, incremento: 10 },
  { hasta: 1000, incremento: 50 },
  { hasta: 2500, incremento: 100 },
  { hasta: 5000, incremento: 200 },
  { hasta: 10000, incremento: 500 },
  { hasta: 20000, incremento: 1000 },
  { hasta: 50000, incremento: 2000 },
  { hasta: 100000, incremento: 5000 },
  { hasta: 250000, incremento: 10000 },
  { hasta: 500000, incremento: 12500 },
  { hasta: 1000000, incremento: 15000 },
  { hasta: Infinity, incremento: 20000 },
];
// Genera 15 montos válidos consecutivos para el desplegable de "Ofertar",
// empezando en el mínimo permitido y subiendo de a un incremento por vez.
function generarOpcionesDeOferta(lote) {
  const opciones = [];
  let monto = lote.oferta_actual;
  for (let i = 0; i < 15; i++) {
    monto += incrementoParaFrontend(monto);
    opciones.push(monto);
  }
  return opciones;
}

function incrementoParaFrontend(montoActual) {
  const franja = FRANJAS_INCREMENTO_FRONTEND.find((f) => montoActual < f.hasta);
  return franja ? franja.incremento : 10000;
}

function formatoMonto(valor, moneda) {
  const simbolo = moneda === "USD" ? "US$ " : "$ ";
  return simbolo + Number(valor).toLocaleString("es-UY");
}


// Notificaciones para el administrador (ej. nuevos registros pendientes)
const notificacionesAdmin = [];
function agregarNotificacionAdmin(texto) {
  notificacionesAdmin.push(texto);
  const sesion = leerSesion();
  if (!sesion || sesion.usuario.rol !== "administrador") return;
  const wrap = document.getElementById("notificacionesWrap");
  const menu = document.getElementById("notificacionesMenu");
  const contador = document.getElementById("notificacionesCount");
  wrap.hidden = false;
  contador.hidden = false;
  contador.textContent = notificacionesAdmin.length;
  menu.innerHTML = "";
  notificacionesAdmin.forEach((t) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notificacion-item notificacion-alerta";
    btn.textContent = t;
    btn.addEventListener("click", () => {
      menu.classList.remove("is-open");
      document.getElementById("btnNotificaciones").setAttribute("aria-expanded", "false");
      mostrarSoloSeccion("usuarios");
    });
    li.appendChild(btn);
    menu.appendChild(li);
  });
}

function actualizarAvisoSuperado() {
  const aviso = document.getElementById("avisoSuperado");
  const sesion = leerSesion();
  if (!sesion || sesion.usuario.rol !== "publico") {
    aviso.hidden = true;
    document.getElementById("notificacionesWrap").hidden = true;
    return;
  }

  const teSuperaronEnAlgunLote = LOTES.some(
    (lote) => !loteEstaCerrado(lote) && estadoDeMiOferta(lote) === "perdiendo"
  );
  aviso.hidden = !teSuperaronEnAlgunLote;

  renderNotificaciones(sesion);
}

function renderNotificaciones(sesion) {
  const wrap = document.getElementById("notificacionesWrap");
  const menu = document.getElementById("notificacionesMenu");
  const contador = document.getElementById("notificacionesCount");
  wrap.hidden = false;

  const misLotes = LOTES.filter((l) => misOfertasLoteIds.has(l.id));
  const notificaciones = [];

  misLotes.forEach((lote) => {
    const estado = estadoDeMiOferta(lote);
    if (loteEstaCerrado(lote)) {
      if (estado === "ganando") {
        notificaciones.push({ lote, texto: `¡Ganaste la subasta de "${lote.titulo}"!`, tipo: "exito" });
      }
    } else if (estado === "perdiendo") {
      notificaciones.push({ lote, texto: `Te superaron en "${lote.titulo}"`, tipo: "alerta" });
    }
  });

  contador.hidden = notificaciones.length === 0;
  contador.textContent = notificaciones.length;

  if (notificaciones.length === 0) {
    menu.innerHTML = `<li class="notificaciones-vacio">No tenés notificaciones nuevas.</li>`;
    return;
  }

  menu.innerHTML = "";
  notificaciones.forEach(({ lote, texto, tipo }) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `notificacion-item notificacion-${tipo}`;
    btn.textContent = texto;
    btn.addEventListener("click", () => {
      menu.classList.remove("is-open");
      document.getElementById("btnNotificaciones").setAttribute("aria-expanded", "false");
      abrirModal(lote);
    });
    li.appendChild(btn);
    menu.appendChild(li);
  });
}

const btnNotificaciones = document.getElementById("btnNotificaciones");
const notificacionesMenu = document.getElementById("notificacionesMenu");
btnNotificaciones.addEventListener("click", () => {
  const isOpen = notificacionesMenu.classList.toggle("is-open");
  btnNotificaciones.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    const rect = btnNotificaciones.getBoundingClientRect();
    notificacionesMenu.style.top = `${rect.bottom + 4}px`;
    notificacionesMenu.style.right = `${window.innerWidth - rect.right}px`;
    notificacionesMenu.style.left = "auto";
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".notificaciones-wrap")) {
    notificacionesMenu.classList.remove("is-open");
    btnNotificaciones.setAttribute("aria-expanded", "false");
  }
});

function estadoDeMiOferta(lote) {
  const sesion = leerSesion();
  if (!sesion || sesion.usuario.rol !== "publico") return null;
  if (!misOfertasLoteIds.has(lote.id)) return null;
  return lote.ganador_actual_id === sesion.usuario.id ? "ganando" : "perdiendo";
}

function crearTarjetaLote(lote) {
  const li = document.createElement("li");
  const cerrado = loteEstaCerrado(lote);
  const gano = cerrado && estadoDeMiOferta(lote) === "ganando";
  li.className = "subasta-card" + (cerrado ? " is-cerrada" : "") + (gano ? " is-ganada" : "");
  li.dataset.loteId = lote.id;

  const favoritos = leerFavoritos();
  if (favoritos.includes(lote.id)) li.style.borderColor = "var(--accent)";

  const fotos = [lote.imagen, ...(lote.fotos_extra ? lote.fotos_extra.split("|") : [])].filter(Boolean);

  const img = document.createElement(fotos[0] ? "img" : "p");
  img.className = "subasta-img";
  if (fotos[0]) {
    img.src = fotos[0];
    img.alt = `Foto del lote ${lote.numero} — ${lote.titulo}`;
    img.onerror = () => { img.style.display = "none"; };
  } else {
    img.setAttribute("role", "img");
    img.setAttribute("aria-label", `Foto del lote ${lote.numero}`);
    img.textContent = "FOTO";
  }
  img.style.cursor = "pointer";
  img.addEventListener("click", (e) => { e.stopPropagation(); abrirLightbox(fotos, 0); });

  let contenedorFoto = img;
  if (fotos.length > 1) {
    contenedorFoto = document.createElement("div");
    contenedorFoto.className = "subasta-img-carrusel";
    contenedorFoto.style.cursor = "pointer";
    contenedorFoto.addEventListener("click", (e) => {
      if (!e.target.closest(".carrusel-flecha")) abrirLightbox(fotos, indiceFoto);
    });
    let indiceFoto = 0;
    let autoplaySuspendido = false;

    const irAFoto = (nuevoIndice, evento) => {
      if (evento) evento.stopPropagation();
      indiceFoto = (nuevoIndice + fotos.length) % fotos.length;
      img.src = fotos[indiceFoto];
    };

    const btnAnterior = document.createElement("button");
    btnAnterior.type = "button";
    btnAnterior.className = "carrusel-flecha carrusel-flecha-izq";
    btnAnterior.setAttribute("aria-label", "Foto anterior");
    btnAnterior.innerHTML = "‹";
    btnAnterior.addEventListener("click", (e) => { autoplaySuspendido = true; irAFoto(indiceFoto - 1, e); });

    const btnSiguiente = document.createElement("button");
    btnSiguiente.type = "button";
    btnSiguiente.className = "carrusel-flecha carrusel-flecha-der";
    btnSiguiente.setAttribute("aria-label", "Foto siguiente");
    btnSiguiente.innerHTML = "›";
    btnSiguiente.addEventListener("click", (e) => { autoplaySuspendido = true; irAFoto(indiceFoto + 1, e); });

    // Swipe touch
    let touchStartX = 0;
    contenedorFoto.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    contenedorFoto.addEventListener("touchend", (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) < 40) return; // ignorar taps cortos
      autoplaySuspendido = true;
      irAFoto(diff > 0 ? indiceFoto + 1 : indiceFoto - 1, null);
    }, { passive: true });

    // Autoplay: solo si hay 3 o más fotos
    if (fotos.length >= 3) {
      const intervalo = setInterval(() => {
        if (autoplaySuspendido) { clearInterval(intervalo); return; }
        irAFoto(indiceFoto + 1, null);
      }, 5000);
      // Detener el intervalo cuando el elemento se elimina del DOM
      const observer = new MutationObserver(() => {
        if (!document.contains(contenedorFoto)) { clearInterval(intervalo); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    contenedorFoto.append(img, btnAnterior, btnSiguiente);
  }

  const numero = document.createElement("p");
  numero.className = "lote-numero";
  numero.textContent = `Lote ${lote.numero}`;

  const titulo = document.createElement("h4");
  titulo.textContent = lote.titulo;

  const precio = document.createElement("p");
  precio.className = "lote-precio";
  precio.textContent = loteEstaCerrado(lote)
    ? `Oferta ganadora: ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}`
    : lote.cantidad_ofertas > 0
      ? `Oferta actual: ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}`
      : `Precio inicial: ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}`;

  const cantidadOfertas = document.createElement("p");
  cantidadOfertas.className = "lote-cantidad-ofertas";
  cantidadOfertas.textContent = lote.cantidad_ofertas === 1
    ? "1 oferta"
    : `${lote.cantidad_ofertas} ofertas`;

  const estadoPropio = estadoDeMiOferta(lote);
  let insigniaEstado = null;
  if (estadoPropio) {
    insigniaEstado = document.createElement("p");
    insigniaEstado.className = `lote-insignia lote-insignia-${estadoPropio}`;
    insigniaEstado.textContent = estadoPropio === "ganando" ? "¡Vas ganando!" : "¡Vas perdiendo!";
  } else {
    const txtPopular = insigniaPopular(lote);
    if (txtPopular) {
      insigniaEstado = document.createElement("p");
      insigniaEstado.className = "lote-insignia lote-insignia-popular";
      insigniaEstado.textContent = txtPopular;
    }
  }

  const cuenta = document.createElement("p");
  cuenta.className = "lote-cuenta";
  cuenta.textContent = loteEstaCerrado(lote) ? "Subasta finalizada" : "Cargando tiempo restante…";
  if (!loteEstaCerrado(lote)) cuenta.dataset.cierre = lote.cierre;

  const btnFavCard = document.createElement("button");
  btnFavCard.type = "button";
  btnFavCard.className = "lote-fav-btn";
  const esFav = leerFavoritos().includes(lote.id);
  btnFavCard.innerHTML = esFav ? SVG_ESTRELLA_LLENA : SVG_ESTRELLA_VACIA;
  btnFavCard.classList.toggle("is-activo", esFav);
  btnFavCard.setAttribute("aria-label", esFav ? "Quitar de favoritos" : "Agregar a favoritos");
  btnFavCard.addEventListener("click", (e) => {
    e.stopPropagation();
    const activo = toggleFavorito(lote.id);
    btnFavCard.innerHTML = activo ? SVG_ESTRELLA_LLENA : SVG_ESTRELLA_VACIA;
    btnFavCard.classList.toggle("is-activo", activo);
    btnFavCard.setAttribute("aria-label", activo ? "Quitar de favoritos" : "Agregar a favoritos");
    li.style.borderColor = activo ? "var(--accent)" : "var(--line)";
  });
  li.style.position = "relative";
  li.appendChild(btnFavCard);

  li.append(contenedorFoto, numero, titulo, precio, cantidadOfertas);
  if (insigniaEstado) li.appendChild(insigniaEstado);
  li.appendChild(cuenta);

  if (!loteEstaCerrado(lote)) {
    const formInline = document.createElement("form");
    formInline.className = "lote-oferta-inline";

    const minimoValido = lote.oferta_actual + incrementoParaFrontend(lote.oferta_actual);
    const inputInline = document.createElement("input");
    inputInline.type = "number";
    inputInline.step = "1";
    inputInline.min = String(minimoValido);
    inputInline.placeholder = `Mín. ${formatoMonto(minimoValido, lote.remate_moneda)}`;
    inputInline.setAttribute("aria-label", "Tu oferta");

    const btnInline = document.createElement("button");
    btnInline.type = "submit";
    btnInline.className = "btn btn-primary";
    btnInline.textContent = "Ofertar";
    formInline.append(inputInline, btnInline);

    const mensajeInline = document.createElement("p");
    mensajeInline.className = "lote-oferta-inline-mensaje";

    formInline.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const monto = Number(inputInline.value);
      btnInline.disabled = true;
      await enviarOferta(lote, monto, (texto, esError) => {
        mensajeInline.textContent = texto;
        mensajeInline.className = "lote-oferta-inline-mensaje " + (esError ? "error" : "exito");
        if (!esError) {
          inputInline.value = "";
          const nuevoMinimo = lote.oferta_actual + incrementoParaFrontend(lote.oferta_actual);
          inputInline.min = String(nuevoMinimo);
          inputInline.placeholder = `Mín. ${formatoMonto(nuevoMinimo, lote.remate_moneda)}`;
        }
      });
      btnInline.disabled = false;
    });
    li.appendChild(formInline);
    li.appendChild(mensajeInline);

    const linkAuto = document.createElement("button");
    linkAuto.type = "button";
    linkAuto.className = "lote-link-auto";
    linkAuto.textContent = "¿No querés estar pendiente? Configurar oferta automática";
    linkAuto.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModal(lote);
    });
    li.appendChild(linkAuto);
  }

  // Botón compartir redes sociales
  const urlLote = `${location.origin}/lote/${lote.id}`;
  const textoCompartir = `🔨 *${lote.titulo}* — Lote ${lote.numero}\n💰 ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}\n\nVer en Remate Directo: ${urlLote}`;
  const textoEncoded = encodeURIComponent(textoCompartir);
  const urlEncoded = encodeURIComponent(urlLote);

  const btnCompartir = document.createElement("button");
  btnCompartir.type = "button";
  btnCompartir.className = "lote-btn-compartir";
  btnCompartir.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Compartir`;

  const panelCompartir = document.createElement("div");
  panelCompartir.className = "compartir-panel";
  panelCompartir.hidden = true;
  panelCompartir.innerHTML = `
    <a href="https://wa.me/?text=${textoEncoded}" target="_blank" rel="noopener" class="compartir-red compartir-wa">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      WhatsApp
    </a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}" target="_blank" rel="noopener" class="compartir-red compartir-fb">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      Facebook
    </a>
    <a href="https://t.me/share/url?url=${urlEncoded}&text=${encodeURIComponent(lote.titulo)}" target="_blank" rel="noopener" class="compartir-red compartir-tg">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      Telegram
    </a>
    <a href="mailto:?subject=${encodeURIComponent(lote.titulo)}&body=${textoEncoded}" class="compartir-red compartir-mail">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      Email
    </a>
    <button type="button" class="compartir-red compartir-copy" data-url="${urlLote}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copiar link
    </button>
  `;

  panelCompartir.querySelector(".compartir-copy").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText(urlLote).catch(() => {});
    e.currentTarget.textContent = "✅ ¡Copiado!";
    setTimeout(() => { e.currentTarget.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar link`; }, 2000);
  });

  btnCompartir.addEventListener("click", (e) => {
    e.stopPropagation();
    panelCompartir.hidden = !panelCompartir.hidden;
  });

  li.appendChild(btnCompartir);
  li.appendChild(panelCompartir);

  return li;
}

// Agrupa los lotes por remate y arma un bloque por remate con su propia sub-grilla
function crearGrupoRemate(remate, lotesDelRemate) {
  const li = document.createElement("li");
  li.className = "subasta-card remate-tarjeta-portada";
  li.dataset.remateId = remate.id;
  li.dataset.rubro = remate.rubro;
  li.style.cursor = "pointer";
  li.setAttribute("role", "button");
  li.setAttribute("tabindex", "0");
  li.setAttribute("aria-label", `Ver lotes de ${remate.titulo}`);
  const abrir = () => abrirRemateDetalle(remate, lotesDelRemate, li);
  li.addEventListener("click", abrir);
  li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });

  const primerLote = lotesDelRemate.find((l) => l.imagen) || lotesDelRemate[0];
  const srcPortada = remate.imagen_portada || (primerLote && primerLote.imagen) || null;
  const portada = document.createElement(srcPortada ? "img" : "p");
  portada.className = "subasta-img";
  if (srcPortada) {
    portada.src = srcPortada;
    portada.alt = `Foto de portada de ${remate.titulo}`;
  } else {
    portada.setAttribute("role", "img");
    portada.setAttribute("aria-label", `Foto de portada de ${remate.titulo}`);
    portada.textContent = "FOTO";
  }

  const titulo = document.createElement("h4");
  titulo.textContent = remate.titulo;

  const rubro = document.createElement("p");
  rubro.className = "remate-grupo-rubro";
  rubro.textContent = remate.rubro;

  const cantidad = document.createElement("p");
  cantidad.className = "lote-cantidad-ofertas";
  cantidad.textContent = lotesDelRemate.length === 1 ? "1 lote" : `${lotesDelRemate.length} lotes`;

  li.append(portada, titulo, rubro, cantidad);
  return li;
}

function renderGridComoListaDeLotes(grid, titulo, descripcion, lotes) {
  mostrarSoloSeccion("activas");
  grid.classList.remove("grid-slider");
  grid.innerHTML = "";
  grid.classList.remove("grid-fade-in");
  void grid.offsetWidth; // reinicia la animación aunque se repita la misma vista
  grid.classList.add("grid-fade-in");

  const encabezadoFila = document.createElement("li");
  encabezadoFila.className = "remate-volver";
  const volverBtn = document.createElement("button");
  volverBtn.type = "button";
  volverBtn.className = "btn-volver";
  volverBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Volver a los remates`;
  volverBtn.addEventListener("click", volverAHome);
  const tituloFila = document.createElement("h3");
  tituloFila.className = "remate-detalle-titulo";
  tituloFila.textContent = titulo;
  encabezadoFila.append(volverBtn, tituloFila);
  grid.appendChild(encabezadoFila);

  if (descripcion) {
    const descripcionLi = document.createElement("li");
    descripcionLi.className = "remate-detalle-encabezado";
    descripcionLi.innerHTML = `<p class="remate-grupo-descripcion">${descripcion}</p>`;
    grid.appendChild(descripcionLi);
  }

  if (lotes.length === 0) {
    const vacio = document.createElement("li");
    vacio.className = "panel-lote-info";
    vacio.textContent = "No se encontró ningún lote.";
    grid.appendChild(vacio);
    return;
  }

  lotes.forEach((lote) => grid.appendChild(crearTarjetaLote(lote)));
  activarScrollReveal(grid);
}

function abrirRemateDetalle(remate, lotesDelRemate, tarjetaOrigen) {
  const grid = tarjetaOrigen.closest(".subastas-grid");
  if (!grid) return;
  renderGridComoListaDeLotes(grid, remate.titulo, remate.descripcion, lotesDelRemate);
}

function renderLotes() {
  const activasGrid = document.getElementById("activasGrid");
  activasGrid.innerHTML = "";
  activasGrid.classList.add("grid-slider");
  activasGrid.classList.remove("grid-fade-in");
  void activasGrid.offsetWidth;
  activasGrid.classList.add("grid-fade-in");

  REMATES.forEach((remate) => {
    const lotesActivos = LOTES.filter((l) => l.remate_id === remate.id && !loteEstaCerrado(l));
    if (lotesActivos.length > 0) {
      activasGrid.appendChild(crearGrupoRemate(remate, lotesActivos));
    }
  });

  if (activasGrid.children.length === 0) {
    activasGrid.innerHTML = `
      <li class="subastas-vacias">
        <div class="subastas-vacias-icono">🔨</div>
        <h3>Próximamente nuevas subastas</h3>
        <p>Todavía no hay subastas activas en este momento.<br>Registrate para recibir notificaciones cuando publiquemos nuevos remates.</p>
        <button type="button" class="btn btn-primary" id="btnRegistrarseVacio">Registrarme gratis</button>
      </li>`;
    document.getElementById("btnRegistrarseVacio")?.addEventListener("click", () => abrirLogin("registro"));
  }

  // Llenar select de rubros en filtros
  const rubroSelect = document.getElementById("filtroRubroSelect");
  if (rubroSelect) {
    const rubros = [...new Set(LOTES.filter(l => !loteEstaCerrado(l)).map(l => l.remate_rubro || l.rubro).filter(Boolean))].sort();
    rubroSelect.innerHTML = `<option value="">Todos los rubros</option>` + rubros.map(r => `<option value="${r}">${r}</option>`).join("");
  }
  activarScrollReveal(activasGrid);

  renderCarruselesPorRubro();
}

function renderFinalizadasPagina() {
  const finalizadasGrid = document.getElementById("finalizadasGrid");
  finalizadasGrid.innerHTML = "";

  REMATES.forEach((remate) => {
    const lotesFinalizados = LOTES.filter((l) => l.remate_id === remate.id && loteEstaCerrado(l));
    if (lotesFinalizados.length > 0) {
      finalizadasGrid.appendChild(crearGrupoRemate(remate, lotesFinalizados));
    }
  });

  if (finalizadasGrid.children.length === 0) {
    finalizadasGrid.innerHTML = `<li class="aviso-backend">Todavía no hay subastas finalizadas.</li>`;
  }
  activarScrollReveal(finalizadasGrid);
}

function renderTodosLosLotesPagina() {
  const grid = document.getElementById("todosLosLotesGrid");
  grid.innerHTML = "";

  const activos = LOTES.filter((l) => !loteEstaCerrado(l));
  activos.forEach((lote) => grid.appendChild(crearTarjetaLote(lote)));

  if (grid.children.length === 0) {
    grid.innerHTML = `<li class="aviso-backend">Todavía no hay lotes activos.</li>`;
  }
  activarScrollReveal(grid);
}

// Un carrusel horizontal por rubro, con los lotes activos de ese rubro —
// estilo catálogo (como pradorematesenlinea / bavastro), en vez de
// agrupar solo por remate individual.
function renderCarruselesPorRubro() {
  const contenedor = document.getElementById("carruselesPorRubro");
  contenedor.innerHTML = "";

  const activos = LOTES.filter((l) => !loteEstaCerrado(l));
  const rubros = [...new Set(activos.map((l) => l.rubro || l.remate_rubro))].filter(Boolean);

  rubros.forEach((rubro) => {
    const lotesDelRubro = activos.filter((l) => (l.rubro || l.remate_rubro) === rubro);
    if (lotesDelRubro.length === 0) return;

    const seccion = document.createElement("section");
    seccion.className = "carrusel-rubro";

    const encabezado = document.createElement("div");
    encabezado.className = "carrusel-rubro-encabezado";
    const h2 = document.createElement("h2");
    h2.textContent = rubro;
    const link = document.createElement("a");
    link.href = `?rubro=${encodeURIComponent(rubro)}`;
    link.textContent = "Ver rubro completo";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      // Mostrar todos los lotes del rubro directamente en la sección activas
      mostrarSoloSeccion("activas");
      const activasGrid = document.getElementById("activasGrid");
      const lotesDelRubroActivos = LOTES.filter(l => !loteEstaCerrado(l) && (l.remate_rubro || l.rubro) === rubro);
      renderGridComoListaDeLotes(activasGrid, rubro, "", lotesDelRubroActivos);
      const resultado = document.getElementById("filtrosResultado");
      if (resultado) {
        resultado.hidden = false;
        resultado.textContent = `${lotesDelRubroActivos.length} lote${lotesDelRubroActivos.length !== 1 ? "s" : ""} en ${rubro}`;
      }
      const btnLimpiar = document.getElementById("btnLimpiarFiltros");
      if (btnLimpiar) btnLimpiar.hidden = false;
      setTimeout(() => {
        document.getElementById("activas").scrollIntoView({ behavior: "smooth" });
      }, 50);
    });
    encabezado.append(h2, link);

    const grid = document.createElement("ul");
    grid.className = "subastas-grid grid-slider";
    lotesDelRubro.forEach((lote) => grid.appendChild(crearTarjetaLote(lote)));

    seccion.append(encabezado, grid);
    contenedor.appendChild(seccion);
    activarScrollReveal(grid);
  });
}

function actualizarCuentasRegresivas() {
  document.querySelectorAll(".lote-cuenta[data-cierre]").forEach((el) => {
    const restante = new Date(el.dataset.cierre) - new Date();
    const urgente = restante > 0 && restante < 60 * 60 * 1000; // menos de 1 hora
    const vencido = restante <= 0;
    el.innerHTML = vencido ? "Cerrado" : formatoTiempoRestante(restante, urgente);
    el.classList.toggle("lote-cuenta-urgente", urgente);
    el.classList.toggle("lote-cuenta-vencida", vencido);

    if (vencido) {
      const tarjeta = el.closest(".subasta-card");
      if (tarjeta) {
        tarjeta.querySelector(".lote-oferta-inline")?.remove();
        tarjeta.querySelector(".lote-oferta-inline-mensaje")?.remove();
        tarjeta.querySelector(".lote-link-auto")?.remove();

        const precioEl = tarjeta.querySelector(".lote-precio");
        const loteId = Number(tarjeta.dataset.loteId);
        const lote = LOTES.find((l) => l.id === loteId);
        if (precioEl && lote) {
          precioEl.textContent = `Oferta ganadora: ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}`;
        }

        const insignia = tarjeta.querySelector(".lote-insignia");
        if (insignia) {
          const gane = lote && estadoDeMiOferta(lote) === "ganando";
          if (gane) {
            insignia.className = "lote-insignia lote-insignia-ganando";
            insignia.textContent = "¡Ganaste la subasta!";
          } else {
            insignia.remove();
          }
        }
      }
    }
  });
}
function formatoTiempoRestante(ms, urgente) {
  const horas = Math.floor(ms / (1000 * 60 * 60));
  const minutos = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const segundos = Math.floor((ms % (1000 * 60)) / 1000);
  if (horas >= 24) return `Faltan ${Math.floor(horas / 24)} día(s) ${horas % 24} hs`;
  if (urgente) return `<span class="icono-inline">${SVG_RELOJ}</span> Faltan ${minutos} min ${segundos} s`;
  return `Faltan ${horas} hs ${minutos} min`;
}
setInterval(actualizarCuentasRegresivas, 1000);
// Además, mientras el modal de un lote está abierto, se refresca cada 1s (ver abrirModal)

// ===== Lightbox de fotos =====
{
  const overlay = document.getElementById("lightboxOverlay");
  const imgEl = document.getElementById("lightboxImg");
  const contador = document.getElementById("lightboxContador");
  const btnClose = document.getElementById("lightboxClose");
  const btnPrev = document.getElementById("lightboxPrev");
  const btnNext = document.getElementById("lightboxNext");
  let fotosLightbox = [];
  let indiceActual = 0;

  function mostrarFoto(i) {
    indiceActual = (i + fotosLightbox.length) % fotosLightbox.length;
    imgEl.src = fotosLightbox[indiceActual];
    contador.textContent = fotosLightbox.length > 1 ? `${indiceActual + 1} / ${fotosLightbox.length}` : "";
    btnPrev.hidden = fotosLightbox.length <= 1;
    btnNext.hidden = fotosLightbox.length <= 1;
  }

  window.abrirLightbox = function(fotos, indice) {
    fotosLightbox = fotos;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    mostrarFoto(indice);
    btnClose.focus();
  };

  function cerrarLightbox() {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  btnClose.addEventListener("click", cerrarLightbox);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrarLightbox(); });
  btnPrev.addEventListener("click", (e) => { e.stopPropagation(); mostrarFoto(indiceActual - 1); });
  btnNext.addEventListener("click", (e) => { e.stopPropagation(); mostrarFoto(indiceActual + 1); });

  // Swipe en lightbox
  let touchStartX = 0;
  overlay.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) mostrarFoto(indiceActual + (diff > 0 ? 1 : -1));
  }, { passive: true });

  // Teclado
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") cerrarLightbox();
    if (e.key === "ArrowRight") mostrarFoto(indiceActual + 1);
    if (e.key === "ArrowLeft") mostrarFoto(indiceActual - 1);
  });
}

// ===== Favoritos (siguen siendo locales del navegador, no requieren login) =====
function leerFavoritos() {
  try {
    return JSON.parse(localStorage.getItem("favoritos") || "[]");
  } catch (e) {
    return [];
  }
}
function toggleFavorito(loteId) {
  const favoritos = leerFavoritos();
  const index = favoritos.indexOf(loteId);
  if (index === -1) favoritos.push(loteId);
  else favoritos.splice(index, 1);
  localStorage.setItem("favoritos", JSON.stringify(favoritos));
  return favoritos.includes(loteId);
}

// ===== Modal de lote =====
const modalOverlay = document.getElementById("modalOverlay");
const modalClose = document.getElementById("modalClose");
let loteAbierto = null;
let intervaloModal = null;
let elementoAntesDelModal = null;

async function cargarGaleriaModal(lote) {
  const galeria = document.getElementById("modalGaleria");
  galeria.innerHTML = "";
  galeria.hidden = true;

  try {
    const resp = await fetch(`${API_URL}/lotes/${lote.id}/fotos`);
    if (!resp.ok) return;
    const fotos = await resp.json();
    if (fotos.length === 0) return;

    // La foto principal también aparece como primera miniatura, para volver a ella
    const todas = [{ url: lote.imagen }, ...fotos];
    todas.forEach((foto) => {
      if (!foto.url) return;
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = foto.url;
      img.alt = "Miniatura";
      img.addEventListener("click", () => {
        document.querySelector("#modalImg img").src = foto.url;
      });
      li.appendChild(img);
      galeria.appendChild(li);
    });
    galeria.hidden = false;
  } catch (err) {
    // sin galería si falla, no es crítico
  }
}

function abrirModal(lote) {
  loteAbierto = lote;
  elementoAntesDelModal = document.activeElement;

  const mensajePrevio = document.getElementById("ofertaMensaje");
  mensajePrevio.textContent = "";
  mensajePrevio.className = "oferta-mensaje";
  document.getElementById("montoOferta").removeAttribute("aria-invalid");

  document.getElementById("modalNumero").textContent = `Lote ${lote.numero}`;
  document.getElementById("modalTitulo").textContent = lote.titulo;
  document.getElementById("modalCategoria").textContent = lote.rubro;
  document.getElementById("modalDescripcion").textContent = lote.descripcion || "";

  const fichaLista = document.getElementById("modalFichaTecnica");
  const campos = [
    ["Estado", lote.condicion],
    ["Marca / Modelo", lote.marca_modelo],
    ["Material", lote.material],
    ["Medidas", lote.dimensiones],
    ["Año", lote.anio],
  ].filter(([, valor]) => valor);
  fichaLista.innerHTML = campos.map(([etiqueta, valor]) => `<li><strong>${etiqueta}:</strong> ${valor}</li>`).join("");
  fichaLista.hidden = campos.length === 0;

  const modalImgContenedor = document.getElementById("modalImg");
  modalImgContenedor.innerHTML = "";
  if (lote.imagen) {
    const img = document.createElement("img");
    img.src = lote.imagen;
    img.alt = `Foto del lote ${lote.numero}`;
    img.className = "modal-img-real";
    img.onerror = () => { img.style.display = "none"; };
    modalImgContenedor.appendChild(img);
  } else {
    modalImgContenedor.textContent = "FOTO";
  }

  cargarGaleriaModal(lote);

  const estadoPrecio = document.getElementById("modalEstadoPrecio");
  const precio = document.getElementById("modalPrecio");
  const estadoCierre = document.getElementById("modalEstadoCierre");
  const cuenta = document.getElementById("modalCuentaRegresiva");
  const form = document.getElementById("formOferta");
  const minimoModal = lote.oferta_actual + incrementoParaFrontend(lote.oferta_actual);
  document.getElementById("montoOferta").placeholder = `Mín. ${formatoMonto(minimoModal, lote.remate_moneda)}`;
  document.getElementById("montoMaximo").placeholder = `Tu tope máximo (mín. ${formatoMonto(minimoModal, lote.remate_moneda)})`;

  document.getElementById("modalCantidadOfertas").textContent =
    lote.cantidad_ofertas === 1 ? "1 oferta" : `${lote.cantidad_ofertas} ofertas`;

  const insigniaModal = document.getElementById("modalInsigniaEstado");
  const estadoPropioModal = estadoDeMiOferta(lote);
  if (estadoPropioModal) {
    insigniaModal.hidden = false;
    insigniaModal.className = `lote-insignia lote-insignia-${estadoPropioModal}`;
    insigniaModal.textContent = estadoPropioModal === "ganando" ? "¡Vas ganando!" : "¡Vas perdiendo!";
  } else {
    insigniaModal.hidden = true;
  }

  if (loteEstaCerrado(lote)) {
    estadoPrecio.textContent = "Oferta ganadora";
    precio.textContent = formatoMonto(lote.oferta_actual, lote.remate_moneda);
    estadoCierre.textContent = "Cierre";
    cuenta.textContent = new Date(lote.cierre).toLocaleDateString("es-UY");
    form.hidden = true;
    document.querySelector(".oferta-auto-detalle").hidden = true;
  } else {
    form.hidden = true; // la oferta manual se hace desde la card, no desde el modal
    estadoPrecio.textContent = lote.cantidad_ofertas > 0 ? "Oferta actual" : "Precio inicial";
    precio.textContent = formatoMonto(lote.oferta_actual, lote.remate_moneda);
    estadoCierre.textContent = "Tiempo restante";
    actualizarCuentaModal();
    intervaloModal = setInterval(actualizarCuentaModal, 1000);
  }

  const favoritos = leerFavoritos();
  const btnFav = document.getElementById("btnFavorito");
  const esFavorito = favoritos.includes(lote.id);
  btnFav.innerHTML = esFavorito ? `${SVG_ESTRELLA_LLENA} En tus favoritos` : `${SVG_ESTRELLA_VACIA} Agregar a favoritos`;
  btnFav.classList.toggle("is-activo", esFavorito);

  modalOverlay.hidden = false;
  // Actualizar URL a formato limpio /lote/id
  window.history.pushState({ loteId: lote.id }, `Lote ${lote.numero} — ${lote.titulo}`, `/lote/${lote.id}`);
  document.title = `${lote.titulo} — Remate Directo`;

  // Registrar vista y mostrar contador
  registrarVistaLote(lote.id);

  // Cargar historial de precios
  cargarHistorialPrecios(lote);

  if (lote.estado !== "finalizada") {
    document.getElementById("montoMaximo").focus();
  } else {
    modalClose.focus();
  }
}

function actualizarCuentaModal() {
  if (!loteAbierto) return;
  const cuenta = document.getElementById("modalCuentaRegresiva");
  const restante = new Date(loteAbierto.cierre) - new Date();
  const urgente = restante > 0 && restante < 60 * 60 * 1000;
  const vencido = restante <= 0;
  cuenta.innerHTML = vencido ? "Cerrado" : formatoTiempoRestante(restante, urgente);
  cuenta.classList.toggle("lote-cuenta-urgente", urgente);
  cuenta.classList.toggle("lote-cuenta-vencida", vencido);

  if (vencido) {
    document.getElementById("formOferta").hidden = true;
    document.querySelector(".oferta-auto-detalle").hidden = true;
    document.getElementById("modalEstadoPrecio").textContent = "Oferta ganadora";

    const insigniaModal = document.getElementById("modalInsigniaEstado");
    const gane = estadoDeMiOferta(loteAbierto) === "ganando";
    if (gane) {
      insigniaModal.hidden = false;
      insigniaModal.className = "lote-insignia lote-insignia-ganando";
      insigniaModal.textContent = "¡Ganaste la subasta!";
    } else {
      insigniaModal.hidden = true;
    }

    clearInterval(intervaloModal);
  }
}

function cerrarModal() {
  modalOverlay.hidden = true;
  if (intervaloModal) clearInterval(intervaloModal);
  loteAbierto = null;
  // Restaurar URL y título
  window.history.pushState({}, "¿Quién Da Más?", "/");
  document.title = "¿Quién Da Más? — Remates Online · Canal 10";
  if (elementoAntesDelModal) elementoAntesDelModal.focus();
}
modalClose.addEventListener("click", cerrarModal);
modalOverlay.addEventListener("click", (event) => {
  if (event.target === modalOverlay) cerrarModal();
});
// Cerrar modal al presionar atrás en el navegador
window.addEventListener("popstate", () => {
  if (!modalOverlay.hidden) {
    modalOverlay.hidden = true;
    if (intervaloModal) clearInterval(intervaloModal);
    loteAbierto = null;
    document.title = "Remate Directo";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (ignorarProximoEscape) { ignorarProximoEscape = false; return; }
    if (!modalOverlay.hidden) cerrarModal();
    if (!loginOverlay.hidden) cerrarLogin();
    if (!restablecerOverlay.hidden) restablecerOverlay.hidden = true;
  }
});

// ===== Atrapar el foco de teclado dentro del modal abierto (accesibilidad) =====
function overlayAbiertoActual() {
  const overlays = [modalOverlay, loginOverlay, restablecerOverlay];
  return overlays.find((o) => o && !o.hidden) || null;
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const overlay = overlayAbiertoActual();
  if (!overlay) return;

  const focosSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focosVisibles = Array.from(overlay.querySelectorAll(focosSelector)).filter((el) => !el.closest("[hidden]"));
  if (focosVisibles.length === 0) return;

  const primero = focosVisibles[0];
  const ultimo = focosVisibles[focosVisibles.length - 1];

  if (event.shiftKey && document.activeElement === primero) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault();
    primero.focus();
  }
});

// ===== Ofertar — requiere estar logueado como público general =====
async function retomarOfertaPendiente() {
  if (!ofertaPendiente) return;
  const { loteId, monto } = ofertaPendiente;
  ofertaPendiente = null;

  const lote = LOTES.find((l) => l.id === loteId);
  if (!lote) return;

  await enviarOferta(lote, monto, (texto, esError) => {
    alert(esError ? texto : `¡Listo! ${texto}`);
  });
  renderLotes();
}

async function enviarOferta(lote, monto, onMensaje) {
  const sesion = leerSesion();
  if (!sesion) {
    if (monto) ofertaPendiente = { loteId: lote.id, monto };
    onMensaje("Casi listo — iniciá sesión o registrate para confirmar tu oferta.", true);
    cerrarModal();
    abrirLogin("registro");
    return;
  }
  if (sesion.usuario.rol !== "publico") {
    onMensaje("Solo las cuentas de público general pueden ofertar.", true);
    return;
  }
  if (!monto) {
    onMensaje("Ingresá un monto válido.", true);
    return;
  }

  const confirmado = await confirmarEnPagina(
    `¿Confirmás tu oferta de ${formatoMonto(monto, lote.remate_moneda)} por "${lote.titulo}"?\n\nUna vez enviada, no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    const resp = await fetch(`${API_URL}/ofertas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify({ loteId: lote.id, monto }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      onMensaje(data.error || "No se pudo registrar la oferta.", true);
      return;
    }

    lote.oferta_actual = data.ofertaActual;
    lote.cierre = data.cierre;
    lote.ganador_actual_id = sesion.usuario.id;
    lote.cantidad_ofertas = (lote.cantidad_ofertas || 0) + 1;
    misOfertasLoteIds.add(lote.id);

    if (loteAbierto && loteAbierto.id === lote.id) {
      document.getElementById("modalPrecio").textContent = formatoMonto(data.ofertaActual);
      document.getElementById("modalCantidadOfertas").textContent =
        lote.cantidad_ofertas === 1 ? "1 oferta" : `${lote.cantidad_ofertas} ofertas`;
      const insigniaModal = document.getElementById("modalInsigniaEstado");
      insigniaModal.hidden = false;
      insigniaModal.className = "lote-insignia lote-insignia-ganando";
      insigniaModal.textContent = "¡Vas ganando!";
    }

    const tarjeta = document.querySelector(`.subasta-card[data-lote-id="${lote.id}"]`);
    if (tarjeta) {
      const precioEl = tarjeta.querySelector(".lote-precio");
      precioEl.textContent = `Oferta actual: ${formatoMonto(data.ofertaActual)}`;
      precioEl.classList.remove("lote-precio-destello");
      void precioEl.offsetWidth; // fuerza el reinicio de la animación si ya se había disparado
      precioEl.classList.add("lote-precio-destello");
      tarjeta.querySelector(".lote-cuenta").dataset.cierre = data.cierre;
      const contadorOfertas = tarjeta.querySelector(".lote-cantidad-ofertas");
      if (contadorOfertas) {
        contadorOfertas.textContent = lote.cantidad_ofertas === 1 ? "1 oferta" : `${lote.cantidad_ofertas} ofertas`;
      }
      let insigniaTarjeta = tarjeta.querySelector(".lote-insignia");
      if (!insigniaTarjeta) {
        insigniaTarjeta = document.createElement("p");
        tarjeta.insertBefore(insigniaTarjeta, tarjeta.querySelector(".lote-cuenta"));
      }
      insigniaTarjeta.className = "lote-insignia lote-insignia-ganando";
      insigniaTarjeta.textContent = "¡Vas ganando!";
    }

    onMensaje(`¡Oferta registrada por ${formatoMonto(data.ofertaActual)}!`, false);
  } catch (err) {
    onMensaje("No se pudo conectar con el servidor.", true);
  }
}

document.getElementById("formOferta").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loteAbierto) return;

  const input = document.getElementById("montoOferta");
  const mensaje = document.getElementById("ofertaMensaje");
  const monto = Number(input.value);

  await enviarOferta(loteAbierto, monto, (texto, esError) => {
    mensaje.textContent = texto;
    mensaje.className = "oferta-mensaje " + (esError ? "error" : "exito");
    if (!esError) {
      input.value = "";
      const nuevoMinimo = loteAbierto.oferta_actual + incrementoParaFrontend(loteAbierto.oferta_actual);
      input.min = String(nuevoMinimo);
      input.placeholder = `Mín. ${formatoMonto(nuevoMinimo, loteAbierto.remate_moneda)}`;
      document.getElementById("montoMaximo").placeholder = `Tu tope máximo (mín. ${formatoMonto(nuevoMinimo, loteAbierto.remate_moneda)})`;
    }
  });
});

// ===== Oferta automática (puja proxy con tope máximo) =====
document.getElementById("formOfertaAuto").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loteAbierto) return;

  const input = document.getElementById("montoMaximo");
  const mensaje = document.getElementById("ofertaAutoMensaje");
  const montoMaximo = Number(input.value);
  const sesion = leerSesion();

  if (!sesion) {
    mensaje.textContent = "Tenés que iniciar sesión para activar esto.";
    mensaje.className = "oferta-mensaje error";
    cerrarModal();
    abrirLogin("login");
    return;
  }
  if (sesion.usuario.rol !== "publico") {
    mensaje.textContent = "Solo las cuentas de público general pueden ofertar.";
    mensaje.className = "oferta-mensaje error";
    return;
  }
  if (!montoMaximo) {
    mensaje.textContent = "Ingresá un monto máximo válido.";
    mensaje.className = "oferta-mensaje error";
    return;
  }

  const confirmado = await confirmarEnPagina(
    `¿Confirmás activar una oferta automática por "${loteAbierto.titulo}" con un máximo de ${formatoMonto(montoMaximo, loteAbierto.remate_moneda)}?\n\nEl sistema va a ofertar por vos hasta ese monto. No se puede deshacer una oferta ya realizada.`
  );
  if (!confirmado) return;

  try {
    const resp = await fetch(`${API_URL}/ofertas/automatica`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify({ loteId: loteAbierto.id, montoMaximo }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      mensaje.textContent = data.error || "No se pudo activar la oferta automática.";
      mensaje.className = "oferta-mensaje error";
      return;
    }

    loteAbierto.oferta_actual = data.ofertaActual;
    loteAbierto.cierre = data.cierre;
    misOfertasLoteIds.add(loteAbierto.id);

    const modalPrecioEl = document.getElementById("modalPrecio");
    modalPrecioEl.textContent = formatoMonto(data.ofertaActual, loteAbierto.remate_moneda);
    document.getElementById("modalEstadoPrecio").textContent = "Oferta actual";
    modalPrecioEl.classList.remove("lote-precio-destello");
    void modalPrecioEl.offsetWidth;
    modalPrecioEl.classList.add("lote-precio-destello");

    const tarjeta = document.querySelector(`.subasta-card[data-lote-id="${loteAbierto.id}"]`);
    if (tarjeta) {
      const precioEl = tarjeta.querySelector(".lote-precio");
      precioEl.textContent = `Oferta actual: ${formatoMonto(data.ofertaActual, loteAbierto.remate_moneda)}`;
      precioEl.classList.remove("lote-precio-destello");
      void precioEl.offsetWidth;
      precioEl.classList.add("lote-precio-destello");
      tarjeta.querySelector(".lote-cuenta").dataset.cierre = data.cierre;
    }

    mensaje.textContent = data.vasGanando
      ? `¡Listo! Vas ganando por ahora, con oferta automática hasta ${formatoMonto(montoMaximo, loteAbierto.remate_moneda)}.`
      : `Activada. Ya alguien más está por encima de tu máximo (${formatoMonto(montoMaximo, loteAbierto.remate_moneda)}).`;
    mensaje.className = "oferta-mensaje " + (data.vasGanando ? "exito" : "error");
  } catch (err) {
    mensaje.textContent = "No se pudo conectar con el servidor.";
    mensaje.className = "oferta-mensaje error";
  }
});

// ===== Favoritos: botón del modal =====
document.getElementById("btnFavorito").addEventListener("click", () => {
  if (!loteAbierto) return;
  const btn = document.getElementById("btnFavorito");
  const esFavorito = toggleFavorito(loteAbierto.id);
  btn.innerHTML = esFavorito ? `${SVG_ESTRELLA_LLENA} En tus favoritos` : `${SVG_ESTRELLA_VACIA} Agregar a favoritos`;
  btn.classList.toggle("is-activo", esFavorito);

  const tarjeta = document.querySelector(`.subasta-card[data-lote-id="${loteAbierto.id}"]`);
  if (tarjeta) tarjeta.style.borderColor = esFavorito ? "var(--accent)" : "var(--line)";
});

document.getElementById("btnCompartirLote").addEventListener("click", async () => {
  if (!loteAbierto) return;
  const btn = document.getElementById("btnCompartirLote");
  const url = `${window.location.origin}/lote/${loteAbierto.id}`;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "✅ Link copiado";
  } catch (err) {
    btn.textContent = url;
  }
  setTimeout(() => { btn.textContent = "🔗 Copiar link de este lote"; }, 2000);
});

/* ==========================================================================
   PANEL DE REMATES Y LOTES (rematador / administrador)
   Un remate agrupa varios lotes bajo un mismo rubro. El rematador ve y
   gestiona solo sus propios remates; el administrador ve y gestiona todos.
   ========================================================================== */
const panelMensaje = document.getElementById("panelMensaje");
const formNuevoRemate = document.getElementById("formNuevoRemate");
const botonGuardarRemate = document.getElementById("botonGuardarRemate");
const botonCancelarEdicionRemate = document.getElementById("botonCancelarEdicionRemate");
const formRemateTitulo = document.getElementById("formRemateTitulo");
let remateEnEdicionId = null;

const estadisticasOverlay = document.getElementById("estadisticasOverlay");
document.getElementById("estadisticasClose").addEventListener("click", () => { estadisticasOverlay.hidden = true; });
estadisticasOverlay.addEventListener("click", (event) => {
  if (event.target === estadisticasOverlay) estadisticasOverlay.hidden = true;
});

async function abrirEstadisticasRemate(remate) {
  const sesion = leerSesion();
  if (!sesion) return;

  document.getElementById("estadisticasTitulo").textContent = remate.titulo;
  document.getElementById("estadisticasSubtitulo").textContent = "Calculando…";
  document.getElementById("estadisticasGrid").innerHTML = "";
  estadisticasOverlay.hidden = false;

  try {
    const resp = await fetch(`${API_URL}/remates/${remate.id}/estadisticas`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const datos = await resp.json();
    if (!resp.ok) {
      document.getElementById("estadisticasSubtitulo").textContent = datos.error || "No se pudieron cargar las estadísticas.";
      return;
    }

    document.getElementById("estadisticasSubtitulo").textContent = "";

    const tarjetas = [
      { valor: `${datos.totalLotes}`, etiqueta: "Lotes en el remate" },
      { valor: `${datos.lotesVendidos} (${datos.porcentajeVendido}%)`, etiqueta: "Lotes vendidos" },
      { valor: formatoMonto(datos.totalFacturado, datos.moneda), etiqueta: "Total facturado" },
      { valor: formatoMonto(datos.comisionGenerada, datos.moneda), etiqueta: "Comisión generada (18,3%)" },
      { valor: `${datos.totalOfertas}`, etiqueta: "Ofertas recibidas en total" },
      { valor: `${datos.ofertasAutomaticas}`, etiqueta: "Ofertas automáticas configuradas" },
      {
        valor: datos.duracionMinutos === null ? "—" : `${Math.floor(datos.duracionMinutos / 60)} hs ${datos.duracionMinutos % 60} min`,
        etiqueta: "Duración de la actividad (1ª a última oferta)",
      },
      {
        valor: datos.promedioSegundosPorLote === null ? "—" : `${Math.round(datos.promedioSegundosPorLote / 60)} min`,
        etiqueta: "Promedio por lote vendido",
      },
    ];

    const grid = document.getElementById("estadisticasGrid");
    tarjetas.forEach(({ valor, etiqueta }) => {
      const tarjeta = document.createElement("div");
      tarjeta.className = "estadistica-tarjeta";
      tarjeta.innerHTML = `<strong>${valor}</strong><span>${etiqueta}</span>`;
      grid.appendChild(tarjeta);
    });
  } catch (err) {
    document.getElementById("estadisticasSubtitulo").textContent = "No se pudo conectar con el servidor.";
  }
}

function cargarRemateEnFormulario(remate) {
  cambiarPanelTab("remates");
  remateEnEdicionId = remate.id;

  document.getElementById("remateTitulo").value = remate.titulo;
  document.getElementById("remateRubro").value = remate.rubro;
  document.getElementById("remateDescripcion").value = remate.descripcion || "";
  document.getElementById("remateMoneda").value = remate.moneda || "UYU";

  // Cargar fecha_inicio si existe (formato datetime-local)
  const fechaInicio = remate.fecha_inicio ? remate.fecha_inicio.replace(" ", "T").slice(0, 16) : "";
  const inputFecha = document.getElementById("remoteFechaInicio");
  if (inputFecha) inputFecha.value = fechaInicio;

  formRemateTitulo.textContent = `Editando remate: ${remate.titulo}`;
  botonGuardarRemate.textContent = "Guardar cambios";
  botonCancelarEdicionRemate.hidden = false;
  document.getElementById("remateTitulo").focus();
  document.getElementById("remateTitulo").scrollIntoView({ behavior: "smooth", block: "center" });
}

function salirModoEdicionRemate() {
  remateEnEdicionId = null;
  formRemateTitulo.textContent = "Crear un remate nuevo";
  botonGuardarRemate.textContent = "Crear remate";
  botonCancelarEdicionRemate.hidden = true;
  formNuevoRemate.reset();
}
botonCancelarEdicionRemate.addEventListener("click", salirModoEdicionRemate);
const formNuevoLote = document.getElementById("formNuevoLote");
let urlFotoSubida = ""; // se llena al elegir un archivo y subirlo con éxito
let fotosExtraSubidas = []; // URLs de las fotos adicionales (2da en adelante), pendientes de asociar al lote
let loteImagenActual = ""; // la foto que ya tenía el lote, por si se edita sin cambiarla
let ignorarProximoEscape = false; // Windows a veces manda un Escape fantasma al cerrar el selector de archivos

// ===== Compresión de imágenes antes de subir =====
async function comprimirImagen(archivo, maxWidth = 1400, calidad = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(new File([blob], archivo.name, { type: "image/jpeg" })), "image/jpeg", calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(archivo); }; // fallback sin compresión
    img.src = url;
  });
}

document.getElementById("panelImagen").addEventListener("change", async (event) => {
  ignorarProximoEscape = true;
  setTimeout(() => { ignorarProximoEscape = false; }, 500);

  const archivos = Array.from(event.target.files);
  const nota = document.getElementById("panelImagenNota");
  if (archivos.length === 0) return;

  const sesion = leerSesion();
  if (!sesion) return;

  urlFotoSubida = "";
  fotosExtraSubidas = [];
  const urlsSubidas = [];

  for (let i = 0; i < archivos.length; i++) {
    nota.textContent = `Comprimiendo y subiendo foto ${i + 1} de ${archivos.length}…`;
    const archivoComprimido = await comprimirImagen(archivos[i]);
    const formData = new FormData();
    formData.append("foto", archivoComprimido);
    try {
      const resp = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sesion.token}` },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        nota.textContent = data.error || "No se pudo subir una de las fotos.";
        return;
      }
      urlsSubidas.push(data.url);
    } catch (err) {
      nota.textContent = "No se pudo conectar con el servidor.";
      return;
    }
  }

  urlFotoSubida = urlsSubidas[0];
  fotosExtraSubidas = urlsSubidas.slice(1);
  nota.textContent = urlsSubidas.length === 1
    ? "✅ Foto subida correctamente."
    : `✅ ${urlsSubidas.length} fotos subidas correctamente.`;
});
const botonGuardarLote = document.getElementById("botonGuardarLote");
const botonCancelarEdicion = document.getElementById("botonCancelarEdicion");
const formLoteTitulo = document.getElementById("formLoteTitulo");
const panelRemateSelect = document.getElementById("panelRemateSelect");
let loteEnEdicionId = null;

function autocompletarProximoNumeroDeLote() {
  if (loteEnEdicionId) return; // no tocar el número si se está editando un lote existente
  const remateId = Number(panelRemateSelect.value);
  if (!remateId) return;

  const lotesDelRemate = LOTES.filter((l) => l.remate_id === remateId);
  const numerosUsados = lotesDelRemate.map((l) => Number(l.numero)).filter((n) => !isNaN(n));
  const proximoNumero = numerosUsados.length > 0 ? Math.max(...numerosUsados) + 1 : 1;

  document.getElementById("panelNumero").value = proximoNumero;
}
panelRemateSelect.addEventListener("change", autocompletarProximoNumeroDeLote);

function misRemates() {
  const sesion = leerSesion();
  if (!sesion) return [];
  return sesion.usuario.rol === "administrador"
    ? REMATES
    : REMATES.filter((r) => r.rematador_id === sesion.usuario.id);
}

function renderSelectorDeRemates() {
  const remates = misRemates();
  const valorPrevio = panelRemateSelect.value;
  panelRemateSelect.innerHTML = "";

  if (remates.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Primero creá un remate arriba";
    option.disabled = true;
    option.selected = true;
    panelRemateSelect.appendChild(option);
    return;
  }

  remates.forEach((remate) => {
    const option = document.createElement("option");
    option.value = remate.id;
    option.textContent = `${remate.titulo} (${remate.rubro})`;
    panelRemateSelect.appendChild(option);
  });

  if (remates.some((r) => String(r.id) === valorPrevio)) {
    panelRemateSelect.value = valorPrevio;
  }

  const importarSelect = document.getElementById("importarRemateSelect");
  importarSelect.innerHTML = "";
  remates.forEach((remate) => {
    const option = document.createElement("option");
    option.value = remate.id;
    option.textContent = `${remate.titulo} (${remate.rubro})`;
    importarSelect.appendChild(option);
  });
}

document.getElementById("linkDescargarPlantilla").addEventListener("click", (e) => {
  e.preventDefault();
  window.open(`${API_URL}/lotes/plantilla-importacion`, "_blank");
});

document.getElementById("botonImportarLotes").addEventListener("click", async () => {
  const sesion = leerSesion();
  const mensaje = document.getElementById("importarMensaje");
  const remateId = document.getElementById("importarRemateSelect").value;
  const archivo = document.getElementById("importarArchivo").files[0];

  if (!sesion) return;
  if (!remateId) {
    mensaje.textContent = "Primero creá un remate para poder importarle lotes.";
    mensaje.className = "panel-mensaje error";
    return;
  }
  if (!archivo) {
    mensaje.textContent = "Elegí un archivo (Excel o CSV) para importar.";
    mensaje.className = "panel-mensaje error";
    return;
  }

  mensaje.textContent = "Importando…";
  mensaje.className = "panel-mensaje";

  const formData = new FormData();
  formData.append("planilla", archivo);

  try {
    const resp = await fetch(`${API_URL}/lotes/${remateId}/importar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sesion.token}` },
      body: formData,
    });
    const data = await resp.json();

    if (!resp.ok) {
      mensaje.textContent = data.error || "No se pudo importar la planilla.";
      mensaje.className = "panel-mensaje error";
      return;
    }

    let texto = `✅ Se importaron ${data.importados} de ${data.totalFilas} lotes.`;
    if (data.errores.length > 0) {
      texto += ` Hubo ${data.errores.length} fila(s) con problemas: ${data.errores.join(" | ")}`;
    }
    mensaje.textContent = texto;
    mensaje.className = "panel-mensaje " + (data.importados > 0 ? "exito" : "error");
    document.getElementById("importarArchivo").value = "";

    await cargarLotes();
    renderPanelLista();
  } catch (err) {
    mensaje.textContent = "No se pudo conectar con el servidor.";
    mensaje.className = "panel-mensaje error";
  }
});

formNuevoRemate.addEventListener("submit", async (event) => {
  event.preventDefault();
  const sesion = leerSesion();
  if (!sesion) return;

  const editando = Boolean(remateEnEdicionId);

  // Subir imagen de portada si se eligió una
  let imagen_portada = undefined;
  const archivoPortada = document.getElementById("rematePortada")?.files?.[0];
  if (archivoPortada) {
    panelMensaje.textContent = "Subiendo imagen de portada…";
    panelMensaje.className = "panel-mensaje";
    const comprimido = await comprimirImagen(archivoPortada, 1600, 0.85);
    const fd = new FormData();
    fd.append("foto", comprimido);
    try {
      const r = await fetch(`${API_URL}/uploads`, { method: "POST", headers: { Authorization: `Bearer ${sesion.token}` }, body: fd });
      const d = await r.json();
      if (r.ok) imagen_portada = d.url;
    } catch (e) {}
  }

  const body = {
    titulo: document.getElementById("remateTitulo").value,
    rubro: document.getElementById("remateRubro").value,
    descripcion: document.getElementById("remateDescripcion").value,
    moneda: document.getElementById("remateMoneda").value,
    fecha_inicio: document.getElementById("remoteFechaInicio")?.value || null,
    ...(imagen_portada !== undefined && { imagen_portada }),
  };

  try {
    const resp = await fetch(`${API_URL}/remates${editando ? `/${remateEnEdicionId}` : ""}`, {
      method: editando ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      panelMensaje.textContent = data.error || `No se pudo ${editando ? "guardar los cambios" : "crear el remate"}.`;
      panelMensaje.className = "panel-mensaje error";
      return;
    }

    panelMensaje.textContent = editando
      ? "¡Cambios del remate guardados!"
      : "¡Remate creado! Ahora podés cargarle lotes más abajo.";
    panelMensaje.className = "panel-mensaje exito";
    salirModoEdicionRemate();
    await cargarLotes();
    renderSelectorDeRemates();
    renderPanelLista();
  } catch (err) {
    panelMensaje.textContent = "No se pudo conectar con el servidor.";
    panelMensaje.className = "panel-mensaje error";
  }
});

function cargarLoteEnFormulario(lote) {
  cambiarPanelTab("lotes");
  loteEnEdicionId = lote.id;

  panelRemateSelect.value = String(lote.remate_id);
  panelRemateSelect.disabled = true;
  document.getElementById("panelNumero").value = lote.numero;
  document.getElementById("panelNumero").disabled = true;
  document.getElementById("panelTitulo2").value = lote.titulo;
  document.getElementById("panelDescripcion").value = lote.descripcion || "";
  document.getElementById("panelCondicion").value = lote.condicion || "";
  document.getElementById("panelMarcaModelo").value = lote.marca_modelo || "";
  document.getElementById("panelMaterial").value = lote.material || "";
  document.getElementById("panelDimensiones").value = lote.dimensiones || "";
  document.getElementById("panelAnio").value = lote.anio || "";
  loteImagenActual = lote.imagen || "";
  urlFotoSubida = "";
  document.getElementById("panelImagenNota").textContent = lote.imagen
    ? "Ya tiene una foto cargada. Elegí otra solo si querés reemplazarla."
    : "";
  document.getElementById("panelPrecio").value = lote.precio_inicial;
  document.getElementById("panelPrecio").disabled = true;
  document.getElementById("panelCierre").value = new Date(lote.cierre).toISOString().slice(0, 16);

  formLoteTitulo.textContent = `Editando lote ${lote.numero}`;
  botonGuardarLote.textContent = "Guardar cambios";
  botonCancelarEdicion.hidden = false;
  document.getElementById("panelTitulo2").focus();
  document.getElementById("panelTitulo2").scrollIntoView({ behavior: "smooth", block: "center" });
}

function salirModoEdicion() {
  loteEnEdicionId = null;
  panelRemateSelect.disabled = false;
  document.getElementById("panelNumero").disabled = false;
  document.getElementById("panelPrecio").disabled = false;
  formLoteTitulo.textContent = "Cargar un lote en un remate";
  botonGuardarLote.textContent = "Publicar lote";
  botonCancelarEdicion.hidden = true;
  formNuevoLote.reset();
  urlFotoSubida = "";
  fotosExtraSubidas = [];
  loteImagenActual = "";
  document.getElementById("panelImagenNota").textContent = "";
  renderSelectorDeRemates();
}
botonCancelarEdicion.addEventListener("click", salirModoEdicion);

document.getElementById("btnAbrirPanel").addEventListener("click", abrirPanel);
document.getElementById("btnCerrarPanel").addEventListener("click", cerrarPanel);
// (Se sacó el cierre por "clic afuera" del panel: es un formulario largo,
// y un clic fantasma —común en Windows al cerrar el selector de archivos—
// lo estaba cerrando solo y borrando lo que se había escrito.)

async function abrirPanel() {
  panelMensaje.textContent = "";
  panelMensaje.className = "panel-mensaje";
  salirModoEdicion();
  salirModoEdicionRemate();
  mostrarSoloSeccion("panelSeccion");
  cambiarPanelTab("remates");
  document.getElementById("remateTitulo").focus();

  await cargarLotes();
  renderSelectorDeRemates();
  renderPanelLista();
}
function cambiarPanelTab(tab) {
  document.querySelectorAll('[data-paneltab]').forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.paneltab === tab);
  });
  document.getElementById("formNuevoRemate").hidden = tab !== "remates";
  document.getElementById("formNuevoLote").hidden = tab !== "lotes";
  document.getElementById("importarLotesDetalle") && (document.getElementById("importarLotesDetalle").hidden = tab !== "lotes");
  const elStats = document.getElementById("panelEstadisticasAdmin");
  if (elStats) elStats.hidden = tab !== "estadisticas-admin";
  document.getElementById("panelLista").hidden = tab === "estadisticas-admin" || tab === "ganadores";
  const elGanadores = document.getElementById("dashboardGanadores");
  if (elGanadores) elGanadores.hidden = tab !== "ganadores";
  if (tab === "lotes") autocompletarProximoNumeroDeLote();
  if (tab === "estadisticas-admin") cargarEstadisticasAdmin();
  if (tab === "ganadores") cargarDashboardGanadores();
}
document.querySelectorAll('[data-paneltab]').forEach((btn) => {
  btn.addEventListener("click", () => cambiarPanelTab(btn.dataset.paneltab));
});
// ===== Contador de vistas en vivo =====
const SESION_ID = Math.random().toString(36).slice(2);
async function registrarVistaLote(loteId) {
  try {
    const resp = await fetch(`${API_URL}/ofertas/lote/${loteId}/vista`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sesion: SESION_ID }),
    });
    const { vistas } = await resp.json();
    const el = document.getElementById("modalVistas");
    if (el && vistas > 1) {
      el.hidden = false;
      el.textContent = `👁 ${vistas} personas viendo esto ahora`;
    }
  } catch (e) {}
}

// ===== Historial de precios (gráfico) =====
async function cargarHistorialPrecios(lote) {
  const detalle = document.getElementById("historialDetalle");
  const lista = document.getElementById("historialLista");
  if (!detalle) return;

  if (lote.cantidad_ofertas === 0) { detalle.hidden = true; return; }
  detalle.hidden = false;

  try {
    const resp = await fetch(`${API_URL}/ofertas/lote/${lote.id}`);
    const ofertas = await resp.json();
    if (ofertas.length === 0) { detalle.hidden = true; return; }

    // Lista de ofertas
    lista.innerHTML = ofertas.slice().reverse().map(o => {
      const fecha = new Date(o.fecha).toLocaleString("es-UY", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
      return `<li class="historial-item"><span class="historial-nombre">${o.usuario_nombre}</span><span class="historial-monto">${formatoMonto(o.monto, lote.remate_moneda)}</span><span class="historial-fecha">${fecha}</span></li>`;
    }).join("");

    // Gráfico simple con Canvas
    const canvas = document.getElementById("historialCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const montos = ofertas.map(o => o.monto);
    const min = Math.min(...montos) * 0.95;
    const max = Math.max(...montos) * 1.05;
    const W = canvas.offsetWidth || 300;
    const H = 120;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const accent = "#3D8EFF";
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath();
    ofertas.forEach((o, i) => {
      const x = (i / (ofertas.length - 1 || 1)) * (W - 20) + 10;
      const y = H - ((o.monto - min) / (max - min || 1)) * (H - 20) - 10;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Puntos
    ofertas.forEach((o, i) => {
      const x = (i / (ofertas.length - 1 || 1)) * (W - 20) + 10;
      const y = H - ((o.monto - min) / (max - min || 1)) * (H - 20) - 10;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent; ctx.fill();
    });
  } catch (e) { detalle.hidden = true; }
}

// ===== Dashboard de ganadores =====
async function cargarDashboardGanadores() {
  const sesion = leerSesion();
  if (!sesion) return;
  const select = document.getElementById("dashboardRemateSelect");
  const contenido = document.getElementById("dashboardContenido");

  const misRemates_ = misRemates();
  select.innerHTML = misRemates_.map(r => `<option value="${r.id}">${r.titulo}</option>`).join("");
  if (misRemates_.length === 0) { contenido.innerHTML = "<p style='color:var(--fg-muted)'>No tenés remates creados.</p>"; return; }

  const cargar = async (remateId) => {
    contenido.innerHTML = "<p>Cargando…</p>";
    try {
      const resp = await fetch(`${API_URL}/remates/${remateId}/ganadores`, {
        headers: { Authorization: `Bearer ${sesion.token}` },
      });
      const { ganadores, sinGanador } = await resp.json();

      let html = "";
      if (ganadores.length === 0 && sinGanador.length === 0) {
        html = "<p style='color:var(--fg-muted)'>No hay lotes finalizados en este remate.</p>";
      } else {
        if (ganadores.length > 0) {
          html += `<table class="ganadores-tabla"><thead><tr><th>Lote</th><th>Artículo</th><th>Monto</th><th>Ganador</th><th>Email</th><th>Cédula</th><th>Pago</th></tr></thead><tbody>`;
          ganadores.forEach(g => {
            const pago = g.pago_confirmado === 1 ? "✅ Pagó" : g.pago_confirmado === 0 ? "❌ No pagó" : "⏳ Pendiente";
            html += `<tr><td>${g.numero}</td><td>${g.titulo}</td><td>${formatoMonto(g.oferta_actual, g.moneda)}</td><td>${g.ganador_nombre}</td><td>${g.ganador_email}</td><td>${g.ganador_cedula || "—"}</td><td>${pago}</td></tr>`;
          });
          html += `</tbody></table>`;
        }
        if (sinGanador.length > 0) {
          html += `<p style="color:var(--fg-muted);margin-top:1rem">Sin ganador: ${sinGanador.map(l => `Lote ${l.numero} — ${l.titulo}`).join(", ")}</p>`;
        }
      }
      contenido.innerHTML = html;
    } catch (e) {
      contenido.innerHTML = "<p style='color:var(--error)'>No se pudo cargar.</p>";
    }
  };

  select.addEventListener("change", () => cargar(select.value));
  if (misRemates_.length > 0) cargar(misRemates_[0].id);
}

// ===== Insignia "Lote popular" =====
function insigniaPopular(lote) {
  if (lote.cantidad_ofertas >= 5) return "🔥 Popular";
  if (lote.cantidad_ofertas >= 3) return "⚡ Activo";
  return null;
}

function cerrarPanel() {
  volverAHome();
}

async function cargarEstadisticasAdmin() {
  const sesion = leerSesion();
  if (!sesion) return;
  const grid = document.getElementById("estadisticasAdminGrid");
  const topLotes = document.getElementById("estadisticasTopLotes");
  grid.innerHTML = "<p>Cargando…</p>";
  topLotes.innerHTML = "";
  try {
    const resp = await fetch(`${API_URL}/remates/estadisticas-generales`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const d = await resp.json();
    grid.innerHTML = `
      <div class="stat-card"><span class="stat-valor">${d.totalUsuarios}</span><span class="stat-label">Usuarios registrados</span></div>
      <div class="stat-card"><span class="stat-valor">${d.usuariosActivos}</span><span class="stat-label">Activos últimos 30 días</span></div>
      <div class="stat-card"><span class="stat-valor">${d.totalRemates}</span><span class="stat-label">Remates creados</span></div>
      <div class="stat-card"><span class="stat-valor">${d.totalLotes}</span><span class="stat-label">Lotes publicados</span></div>
      <div class="stat-card"><span class="stat-valor">${d.totalOfertas}</span><span class="stat-label">Ofertas totales</span></div>
      <div class="stat-card stat-card-highlight"><span class="stat-valor">$ ${d.totalRecaudado.toLocaleString("es-UY")}</span><span class="stat-label">Total recaudado</span></div>
      <div class="stat-card"><span class="stat-valor">$ ${d.comisionTotal.toLocaleString("es-UY")}</span><span class="stat-label">Comisión generada (18,3%)</span></div>
    `;
    topLotes.innerHTML = "";
    if (d.lotesTop.length === 0) {
      topLotes.innerHTML = "<li style='padding:1rem;color:var(--fg-muted)'>Sin datos aún.</li>";
    }
    d.lotesTop.forEach((l, i) => {
      const li = document.createElement("li");
      li.className = "panel-item";
      li.innerHTML = `<span style="font-weight:700;color:var(--accent)">#${i + 1}</span> ${l.titulo} <span style="color:var(--fg-muted);font-size:0.85rem">(${l.remate_titulo})</span> — <strong>${l.total_ofertas} ofertas</strong>`;
      topLotes.appendChild(li);
    });
  } catch (e) {
    grid.innerHTML = "<p style='color:var(--error)'>No se pudieron cargar las estadísticas.</p>";
  }
}

async function exportarGanadoresCSV(remateId, remaTitulo) {
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/remates/${remateId}/exportar-ganadores`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    if (!resp.ok) { alert("No se pudo exportar."); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ganadores-${remaTitulo.replace(/\s+/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Error al exportar.");
  }
}

function renderPanelLista() {
  const sesion = leerSesion();
  const lista = document.getElementById("panelLista");
  lista.innerHTML = "";
  if (!sesion) return;

  const remates = misRemates();
  if (remates.length === 0) {
    lista.innerHTML = `<li class="panel-lote-info">Todavía no creaste ningún remate.</li>`;
    return;
  }

  remates.forEach((remate) => {
    const liRemate = document.createElement("li");
    liRemate.className = "panel-remate-item";

    const encabezadoFila = document.createElement("p");
    encabezadoFila.className = "panel-lote-info panel-remate-encabezado";
    encabezadoFila.innerHTML = `<strong>${remate.titulo}</strong>${remate.rubro}`;

    const btnEditarRemate = document.createElement("button");
    btnEditarRemate.type = "button";
    btnEditarRemate.textContent = "Editar remate";
    btnEditarRemate.addEventListener("click", () => cargarRemateEnFormulario(remate));

    const btnEstadisticas = document.createElement("button");
    btnEstadisticas.type = "button";
    btnEstadisticas.textContent = "📊 Ver estadísticas";
    btnEstadisticas.addEventListener("click", () => abrirEstadisticasRemate(remate));

    const btnExportar = document.createElement("button");
    btnExportar.type = "button";
    btnExportar.textContent = "⬇ Exportar ganadores";
    btnExportar.addEventListener("click", () => exportarGanadoresCSV(remate.id, remate.titulo));

    const filaEncabezado = document.createElement("p");
    filaEncabezado.className = "panel-lote-acciones";
    filaEncabezado.append(btnEditarRemate, btnEstadisticas, btnExportar);

    liRemate.append(encabezadoFila, filaEncabezado);

    const lotesDelRemate = LOTES.filter((l) => l.remate_id === remate.id);
    const listaLotes = document.createElement("ul");
    listaLotes.className = "panel-lista panel-lista-anidada";

    if (lotesDelRemate.length === 0) {
      listaLotes.innerHTML = `<li class="panel-lote-info">Todavía no tiene lotes cargados.</li>`;
    } else {
      lotesDelRemate.forEach((lote) => {
        const li = document.createElement("li");
        li.className = "panel-lote-item";

        if (lote.imagen) {
          const img = document.createElement("img");
          img.src = lote.imagen;
          img.alt = "";
          img.className = "panel-lote-img";
          img.onerror = () => { img.style.display = "none"; };
          li.appendChild(img);
        }

        const info = document.createElement("p");
        info.className = "panel-lote-info";
        info.innerHTML = `<strong>Lote ${lote.numero} — ${lote.titulo}</strong>${lote.estado === "finalizada" ? "Finalizada" : `Activa · ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}`}`;

        const acciones = document.createElement("p");
        acciones.className = "panel-lote-acciones";

        if (lote.estado === "activa") {
          const btnEditar = document.createElement("button");
          btnEditar.type = "button";
          btnEditar.textContent = "Editar";
          btnEditar.addEventListener("click", () => cargarLoteEnFormulario(lote));
          acciones.appendChild(btnEditar);

          const btnFinalizar = document.createElement("button");
          btnFinalizar.type = "button";
          btnFinalizar.textContent = "Finalizar";
          btnFinalizar.addEventListener("click", () => finalizarLotePanel(lote.id));
          acciones.appendChild(btnFinalizar);
        }

        if (lote.estado === "finalizada" && lote.ganador_id) {
          const estadoPago = document.createElement("span");
          estadoPago.className = "estado-pago " + (
            lote.pago_confirmado === 1 ? "pago-si" : lote.pago_confirmado === 0 ? "pago-no" : "pago-pendiente"
          );
          estadoPago.textContent = lote.pago_confirmado === 1 ? "✅ Pagó" : lote.pago_confirmado === 0 ? "❌ No pagó" : "⏳ Sin definir";
          acciones.appendChild(estadoPago);

          const btnPago = document.createElement("button");
          btnPago.type = "button";
          btnPago.textContent = lote.pago_confirmado === 1 ? "Marcar que no pagó" : "Marcar que pagó";
          btnPago.addEventListener("click", () => marcarPagoLotePanel(lote.id, lote.pago_confirmado !== 1));
          acciones.appendChild(btnPago);
        }

        if (sesion.usuario.rol === "administrador") {
          const btnEliminar = document.createElement("button");
          btnEliminar.type = "button";
          btnEliminar.className = "peligro";
          btnEliminar.textContent = "Eliminar";
          btnEliminar.addEventListener("click", () => eliminarLotePanel(lote.id));
          acciones.appendChild(btnEliminar);
        }

        li.append(info, acciones);
        listaLotes.appendChild(li);
      });
    }

    liRemate.appendChild(listaLotes);
    lista.appendChild(liRemate);
  });
}

// Evitar que un Enter "fantasma" (común en Windows al confirmar el selector
// de archivos) envíe el formulario solo, antes de que el usuario apriete el botón.
document.getElementById("panelImagen").addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.preventDefault();
});

formNuevoLote.addEventListener("submit", async (event) => {
  event.preventDefault();
  // Si el envío no vino de un clic real en el botón (ej. un Enter fantasma
  // disparado por el selector de archivos de Windows), lo ignoramos.
  if (event.submitter !== botonGuardarLote) return;

  const sesion = leerSesion();
  if (!sesion) return;

  const cierreInput = document.getElementById("panelCierre").value;
  const editando = Boolean(loteEnEdicionId);

  const camposFicha = {
    condicion: document.getElementById("panelCondicion").value,
    marcaModelo: document.getElementById("panelMarcaModelo").value,
    material: document.getElementById("panelMaterial").value,
    dimensiones: document.getElementById("panelDimensiones").value,
    anio: document.getElementById("panelAnio").value,
  };

  const body = editando
    ? {
        titulo: document.getElementById("panelTitulo2").value,
        descripcion: document.getElementById("panelDescripcion").value,
        imagen: urlFotoSubida || loteImagenActual,
        cierre: cierreInput ? new Date(cierreInput).toISOString() : null,
        ...camposFicha,
      }
    : {
        remateId: Number(panelRemateSelect.value),
        numero: document.getElementById("panelNumero").value,
        titulo: document.getElementById("panelTitulo2").value,
        descripcion: document.getElementById("panelDescripcion").value,
        imagen: urlFotoSubida,
        precioInicial: Number(document.getElementById("panelPrecio").value),
        cierre: cierreInput ? new Date(cierreInput).toISOString() : null,
        ...camposFicha,
      };

  if (!editando && !panelRemateSelect.value) {
    panelMensaje.textContent = "Primero creá un remate para poder cargarle lotes.";
    panelMensaje.className = "panel-mensaje error";
    return;
  }

  try {
    const resp = await fetch(`${API_URL}/lotes${editando ? `/${loteEnEdicionId}` : ""}`, {
      method: editando ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      panelMensaje.textContent = data.error || `No se pudo ${editando ? "guardar los cambios" : "publicar el lote"}.`;
      panelMensaje.className = "panel-mensaje error";
      return;
    }

    const idDelLote = editando ? loteEnEdicionId : data.id;
    if (fotosExtraSubidas.length > 0 && idDelLote) {
      for (const url of fotosExtraSubidas) {
        try {
          await fetch(`${API_URL}/lotes/${idDelLote}/fotos`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
            body: JSON.stringify({ url }),
          });
        } catch (err) {
          // si falla una foto extra no bloqueamos el resto del flujo, el lote ya se guardó bien
        }
      }
    }

    panelMensaje.textContent = editando ? "¡Cambios guardados!" : "¡Lote publicado!";
    panelMensaje.className = "panel-mensaje exito";
    salirModoEdicion();
    await cargarLotes();
    renderPanelLista();
    autocompletarProximoNumeroDeLote();
  } catch (err) {
    panelMensaje.textContent = "No se pudo conectar con el servidor.";
    panelMensaje.className = "panel-mensaje error";
  }
});

async function finalizarLotePanel(loteId) {
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/lotes/${loteId}/finalizar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      panelMensaje.textContent = data.error || "No se pudo finalizar el lote.";
      panelMensaje.className = "panel-mensaje error";
      return;
    }
    await cargarLotes();
    renderPanelLista();
  } catch (err) {
    panelMensaje.textContent = "No se pudo conectar con el servidor.";
    panelMensaje.className = "panel-mensaje error";
  }
}

async function marcarPagoLotePanel(loteId, pagado) {
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/lotes/${loteId}/pago`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify({ pagado }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      panelMensaje.textContent = data.error || "No se pudo actualizar el estado de pago.";
      panelMensaje.className = "panel-mensaje error";
      return;
    }
    await cargarLotes();
    renderPanelLista();
  } catch (err) {
    panelMensaje.textContent = "No se pudo conectar con el servidor.";
    panelMensaje.className = "panel-mensaje error";
  }
}

async function eliminarLotePanel(loteId) {
  const sesion = leerSesion();
  if (!sesion) return;
  if (!confirm("¿Eliminar este lote? Esta acción no se puede deshacer.")) return;
  try {
    await fetch(`${API_URL}/lotes/${loteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    await cargarLotes();
    renderPanelLista();
  } catch (err) {
    panelMensaje.textContent = "No se pudo conectar con el servidor.";
    panelMensaje.className = "panel-mensaje error";
  }
}

/* ==========================================================================
/* ==========================================================================
   GESTIÓN DE USUARIOS (solo administrador)
   ========================================================================== */
const usuariosMensaje = document.getElementById("usuariosMensaje");
const formNuevoUsuario = document.getElementById("formNuevoUsuario");

document.getElementById("btnAbrirUsuarios").addEventListener("click", abrirUsuarios);
document.getElementById("btnCerrarUsuarios").addEventListener("click", cerrarUsuarios);

async function abrirUsuarios() {
  usuariosMensaje.textContent = "";
  usuariosMensaje.className = "panel-mensaje";
  formNuevoUsuario.reset();
  mostrarSoloSeccion("usuariosSeccion");
  document.getElementById("usuarioNombre").focus();
  await renderUsuariosLista();
}
function cerrarUsuarios() {
  volverAHome();
}

async function renderUsuariosLista() {
  const sesion = leerSesion();
  const lista = document.getElementById("usuariosLista");
  if (!sesion) return;

  try {
    const resp = await fetch(`${API_URL}/usuarios`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const usuarios = await resp.json();
    if (!resp.ok) throw new Error(usuarios.error || "No se pudo cargar la lista.");

    const pendientes = usuarios.filter((u) => u.rol === "publico" && !u.aprobado);

    lista.innerHTML = "";

    if (pendientes.length > 0) {
      const encabezadoPendientes = document.createElement("li");
      encabezadoPendientes.className = "usuarios-pendientes-titulo";
      encabezadoPendientes.textContent = `⏳ ${pendientes.length} cuenta(s) esperando aprobación`;
      lista.appendChild(encabezadoPendientes);

      pendientes.forEach((usuario) => {
        const li = document.createElement("li");
        li.className = "panel-lote-item usuario-pendiente";

        const info = document.createElement("p");
        info.className = "panel-lote-info";
        info.innerHTML = `<strong>${usuario.nombre}</strong>${usuario.email} · CI: ${usuario.cedula || "—"}`;

        const acciones = document.createElement("p");
        acciones.className = "panel-lote-acciones";

        const btnAprobar = document.createElement("button");
        btnAprobar.type = "button";
        btnAprobar.className = "btn btn-primary";
        btnAprobar.textContent = "Aprobar";
        btnAprobar.addEventListener("click", () => aprobarUsuario(usuario.id));

        const btnRechazar = document.createElement("button");
        btnRechazar.type = "button";
        btnRechazar.className = "btn btn-ghost";
        btnRechazar.textContent = "Rechazar";
        btnRechazar.addEventListener("click", () => rechazarUsuario(usuario.id));

        acciones.append(btnAprobar, btnRechazar);
        li.append(info, acciones);
        lista.appendChild(li);
      });
    }

    usuarios.forEach((usuario) => {
      const li = document.createElement("li");
      li.className = "panel-lote-item" + (usuario.bloqueado ? " usuario-bloqueado" : "");

      const info = document.createElement("p");
      info.className = "panel-lote-info";
      const puntajeHtml = usuario.puntaje == null ? "" : `<span class="puntaje-badge ${claseColorPuntaje(usuario.puntaje)}">${usuario.puntaje}</span> `;
      info.innerHTML = `${puntajeHtml}<strong>${usuario.nombre}</strong>${usuario.email}${usuario.bloqueado ? " · 🚫 BLOQUEADO" : ""}`;

      const acciones = document.createElement("p");
      acciones.className = "panel-lote-acciones";

      const select = document.createElement("select");
      ["publico", "rematador", "administrador"].forEach((rol) => {
        const option = document.createElement("option");
        option.value = rol;
        option.textContent = NOMBRES_ROL[rol];
        if (rol === usuario.rol) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", () => cambiarRolUsuario(usuario.id, select.value));
      acciones.appendChild(select);

      if (usuario.rol !== "administrador") {
        const btnBloquear = document.createElement("button");
        btnBloquear.type = "button";
        btnBloquear.className = usuario.bloqueado ? "btn btn-primary" : "btn btn-ghost";
        btnBloquear.textContent = usuario.bloqueado ? "Desbloquear" : "Bloquear";
        btnBloquear.addEventListener("click", () =>
          usuario.bloqueado ? desbloquearUsuario(usuario.id) : bloquearUsuario(usuario.id)
        );
        acciones.appendChild(btnBloquear);

        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.className = "btn btn-ghost";
        btnEliminar.style.color = "#c0392b";
        btnEliminar.textContent = "Eliminar";
        btnEliminar.addEventListener("click", () => eliminarUsuario(usuario.id, usuario.nombre));
        acciones.appendChild(btnEliminar);
      }

      li.append(info, acciones);
      lista.appendChild(li);
    });
  } catch (err) {
    lista.innerHTML = `<li class="panel-lote-info">No se pudo cargar la lista de usuarios.</li>`;
  }
}

formNuevoUsuario.addEventListener("submit", async (event) => {
  event.preventDefault();
  const sesion = leerSesion();
  if (!sesion) return;

  const body = {
    nombre: document.getElementById("usuarioNombre").value,
    email: document.getElementById("usuarioEmail").value,
    password: document.getElementById("usuarioPassword").value,
    rol: document.getElementById("usuarioRol").value,
  };

  try {
    const resp = await fetch(`${API_URL}/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      usuariosMensaje.textContent = data.error || "No se pudo crear la cuenta.";
      usuariosMensaje.className = "panel-mensaje error";
      return;
    }

    usuariosMensaje.textContent = `Cuenta de ${NOMBRES_ROL[data.rol].toLowerCase()} creada para ${data.nombre}.`;
    usuariosMensaje.className = "panel-mensaje exito";
    formNuevoUsuario.reset();
    await renderUsuariosLista();
  } catch (err) {
    usuariosMensaje.textContent = "No se pudo conectar con el servidor.";
    usuariosMensaje.className = "panel-mensaje error";
  }
});

async function aprobarUsuario(usuarioId) {
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/usuarios/${usuarioId}/aprobar`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    if (!resp.ok) {
      const data = await resp.json();
      usuariosMensaje.textContent = data.error || "No se pudo aprobar la cuenta.";
      usuariosMensaje.className = "panel-mensaje error";
      return;
    }
    usuariosMensaje.textContent = "Cuenta aprobada.";
    usuariosMensaje.className = "panel-mensaje exito";
    renderUsuariosLista();
  } catch (err) {
    usuariosMensaje.textContent = "No se pudo conectar con el servidor.";
    usuariosMensaje.className = "panel-mensaje error";
  }
}

async function rechazarUsuario(usuarioId) {
  const confirmado = await confirmarEnPagina("¿Rechazar esta cuenta? Se elimina y la persona va a tener que registrarse de nuevo.");
  if (!confirmado) return;

  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/usuarios/${usuarioId}/rechazar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    if (!resp.ok) {
      const data = await resp.json();
      usuariosMensaje.textContent = data.error || "No se pudo rechazar la cuenta.";
      usuariosMensaje.className = "panel-mensaje error";
      return;
    }
    usuariosMensaje.textContent = "Cuenta rechazada y eliminada.";
    usuariosMensaje.className = "panel-mensaje exito";
    renderUsuariosLista();
  } catch (err) {
    usuariosMensaje.textContent = "No se pudo conectar con el servidor.";
    usuariosMensaje.className = "panel-mensaje error";
  }
}

function claseColorPuntaje(puntaje) {
  if (puntaje >= 100) return "puntaje-alto";
  if (puntaje >= 60) return "puntaje-medio";
  return "puntaje-bajo";
}

async function bloquearUsuario(usuarioId) {
  const confirmado = await confirmarEnPagina("¿Bloquear esta cuenta? No va a poder loguearse ni ofertar hasta que la desbloquees.");
  if (!confirmado) return;
  await accionSobreUsuario(usuarioId, "bloquear", "Cuenta bloqueada.");
}

async function desbloquearUsuario(usuarioId) {
  await accionSobreUsuario(usuarioId, "desbloquear", "Cuenta desbloqueada.");
}

async function eliminarUsuario(usuarioId, nombre) {
  const confirmado = await confirmarEnPagina(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer.`);
  if (!confirmado) return;
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/usuarios/${usuarioId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      usuariosMensaje.textContent = data.error || "No se pudo eliminar la cuenta.";
      usuariosMensaje.className = "panel-mensaje error";
      return;
    }
    usuariosMensaje.textContent = `Cuenta de "${nombre}" eliminada.`;
    usuariosMensaje.className = "panel-mensaje exito";
    renderUsuariosLista();
  } catch (err) {
    usuariosMensaje.textContent = "No se pudo conectar con el servidor.";
    usuariosMensaje.className = "panel-mensaje error";
  }
}

async function accionSobreUsuario(usuarioId, accion, mensajeExito) {
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/usuarios/${usuarioId}/${accion}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      usuariosMensaje.textContent = data.error || `No se pudo ${accion} la cuenta.`;
      usuariosMensaje.className = "panel-mensaje error";
      return;
    }
    usuariosMensaje.textContent = mensajeExito;
    usuariosMensaje.className = "panel-mensaje exito";
    renderUsuariosLista();
  } catch (err) {
    usuariosMensaje.textContent = "No se pudo conectar con el servidor.";
    usuariosMensaje.className = "panel-mensaje error";
  }
}

async function cambiarRolUsuario(usuarioId, nuevoRol) {
  const sesion = leerSesion();
  if (!sesion) return;
  try {
    const resp = await fetch(`${API_URL}/usuarios/${usuarioId}/rol`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify({ rol: nuevoRol }),
    });
    if (!resp.ok) {
      const data = await resp.json();
      usuariosMensaje.textContent = data.error || "No se pudo cambiar el rol.";
      usuariosMensaje.className = "panel-mensaje error";
      return;
    }
    usuariosMensaje.textContent = "Rol actualizado.";
    usuariosMensaje.className = "panel-mensaje exito";
  } catch (err) {
    usuariosMensaje.textContent = "No se pudo conectar con el servidor.";
    usuariosMensaje.className = "panel-mensaje error";
  }
}

/* ==========================================================================
   MIS OFERTAS / MIS FAVORITOS (público general)
   ========================================================================== */
const misOfertasSeccion = document.getElementById("misOfertasSeccion");

document.getElementById("btnAbrirMisOfertas").addEventListener("click", abrirMisOfertas);
document.getElementById("btnCerrarMisOfertas").addEventListener("click", volverAHome);

// ===== Carrito: lotes ganados por el usuario logueado =====
const COMISION = 0.183; // 18,3%, la misma que se muestra en Términos y Condiciones

function loteGanadoPor(lote) {
  const sesion = leerSesion();
  return sesion && lote.estado === "finalizada" && lote.ganador_id === sesion.usuario.id;
}

function actualizarContadorCarrito() {
  const cantidad = LOTES.filter(loteGanadoPor).length;
  document.getElementById("cartCount").textContent = cantidad;
}

document.getElementById("btnAbrirCarrito").addEventListener("click", () => {
  mostrarSoloSeccion("carritoSeccion");
  renderCarrito();
});
document.getElementById("btnCerrarCarrito").addEventListener("click", volverAHome);

function renderCarrito() {
  const lista = document.getElementById("carritoLista");
  const ganados = LOTES.filter(loteGanadoPor);

  if (ganados.length === 0) {
    lista.innerHTML = `
      <li class="carrito-vacio">
        <div style="font-size:2.5rem;margin-bottom:0.75rem">🛒</div>
        <p>Todavía no ganaste ningún lote.</p>
        <a href="#activas" class="btn btn-primary" style="margin-top:0.5rem" onclick="volverAHome()">Ver subastas activas</a>
      </li>`;
    return;
  }

  // Calcular totales
  const totalGanado = ganados.reduce((s, l) => s + l.oferta_actual, 0);
  const totalComision = Math.round(totalGanado * COMISION);
  const totalFinal = totalGanado + totalComision;
  const pendientes = ganados.filter(l => l.pago_confirmado !== 1);
  const pagados = ganados.filter(l => l.pago_confirmado === 1);

  lista.innerHTML = "";

  // Resumen general
  const resumen = document.createElement("li");
  resumen.className = "carrito-resumen";
  resumen.innerHTML = `
    <div class="carrito-resumen-titulo">Resumen de lotes ganados</div>
    <div class="carrito-resumen-grid">
      <div class="carrito-stat"><span>${ganados.length}</span><small>lotes ganados</small></div>
      <div class="carrito-stat"><span>${pendientes.length}</span><small>pendientes de pago</small></div>
      <div class="carrito-stat carrito-stat-total"><span>${formatoMonto(totalFinal)}</span><small>total a pagar (con comisión)</small></div>
    </div>
    ${pendientes.length > 0 ? `
    <a href="https://wa.me/59899924004?text=${encodeURIComponent(`Hola, gané ${pendientes.length} lote${pendientes.length > 1 ? "s" : ""} y quiero coordinar el pago. Total: ${formatoMonto(totalFinal)}`)}"
       target="_blank" rel="noopener" class="btn btn-primary carrito-btn-global">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Coordinar pago de todos por WhatsApp
    </a>` : `<p class="carrito-todos-pagos">✅ Todos los lotes están pagos</p>`}
  `;
  lista.appendChild(resumen);

  // Lotes pendientes
  if (pendientes.length > 0) {
    const h = document.createElement("li");
    h.className = "carrito-seccion-titulo";
    h.textContent = "⏳ Pendientes de pago";
    lista.appendChild(h);
    pendientes.forEach(l => lista.appendChild(crearItemCarrito(l)));
  }

  // Lotes pagados
  if (pagados.length > 0) {
    const h = document.createElement("li");
    h.className = "carrito-seccion-titulo";
    h.textContent = "✅ Pagados";
    lista.appendChild(h);
    pagados.forEach(l => lista.appendChild(crearItemCarrito(l)));
  }
}

function crearItemCarrito(lote) {
  const comision = Math.round(lote.oferta_actual * COMISION);
  const total = lote.oferta_actual + comision;
  const pagado = lote.pago_confirmado === 1;

  const li = document.createElement("li");
  li.className = `panel-lote-item carrito-item${pagado ? " carrito-item-pagado" : ""}`;

  if (lote.imagen) {
    const img = document.createElement("img");
    img.src = lote.imagen;
    img.alt = `Foto del lote ${lote.numero}`;
    img.className = "carrito-img";
    li.appendChild(img);
  }

  const columna = document.createElement("div");
  columna.className = "carrito-columna";

  columna.innerHTML = `
    <p class="carrito-lote-titulo"><strong>Lote ${lote.numero} — ${lote.titulo}</strong></p>
    <div class="carrito-desglose">
      <span>Oferta ganadora</span><span>${formatoMonto(lote.oferta_actual, lote.remate_moneda)}</span>
      <span>Comisión 18,3%</span><span>${formatoMonto(comision, lote.remate_moneda)}</span>
      <span class="carrito-total-label">Total</span><span class="carrito-total-valor">${formatoMonto(total, lote.remate_moneda)}</span>
    </div>
    ${pagado ? `<p class="carrito-pagado-badge">✅ Pago confirmado</p>` : `
    <a href="https://wa.me/59899924004?text=${encodeURIComponent(`Hola, gané el Lote ${lote.numero} (${lote.titulo}) por ${formatoMonto(total, lote.remate_moneda)} total. Quiero coordinar el pago.`)}"
       target="_blank" rel="noopener" class="carrito-btn-pagar">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Coordinar pago
    </a>`}
  `;

  li.appendChild(columna);
  return li;
}

async function abrirMisOfertas() {
  mostrarSoloSeccion("misOfertasSeccion");
  await Promise.all([renderMisOfertas(), cargarLotes()]);
  renderMisFavoritos();
}

async function renderMisOfertas() {
  const sesion = leerSesion();
  const lista = document.getElementById("misOfertasLista");
  if (!sesion) return;

  lista.innerHTML = `<li class="panel-lote-info">Cargando…</li>`;
  try {
    const resp = await fetch(`${API_URL}/ofertas/mias`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    const ofertas = await resp.json();
    if (!resp.ok) throw new Error(ofertas.error || "No se pudo cargar tu historial.");

    if (ofertas.length === 0) {
      lista.innerHTML = `<li class="panel-lote-info">Todavía no hiciste ninguna oferta.</li>`;
      return;
    }

    // Cruzar con LOTES para saber estado actual
    const ofertasPorLote = {};
    ofertas.forEach((o) => {
      if (!ofertasPorLote[o.lote_id] || o.monto > ofertasPorLote[o.lote_id].monto) {
        ofertasPorLote[o.lote_id] = o;
      }
    });
    const misLotes = Object.values(ofertasPorLote);
    const activas = misLotes.filter((o) => {
      const lote = LOTES.find((l) => l.id === o.lote_id);
      return lote && !loteEstaCerrado(lote) && estadoDeMiOferta(lote) !== "ganando";
    });
    const ganando = misLotes.filter((o) => {
      const lote = LOTES.find((l) => l.id === o.lote_id);
      return lote && !loteEstaCerrado(lote) && estadoDeMiOferta(lote) === "ganando";
    });
    const ganadas = misLotes.filter((o) => {
      const lote = LOTES.find((l) => l.id === o.lote_id);
      return lote && loteEstaCerrado(lote) && lote.ganador_nombre === sesion.usuario.nombre;
    });
    const perdidas = misLotes.filter((o) => {
      const lote = LOTES.find((l) => l.id === o.lote_id);
      return lote && loteEstaCerrado(lote) && lote.ganador_nombre !== sesion.usuario.nombre;
    });

    lista.innerHTML = "";

    const seccion = (titulo, items, tipo) => {
      if (items.length === 0) return;
      const h = document.createElement("li");
      h.className = "panel-lote-info";
      h.innerHTML = `<strong style="font-size:1rem;color:var(--accent)">${titulo}</strong>`;
      lista.appendChild(h);
      items.forEach((o) => {
        const lote = LOTES.find((l) => l.id === o.lote_id);
        const li = document.createElement("li");
        li.className = "panel-lote-item mis-ofertas-item";
        if (o.imagen) {
          const img = document.createElement("img");
          img.src = o.imagen; img.alt = ""; img.className = "mis-ofertas-img";
          img.onerror = () => { img.style.display = "none"; };
          li.appendChild(img);
        }
        const info = document.createElement("p");
        info.className = "panel-lote-info";
        const estado = tipo === "ganando" ? "🥇 Vas ganando" : tipo === "ganada" ? "✅ Ganaste" : tipo === "perdida" ? "❌ No ganaste" : "⏳ En juego";
        info.innerHTML = `<strong>Lote ${o.numero} — ${o.titulo}</strong>${estado} · Tu oferta: ${formatoMonto(o.monto, o.remate_moneda || "UYU")}`;
        li.appendChild(info);
        if (lote && !loteEstaCerrado(lote)) {
          const btn = document.createElement("button");
          btn.type = "button"; btn.className = "btn btn-ghost"; btn.textContent = "Ver lote";
          btn.style.fontSize = "0.8rem";
          btn.addEventListener("click", () => { mostrarSoloSeccion("activas"); abrirModal(lote); });
          const acc = document.createElement("p"); acc.className = "panel-lote-acciones";
          acc.appendChild(btn); li.appendChild(acc);
        }
        lista.appendChild(li);
      });
    };

    seccion("🥇 Vas ganando", ganando, "ganando");
    seccion("⏳ En juego (te superaron)", activas, "activa");
    seccion("✅ Subastas ganadas", ganadas, "ganada");
    seccion("📋 Historial (no ganaste)", perdidas, "perdida");

  } catch (err) {
    lista.innerHTML = `<li class="panel-lote-info">No se pudo conectar con el servidor.</li>`;
  }
}

function renderMisFavoritos() {
  const lista = document.getElementById("misFavoritosLista");
  const favoritos = leerFavoritos();
  const lotesFavoritos = LOTES.filter((l) => favoritos.includes(l.id));

  if (lotesFavoritos.length === 0) {
    lista.innerHTML = `<li class="panel-lote-info">Todavía no marcaste ningún lote como favorito.</li>`;
    return;
  }

  lista.innerHTML = "";
  lotesFavoritos.forEach((lote) => {
    const li = document.createElement("li");
    li.className = "panel-lote-item";

    const info = document.createElement("p");
    info.className = "panel-lote-info";
    info.innerHTML = `<strong>Lote ${lote.numero} — ${lote.titulo}</strong>${lote.estado === "finalizada" ? "Finalizada" : `Activa · ${formatoMonto(lote.oferta_actual, lote.remate_moneda)}`}`;

    const acciones = document.createElement("p");
    acciones.className = "panel-lote-acciones";

    const btnVer = document.createElement("button");
    btnVer.type = "button";
    btnVer.textContent = "Ver lote";
    btnVer.addEventListener("click", () => {
      cerrarMisOfertas();
      abrirModal(lote);
    });

    const btnQuitar = document.createElement("button");
    btnQuitar.type = "button";
    btnQuitar.className = "peligro";
    btnQuitar.textContent = "Quitar";
    btnQuitar.addEventListener("click", () => {
      toggleFavorito(lote.id);
      const tarjeta = document.querySelector(`.subasta-card[data-lote-id="${lote.id}"]`);
      if (tarjeta) tarjeta.style.borderColor = "var(--line)";
      renderMisFavoritos();
    });

    acciones.append(btnVer, btnQuitar);
    li.append(info, acciones);
    lista.appendChild(li);
  });
}

// ===== Ocultar el header al bajar, mostrarlo al subir + sombra al scrollear =====
(() => {
  const header = document.querySelector(".site-header");
  let ultimoScroll = window.scrollY;
  window.addEventListener("scroll", () => {
    const scrollActual = window.scrollY;
    if (scrollActual > ultimoScroll && scrollActual > 80) {
      header.classList.add("header-oculto");
    } else {
      header.classList.remove("header-oculto");
    }
    header.classList.toggle("header-con-sombra", scrollActual > 4);
    ultimoScroll = scrollActual;
  });
})();

// ===== Mostrar solo una sección "de página completa" a la vez =====
function mostrarSoloSeccion(idAMostrar) {
  document.querySelectorAll("main > section").forEach((s) => {
    s.hidden = s.id !== idAMostrar;
  });
  window.scrollTo(0, 0);
}
function volverAHome() {
  // Estas son "páginas" separadas (no forman parte de la home) — hay que
  // ocultarlas explícitamente al volver, si no se quedan mezcladas con la home.
  const paginasDedicadas = ["terminos", "misOfertasSeccion", "carritoSeccion", "finalizadasSeccion", "todosLosLotesSeccion", "panelSeccion", "usuariosSeccion", "nosotrosSeccion", "galeriaSeccion", "contactoSeccion", "como-ofertar-detalle"];
  document.querySelectorAll("main > section").forEach((s) => {
    if (paginasDedicadas.includes(s.id)) s.hidden = true;
    else if (s.id !== "ofertasRecientesSeccion") s.hidden = false;
  });
  renderLotes();
  renderOfertasRecientes();
  window.scrollTo(0, 0);
}

// ===== Términos y Condiciones: se muestra en el lugar, sin cambiar de página =====
document.querySelectorAll("[data-terminos]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    mostrarSoloSeccion("terminos");
  });
});
document.getElementById("btnCerrarTerminos").addEventListener("click", volverAHome);
document.getElementById("btnCerrarComoFunciona")?.addEventListener("click", volverAHome);

// ===== Quiénes somos =====
document.getElementById("btnAbrirNosotros")?.addEventListener("click", () => {
  mostrarSoloSeccion("nosotrosSeccion");
  cerrarPanelLateral();
});
document.getElementById("btnCerrarNosotros")?.addEventListener("click", volverAHome);

// ===== Galería de remates pasados =====
document.getElementById("btnCerrarGaleria")?.addEventListener("click", volverAHome);

// ===== Contacto =====
document.getElementById("btnAbrirContacto")?.addEventListener("click", () => {
  mostrarSoloSeccion("contactoSeccion");
  cerrarPanelLateral();
});
document.getElementById("btnCerrarContacto")?.addEventListener("click", volverAHome);

document.getElementById("formContacto")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  const resp = document.getElementById("contactoMensajeResp");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    const r = await fetch(`${API_URL}/contacto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: document.getElementById("contactoNombre").value,
        email: document.getElementById("contactoEmail").value,
        mensaje: document.getElementById("contactoMensaje").value,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      resp.textContent = "✅ ¡Mensaje enviado! Te respondemos a la brevedad.";
      resp.className = "panel-mensaje exito";
      e.target.reset();
    } else {
      resp.textContent = d.error || "No se pudo enviar.";
      resp.className = "panel-mensaje error";
    }
  } catch {
    resp.textContent = "No se pudo conectar con el servidor.";
    resp.className = "panel-mensaje error";
  }
  btn.disabled = false;
  btn.textContent = "Enviar mensaje";
});

// ===== Newsletter =====
document.querySelector(".form-newsletter")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("newsletter-email");
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    const r = await fetch(`${API_URL}/newsletter/suscribir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.value }),
    });
    const d = await r.json();
    btn.textContent = r.ok ? "✅ ¡Listo!" : "Error";
    if (r.ok) input.value = "";
    setTimeout(() => { btn.textContent = "Suscribir"; btn.disabled = false; }, 3000);
  } catch {
    btn.textContent = "Error"; btn.disabled = false;
  }
});
document.getElementById("btnAbrirFinalizadas").addEventListener("click", () => {
  mostrarSoloSeccion("finalizadasSeccion");
  renderFinalizadasPagina();
});
document.getElementById("btnCerrarFinalizadas").addEventListener("click", volverAHome);
document.getElementById("linkInicio").addEventListener("click", (event) => {
  event.preventDefault();
  volverAHome();
});
document.getElementById("btnNavInicio")?.addEventListener("click", (event) => {
  event.preventDefault();
  volverAHome();
  cerrarPanelLateral();
});
document.getElementById("btnAbrirTodosLosLotes").addEventListener("click", () => {
  mostrarSoloSeccion("todosLosLotesSeccion");
  renderTodosLosLotesPagina();
});
document.getElementById("btnCerrarTodosLosLotes").addEventListener("click", volverAHome);

// ===== Animación al aparecer en pantalla (scroll reveal) =====
const observerRevelado = new IntersectionObserver(
  (entradas) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        entrada.target.classList.add("reveal-visible");
        observerRevelado.unobserve(entrada.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
);
function activarScrollReveal(contenedor) {
  contenedor.querySelectorAll(".subasta-card:not(.reveal-visible)").forEach((tarjeta) => {
    tarjeta.classList.add("reveal-pendiente");
    observerRevelado.observe(tarjeta);
  });
}

// ===== Inicializar =====
renderCuentaArea();
cargarLotes().then(revisarLandingDeRubro);
renderOfertasRecientes();
revisarLinkDeRecuperacion();
