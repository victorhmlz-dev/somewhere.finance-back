# Traspaso de contexto: Somewhere Finance

Actualizado el 2026-10-10. Sustituye a la versión del 2026-10-07, que se escribió antes de que existiera el backend. Léelo entero antes de proponer nada.

El usuario (Victor) escribe en español; respóndele en español. El copy de la interfaz va en inglés.

Hay dos copias idénticas de este archivo: una en la raíz `D:\Projects\somewhere.finance\` y otra dentro de `somewhere.finance-back`. Si editas una, copia el resultado a la otra.

## 1. El producto

Somewhere Finance es una red social tipo X fusionada con un marketplace cripto multichain. Cadenas soportadas: Ethereum, Solana, BNB Chain y Robinhood Chain (en el código aparece como `robinhood`).

Tipos de activo:

- `nft`: NFT normal.
- `token`: token fungible; se negocia en la terminal de trading y se lanza en el launchpad.
- `nffc`: NonFungible Financial Collectibles, término acuñado por el usuario. Ver la sección 2 antes de escribir una sola palabra sobre ellos.

## 2. Cómo se habla de los NFFC

Regla única para las tres partes del proyecto (landing, front y back).

**Hacia fuera** (interfaz, landing, metadatos, README, mensajes de error, documentación pública de la API), un NFFC es el punto donde los NFT se encuentran con el mundo real. Frase de referencia:

> Where NFTs meet the real world.

Se puede variar el tono poético, pero no el fondo: coleccionables digitales que llevan dentro un pedazo del mundo real.

- El nombre completo se escribe "NonFungible Financial Collectibles"; el plural corto es "NFFCs".
- No se describe como canasta de acciones, cesta, índice, fondo, cartera ni producto de inversión.
- No se da asesoramiento financiero ni se prometen rendimientos, APY o dividendos.
- Todo dato de demostración visible lleva la etiqueta "Illustrative data".

**Hacia dentro** (modelo de datos, contratos, este documento), un NFFC es un NFT con características únicas que envuelve un conjunto de acciones tokenizadas. Por eso se modela como un activo con subyacentes y no como un NFT cualquiera. Esta descripción no sale de aquí: es para diseñar, no para comunicar.

Estado de la regla en cada parte:

- **Front:** ya la cumple. Solo muestra la etiqueta "NFFC" como tipo de colección, sin explicarla.
- **Back:** todavía no tiene nada sobre NFFC.
- **Landing:** pendiente, porque el repo local está a medio sincronizar (ver sección 3). Cuando esté al día hay que reescribir el apartado "Concepto NFFC" de `docs/SCROLLYTELLING_BRIEF.md`, que hoy lo describe como una estructura similar a un índice con activos subyacentes, y alinear la línea sobre NFFC de `CLAUDE.md` con esta sección.

## 3. Estado actual

Carpeta raíz: `D:\Projects\somewhere.finance\`. No es un repo; contiene tres repos independientes en `github.com/victorhmlz-dev`.

### `landing`

Scrollytelling WebGL. Next.js 16.3.5, React 19.2, three con React Three Fiber, zustand, JavaScript, CSS Modules.

- Cinco capítulos activos: Singularity, Big Bang, Nebula, Galaxies & Chains y Universe, que cierra con el wordmark y el CTA.
- El acto dedicado a los NFFC (ocho capítulos) está archivado, no borrado. `docs/ARCHIVED_NFFC_ACT.md` explica cómo reconectarlo.
- Tiene reglas propias en `landing/CLAUDE.md`. La más importante: no usar Git en ese repo; lo gestiona el usuario.
- El 2026-10-10 el repo local iba 12 commits por detrás de `origin/main` y tenía 5 archivos modificados sin commitear. El usuario iba a sincronizarlo o a clonarlo de nuevo. Comprueba su estado antes de tocarlo.
- El CTA final enlaza a `/explore`, que no existe en la landing sino en el front.

### `somewhere.finance-front`

Maqueta sin funcionalidad real. Next.js 15 (App Router), React 19, JavaScript, CSS plano con BEM, alias `@/` a la raíz.

- No hay backend, wallet, fetch ni llamadas a cadena. Todo sale de los mocks de `data/`.
- Rutas: `/` (feed), `/explore`, `/collections`, `/auctions`, `/launchpad`, `/trading`, `/notifications`, `/profile`. No hay rutas dinámicas de detalle.
- Estructura paralela por página: `components/pages/<pagina>/`, `data/pages/<pagina>/`, `hooks/pages/<pagina>/`, `styles/components/pages/<pagina>/`.
- `lib/services/` tiene tres funciones asíncronas que devuelven mocks y que nadie importa. Es el punto natural para conectar la API.
- `lib/blockchain/` tiene cuatro módulos (uno por cadena) que solo lanzan "not implemented yet".
- `.env.example` define el nombre y la URL de la app y una URL de RPC por cadena. No hay variable para la URL del back.
- Botones sin acción: Connect Wallet, Post, Follow, Place Bid, Buy Now, Mint, Edit profile, comprar y vender.

### `somewhere.finance-back`

TypeScript, NestJS 12, PostgreSQL 17 en Docker (puerto 5433), Prisma 7, Vitest, oxlint. API en `http://localhost:3001/api`. El `README.md` del repo explica la puesta en marcha y los scripts.

