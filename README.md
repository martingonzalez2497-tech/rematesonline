# Remate Directo

## Estructura del proyecto

```
index.html, styles.css, script.js   → el sitio (frontend)
fotos/                               → tus fotos de lotes
backend/                             → el servidor (API + base de datos)
```

## Cómo correrlo (primera vez)

### 1. Backend

```
cd backend
npm install
cp .env.example .env
```

Abrí `.env` y cambiá `JWT_SECRET` por algo propio y largo. Para generar uno:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Pegá ese valor en `JWT_SECRET=` dentro de `.env`.

Creá el primer administrador (te va a preguntar nombre, email y contraseña):

```
npm run seed:admin
```

Arrancá el servidor:

```
npm start
```

Tiene que quedar corriendo y mostrar: `Backend de Remate Directo escuchando en http://localhost:3000`.
**Dejalo abierto** en esa terminal mientras usás el sitio.

### 2. Frontend

Con el backend corriendo, abrí `index.html` con Live Server (como ya veníamos haciendo). El sitio va a pedirle los lotes al backend automáticamente.

Si ves el aviso "No se pudo conectar con el servidor" en la página, es que el backend no está corriendo — volvé al paso 1.

## Los 3 tipos de usuario

| Rol | Cómo se crea | Qué puede hacer |
|---|---|---|
| **Público general** | Se registra solo desde el botón "Ingresar" del sitio | Ver lotes y ofertar |
| **Rematador** | Lo crea un administrador (no hay registro público) | Todo lo anterior + crear y editar sus propios lotes |
| **Administrador** | El primero se crea con `npm run seed:admin`; desde ahí ese admin puede crear más | Todo, incluyendo borrar lotes y gestionar usuarios |

Por seguridad, **nadie puede autoregistrarse como rematador o administrador** — si no, cualquier visitante podría crearse una cuenta de administrador. Esos roles los asigna siempre alguien que ya es administrador.

## Remates y lotes

Un **remate** agrupa varios **lotes** bajo un mismo evento y rubro — por ejemplo, "Remate de Gastronomía" puede tener adentro el lote #001 (juego de ollas), #002 (cafetera), #003 (set de cuchillos), cada uno con su propio precio, oferta y hora de cierre.

Iniciá sesión como rematador (o administrador) y vas a ver un botón **"Panel"** en el menú. Ahí es en dos pasos:

1. **Creás el remate** (título, rubro, descripción) — ej. "Remate de Gastronomía"
2. **Le cargás los lotes** uno por uno, eligiendo a qué remate pertenece cada uno

En la home, los lotes aparecen agrupados visualmente bajo el remate al que pertenecen. El dropdown "Rubros" y la búsqueda filtran por remate. Cada lote sigue teniendo su propia ficha, oferta y botón "Ingresar" — agruparlos es solo para mostrarlos juntos, no cambia cómo se puja.

No hace falta usar `curl` ni tocar la API a mano para nada de esto.

## Gestionar usuarios (solo administrador)

Iniciá sesión como administrador y vas a ver un botón **"Usuarios"** en el menú. Ahí podés:
- Crear cuentas de rematador o administrador (con nombre, email, contraseña y rol)
- Ver todos los usuarios registrados
- Cambiar el rol de cualquier usuario con un simple menú desplegable

## Recuperar contraseña

Desde el modal de login, "¿Olvidaste tu contraseña?" pide el email y genera un link de recuperación válido por 1 hora.

**Importante: todavía no hay un servicio de email conectado.** El link no se manda por mail — se imprime en la terminal donde corre el backend (buscá el bloque que dice "RECUPERACIÓN DE CONTRASEÑA"). Copiá esa URL completa y pegala en el navegador para probarlo.

Cuando quieras que los links se manden por mail de verdad, hay que:
1. Elegir un servicio (Resend y SendGrid tienen planes gratuitos chicos; Gmail con contraseña de aplicación también sirve para arrancar)
2. Darme las credenciales (como variables de entorno en `.env`, nunca hardcodeadas)
3. Reemplazar el `console.log` en `backend/routes/auth.js` (ruta `/olvide-password`) por el envío real — el resto del flujo (generar token, que expire en 1 hora, que no se pueda reusar) ya queda funcionando tal cual.

## Qué falta (a propósito, para no todo de una vez)

- Sincronización en tiempo real entre navegadores (hoy, si dos personas ofertan casi al mismo tiempo, cada una ve el resultado recién al recargar o volver a abrir el lote — no hay actualización instantánea tipo chat)
- Subir esto a un hosting real (hoy corre en tu computadora)
- Conectar un servicio de email real para la recuperación de contraseña (hoy el link se imprime en la consola del servidor)
- Email de contacto del negocio (todavía no está en el footer)

## Repaso de calidad y accesibilidad ya hecho

- Contraste de colores verificado contra WCAG AA (todos los pares texto/fondo pasan, en modo claro y oscuro)
- Menú de navegación colapsa a hamburguesa en pantallas chicas (antes se amontonaba con muchos ítems)
- Los 6 modales del sitio atrapan el foco del teclado correctamente (Tab no se escapa hacia el contenido de atrás)
- Se agregó el `<h1>` que faltaba en la página (afecta accesibilidad y buscadores)
- Sin IDs duplicados en el HTML