Hecho:

- Scaffold, validación de variables de entorno al arrancar, `GET /api/health`.
- Login por firma de wallet: `POST /api/auth/challenge`, `POST /api/auth/verify`, `GET /api/auth/me`. EVM firma un mensaje EIP-4361; Solana firma el mismo formato con Ed25519. El reto caduca a los 5 minutos y sirve una sola vez. La sesión es un JWT de una semana.
- Tablas `users`, `wallets` y `auth_challenges`. Una wallet se identifica por familia (`evm` o `solana`), no por cadena, porque una dirección EVM es la misma en Ethereum, BNB Chain y Robinhood Chain.
- Perfiles y follows (2026-10-10): ver un perfil por handle, editar el propio, seguir y dejar de seguir, y listas paginadas de followers y following. Tabla `follows` y contadores `following_count` y `followers_count` en `users`, actualizados en la misma transacción que cada follow. Las rutas están en el `README.md`.
- Paginación por cursor común a todas las listas (`src/common/pagination.ts`): `?limit=` y `?cursor=`, respuesta `{ items, nextCursor }`.
- `OptionalAuthGuard` para rutas públicas cuya respuesta depende de quién pregunta.
- Posts (2026-10-11): publicar, ver y borrar posts, replies, likes y reposts, y la lista de posts de un usuario. Tablas `posts`, `likes` y `reposts`; los contadores de replies, reposts, likes y views viven en la fila del post. Las rutas y la forma de un post están en el `README.md`.
- Feeds (2026-10-11): timelines "Discover", "My network", perfil y hashtag; tendencias de las últimas 24 horas y sugerencias de a quién seguir. Tabla `post_hashtags`, que se rellena al publicar. Posts y reposts se mezclan en una sola timeline con una consulta SQL directa en `src/feed/feed.service.ts`.
- Notificaciones (2026-10-11): tipos `like`, `repost`, `follow`, `mention` y `reply`; lista paginada con pestañas, contador de no leídas y marcar todo como leído. La tabla `notifications` guarda una fila por hecho; las filas se agrupan al leerlas ("Aria y 12 más") con una consulta SQL directa en `src/notifications/notifications.service.ts`. Cada fila se crea y se borra dentro de la transacción de lo que la causa (`src/notifications/notification-events.ts`).
- Tests unitarios de la firma, del entorno y de la extracción de hashtags y menciones; tests e2e de auth, health, users, posts, feed y notifications contra la base de datos real. Los e2e corren un archivo detrás de otro porque comparten base de datos.
- `.gitattributes` fija los finales de línea de `prisma/migrations/` en LF. Prisma guarda una huella de cada migración aplicada; si el archivo cambia aunque sea de finales de línea, `prisma migrate dev` pide reiniciar la base de datos.

Límites conocidos de lo hecho:

- La verificación EVM solo cubre wallets normales. Las de contrato (ERC-1271) necesitan una llamada RPC y quedan para la fase on-chain.
- No hay logout, refresco de token ni forma de vincular una segunda wallet a un usuario.
- El avatar y la imagen de un post son solo una URL; no hay subida de imágenes.
- Un repost es una marca sobre el post (tabla `reposts`), no un post nuevo. Sale en "My network" y en el perfil; "Discover" no muestra reposts.
- Las timelines no deduplican: un post puede salir como post y como repost de varias personas en la misma lista.
- "Discover" y las sugerencias de a quién seguir son deliberadamente simples (orden cronológico y número de seguidores). Las categorías que el front muestra junto a cada tendencia ("NFTs", "Launchpad") son editoriales y la API no las da.
- Un post borrado conserva su fila, vacía y con `deleted_at`, para que sus replies sigan apuntando a él. Toda consulta de posts tiene que filtrar `deletedAt: null`.
- Las notificaciones se consultan por petición; no hay tiempo real (WebSocket o SSE) ni se pueden marcar como leídas de una en una.
- El tipo `reply` no está en los mocks del front, que solo conocen `like`, `repost`, `follow`, `sale`, `bid` y `mention`. El front tendrá que pintarlo, por ejemplo igual que una mención. Los tipos `sale` y `bid` llegarán con el marketplace.
- Los mocks del front usan `postText` en las notificaciones de like y repost; la API da el post entero en `post`.
- No se puede borrar una cuenta. Cuando se pueda, habrá que ajustar los contadores de follows de los demás usuarios, porque el borrado en cascada no los toca.

Requisitos de la máquina: Node 22.22.3 o superior para el CLI de NestJS (`npm run build`, `npm run start:dev`) y Docker Desktop en marcha para la base de datos y los tests e2e. El 2026-10-10 la máquina tenía Node 22.13.0 y el usuario iba a actualizarlo.

## 4. Lo que el front le exige al backend

La forma de cada entidad está en los mocks del front; úsalos como contrato de partida.

| Dominio | Entidades | Archivo mock (dentro de `somewhere.finance-front/data/pages/`) |
|---|---|---|
| Identidad | Usuario (nombre, handle, bio, avatar, verificado, wallet, fecha de alta, contadores de follows) | `profile/currentUserData.js` |
| Social | Posts (texto con hashtags, imagen opcional, contadores de replies, reposts, likes, views), tendencias | `feed/feedPostData.js`, `feed/trendingNewsData.js`, `explore/exploreData.js` |
| Notificaciones | Tipos `like`, `repost`, `follow`, `sale`, `bid`, `mention`; actores agrupados; leído o no | `notifications/notificationData.js` |
| Marketplace | Colecciones (tipo, creador, cadena, floor, volumen 24h, items, verificada, fecha) y NFTs | `collections/collectionData.js`, `explore/nftData.js` |
| Subastas | Puja actual en moneda nativa y en USD, número de pujas, fecha de fin | `auctions/auctionData.js` |
| Launchpad | Lanzamientos de `token`, `nft` o `nffc`; estado `live`, `upcoming`, `ended`; progreso; boosts; % de desarrolladores | `launchpad/launchpadData.js` |
| Trading | Tokens (precio, market cap, volumen, liquidez, holders, cambios por periodo, actividad de compras y ventas), trades, holders, opiniones con sentimiento `bullish` o `bearish` (máx. 280 caracteres) | `trading/tradingData.js`, `trading/tokenMoversData.js` |
| Cartera | Balances, portfolio de NFT y NFFC, historial de compras y ventas, PnL realizado por periodo, trades cerrados | `profile/profileData.js` |

Implicaciones:

- **Dos naturalezas de dato.** Lo social es propio y vive en nuestra base de datos. Lo de mercado (precios, holders, trades, balances, floor) viene de las cadenas y habrá que indexarlo o tomarlo de proveedores.
- **Tiempo real.** Subastas, trades, precio y notificaciones piden WebSocket o SSE.
- **Filtros en servidor.** Los hooks `hooks/pages/collections/useCollectionFilters.js` y `hooks/pages/auctions/useAuctionFilters.js` ya definen los parámetros: búsqueda, tipo, cadenas, rango de precio en USD, antigüedad o tiempo restante, creador, solo verificadas, y orden.
- **Reglas del launchpad** que el front promete: liquidez gestionada por contrato, enviada al exchange de la red (Uniswap, Raydium, PancakeSwap) y bloqueada; los desarrolladores retienen como máximo el 1% del supply. Robinhood Chain no tiene exchange asignado todavía.

## 5. Decisiones tomadas

1. El backend va en un repo aparte: `somewhere.finance-back`.
2. Base de datos: PostgreSQL.
3. Lenguaje y framework: TypeScript con NestJS. La duda entre TypeScript y JavaScript quedó resuelta así.
4. Se empieza por la parte off-chain. Lo on-chain va después.
5. Los NFFC se comunican como indica la sección 2.

## 6. Siguiente trabajo

El primer hito del backend (la parte social, off-chain) está completo. No hay un siguiente paso acordado; las opciones naturales son:

- Conectar el front a lo que ya existe: cliente de API en `lib/services/`, variable de entorno con la URL del back y el flujo de Connect Wallet contra `/api/auth`. Es lo que haría visible todo lo construido.
- Tiempo real para notificaciones y feeds.
- Subida de imágenes para avatares y posts.
- Las opiniones bullish/bearish de la terminal de trading, que son sociales pero cuelgan de un token.
- Empezar el marketplace (colecciones, subastas, launchpad), que ya toca datos de cadena.

Forma de trabajo: una rama por paso (`features/<tema>`), pull request a `main`, y la rama siguiente sale del `main` ya actualizado. Los commits y los merges los hace el usuario.
## 7. Análisis interno de los NFFC

Valoración que se le dio al usuario cuando la pidió. Es material interno, escrito en términos técnicos a propósito; no es copy ni base para copy.

- **A favor:** tienen valor neto calculable, lo que da un suelo de precio real; unen la parte social con la de trading (un creador publica uno y sus seguidores lo compran); encajan con la narrativa de acciones tokenizadas de Robinhood Chain.
- **Riesgo principal, regulatorio:** un conjunto de acciones es casi seguro un valor, y agruparlas se parece a un fondo. Un creador que las combina puede parecer un asesor de inversiones sin licencia. Se le recomendó un abogado de valores antes de escribir el contrato. La forma de comunicarlos de la sección 2 no elimina este riesgo.
- **Por verificar:** si las acciones tokenizadas del emisor elegido pueden ser custodiadas por un contrato de terceros. Si no, el NFFC no se puede construir como está pensado.
- **Problema de diseño:** el contenido es naturalmente fungible; hacerlo único fragmenta la liquidez, y si es redimible su precio converge al valor neto.
- **Sugerencias:** que lo único sea la curación del creador con historial público; decidir pronto si es redimible; mirar ERC-6551 como base técnica.
- Nada de esto bloquea el backend off-chain.

## 8. Pendientes menores

Front:

- Ocho componentes sin usar en `components/pages/feed/`, restos de una landing anterior: `ExploreChains`, `FeaturedNFTs`, `FinalCTA`, `HowItWorks`, `LiveAuctions`, `MarketplaceStats`, `TopCreators`, `TrendingCollections`.
- `Footer` se importa en `app/layout.js` pero no se renderiza, y enlaza a `/creators`, que no existe.
- Los logs de `.playwright-mcp/` están versionados en git.
- Neon Bazaar aparece en BSC en collections y en Solana en launchpad.
- Holders, trades y opiniones de la terminal son los mismos para cualquier token.

Landing:

- El tagline del cierre (`components/dom/FinalCta.jsx`) dice "Across every chains, trought all the worlds.", con erratas y distinto del tagline del brief.
- Los logos de las siete empresas son marcas reales sin permiso confirmado; `public/logos/README.md` documenta la reserva.
