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

Carpeta raíz: `D:\Projects\somewhere.finance\`. No es un repo; contiene los proyectos, cada uno con su propio repo en `github.com/victorhmlz-dev`.

### `landing`

Scrollytelling WebGL. Next.js 16.3.5, React 19.2, three con React Three Fiber, zustand, JavaScript, CSS Modules.

- Cinco capítulos activos: Singularity, Big Bang, Nebula, Galaxies & Chains y Universe, que cierra con el wordmark y el CTA.
- El acto dedicado a los NFFC (ocho capítulos) está archivado, no borrado. `docs/ARCHIVED_NFFC_ACT.md` explica cómo reconectarlo.
- Tiene reglas propias en `landing/CLAUDE.md`. La más importante: no usar Git en ese repo; lo gestiona el usuario.
- El 2026-10-10 el repo local iba 12 commits por detrás de `origin/main` y tenía 5 archivos modificados sin commitear. El usuario iba a sincronizarlo o a clonarlo de nuevo. Comprueba su estado antes de tocarlo.
- El CTA final enlaza a `/explore`, que no existe en la landing sino en el front.

### `somewhere.finance-front`

Next.js 15 (App Router), React 19, JavaScript, CSS plano con BEM, alias `@/` a la raíz. Una sola dependencia aparte de Next y React: `viem`, fijada a una versión exacta y usada únicamente dentro de `lib/chain/`. La parte social (2026-10-11) y el Launchpad (2026-10-12) están conectados a la API; el resto de lo de mercado sigue saliendo de los mocks de `data/`.

Conectado a la API:

- Connect Wallet: login por firma con la wallet inyectada en el navegador (`window.ethereum` para EVM, `window.phantom.solana` para Solana), sin librerías. Código en `lib/wallet/`. La sesión vive en `components/providers/SessionProvider.jsx` (`useSession()`), con el token en `localStorage`.
- Feed con "Discover" y "My network", publicar, like, repost, borrar; página de un post con sus replies (`/post/[id]`); página de un hashtag (`/hashtag/[tag]`).
- Perfil propio (`/profile`) y de otros (`/profile/[handle]`), con editar perfil y follow.
- Notificaciones con sus pestañas y el contador de no leídas en el menú; tendencias y sugerencias de a quién seguir en el lateral y en Explore.
- Cliente de la API en `lib/api/apiClient.js` y una función por ruta en `lib/services/social/`. La URL sale de `NEXT_PUBLIC_API_URL` y por defecto es `http://localhost:3001/api`.
- Launchpad: lista con filtro por estado (`/launchpad`), página de un lanzamiento (`/launchpad/[id]`) y formulario para crear uno (`/launchpad/new`). Comprar, listar el token, retirar tokens y pedir el reembolso son transacciones que firma la wallet del navegador; el código está en `lib/chain/launchpadActions.js`. Cada transacción se simula antes de pedir la firma, y los rechazos del contrato se traducen a mensajes en `lib/chain/chainError.js`. Las redes y la dirección del contrato vienen de la API, no de variables del front. `npm run abi:sync` regenera `lib/chain/abi.js` desde los contratos compilados.
- Dos hooks cargan los datos: `hooks/shared/usePaginatedList.js` (listas con cursor) y `hooks/shared/useAsyncData.js` (un valor).

Sigue con mocks o sin acción:

- Collections, Auctions y Trading enteros.
- En el perfil propio, las pestañas Trading, History, Balances y Portfolio. En el perfil de otro usuario solo se muestra Posts.
- En Explore, la noticia destacada, "Today's news" y las pestañas NFTs, Tokens y Creators. En el feed, el carrusel de arriba.
- Los buscadores, y los botones Place Bid, Buy Now, Mint, comprar y vender.
- En el Launchpad no hay todavía pantalla para que el creador cobre su vesting ni para retirar la comisión; los contratos lo permiten, falta la interfaz. Tampoco existen los lanzamientos de NFT y NFFC que mostraba la maqueta, ni los "boosts".

Límites conocidos:

- Solo se usa la primera wallet que el navegador inyecta. Elegir entre varias extensiones (EIP-6963), WalletConnect y wallets móviles quedan para la fase cripto.
- Las imágenes de posts y avatares se indican con un enlace; no hay subida.
- En desarrollo, React ejecuta cada carga dos veces, así que las views suben el doble que en producción.
- viem añade unos 95 KB a las páginas de un lanzamiento y de crear uno; la lista casi no cambia. Se podría reducir cargándola solo al pulsar un botón.
- Para enviar transacciones a una red, la wallet tiene que conocerla. El front pide el cambio de red, pero no la añade: si no está, muestra un mensaje.
- El Launchpad se probó en el navegador con una wallet simulada que firma contra la cadena local, no con MetaMask real.

Organización del código:

- Estructura paralela por página: `components/pages/<pagina>/`, `data/pages/<pagina>/`, `hooks/pages/<pagina>/`, `styles/components/pages/<pagina>/`. Lo compartido va en `components/shared/`, `hooks/shared/` y `styles/components/shared/`.
- `lib/services/pages/` (tres funciones que devuelven mocks) y `lib/blockchain/` (cuatro módulos que solo lanzan "not implemented yet") siguen sin usarse.

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
- Launchpad (2026-10-12): un indexador (`src/launchpad/launch-indexer.service.ts`) copia a PostgreSQL los eventos de los contratos de `somewhere.finance-contracts`, y `/api/launches` sirve esa copia con filtros. Tablas `launches`, `launch_contributions`, `chain_events` (cada evento procesado, una sola vez) y `chain_cursors`. Las cadenas se configuran en `EVM_CHAINS`; vacía, no hay Launchpad. El estado de una venta se calcula en cada petición con la misma lógica que el contrato (`src/launchpad/launch-status.ts`). Verificado contra una cadena local con los contratos reales, además de los tests.
- Subida de imágenes (2026-10-15): `POST /api/uploads/images` (con sesión, campo `file`, PNG/JPEG/GIF/WebP hasta 2 MB, formato leído de los bytes, sin SVG) devuelve `{ url }`, y `GET /api/uploads/:nombre` la sirve con caché inmutable y `nosniff`. Cada imagen se reescribe con `sharp` (sin metadatos ni datos añadidos, máximo 2048 px) y se nombra con el SHA-256 de lo guardado. Los archivos van a `UPLOAD_DIR` (por defecto `uploads/`, ignorada por git) y las URLs usan `PUBLIC_API_URL`.
- Descripción e imagen de un lanzamiento (2026-10-15, decisión del usuario): se ponen juntas, una vez, por el creador y solo antes del inicio de la venta; nunca cambian. La imagen tiene que ser de la propia subida. Al crear, el front las manda con el hash de la transacción (`POST /api/launches/details`) y el back las guarda en `pending_launch_details` hasta que el indexador lee el lanzamiento. Esto arregla el fallo visto en Sepolia: el front esperaba al indexador solo 30 s y con 5 confirmaciones tardaba más, así que no guardaba nada.
- Lista de tokens (2026-10-15): `GET /api/launches/token-list`, en el formato estándar de Uniswap (tokenlists.org), con los tokens listados y su logo. Validada en los tests contra el esquema oficial. Es la vía elegida para que wallets y exchanges muestren los logos; se descartó por ahora guardar la imagen en IPFS o enlazarla desde el contrato, porque la lista la controlamos nosotros igualmente y un servidor propio permite retirar imágenes ilegales o que suplanten a otros.
- Cancelación (2026-10-15): estado `cancelled`, columna `cancelled_at` y evento `Cancelled` en el indexador. El filtro `ended` incluye las canceladas.
- Lo que la gente añade sobre un lanzamiento nunca se pierde al releer la cadena (2026-10-15, tras perderse descripciones e imágenes con un `launchpad:reset`; el usuario exigió que no pueda pasar en producción). `launches` es solo una copia de la cadena; la descripción y la imagen viven en `launch_profiles`, y comentarios, reacciones y notificaciones apuntan al id sin clave foránea. El id sale de la cadena (`src/launchpad/launch-id.ts`: UUIDv7 con hora del bloque, número y hash de cadena, contrato y número), así que releer da el mismo id. Las notificaciones de compra llevan `source_key` y no se repiten. Un cambio de `Launchpad` en `EVM_CHAINS` ya no exige reset: el indexador lee el nuevo y los lanzamientos del anterior se quedan sin mostrarse. `launchpad:reset` solo borra la copia y no corre con `NODE_ENV=production`.
- Notificaciones de compra (2026-10-15): `launch_purchase` al creador ("@x bought your token") y `purchase` al comprador ("You bought N TOKEN for X ETH"), creadas por el indexador con la fecha del bloque. Una wallet sin perfil aparece por su dirección (`actorAddress`).
- Zona social de los lanzamientos (2026-10-15, decisiones del usuario): un comentario es un post con `launch_id`; sus replies heredan el lanzamiento; salen también en los feeds. El creador recibe `launch_comment` por cada comentario o reply. Reacciones con emoji (tabla `reactions`, seis fijas: rocket, fire, gem, eyes, joy, thumbs_down) en posts y en lanzamientos, con notificación `reaction` al dueño.
- Tests unitarios de la firma, del entorno, de la configuración de cadenas, del estado de un lanzamiento y de la extracción de hashtags y menciones; tests e2e de auth, health, users, posts, feed, notifications y launchpad contra la base de datos real. Los del launchpad usan una cadena falsa en memoria (`test/fake-chain.ts`). Los e2e corren un archivo detrás de otro porque comparten base de datos.
- `.gitattributes` fija los finales de línea de `prisma/migrations/` en LF. Prisma guarda una huella de cada migración aplicada; si el archivo cambia aunque sea de finales de línea, `prisma migrate dev` pide reiniciar la base de datos.

Límites conocidos de lo hecho:

- La verificación EVM solo cubre wallets normales. Las de contrato (ERC-1271) necesitan una llamada RPC y quedan para la fase on-chain.
- No hay logout, refresco de token ni forma de vincular una segunda wallet a un usuario.
- La subida de imágenes guarda en el disco del servidor; en producción hará falta almacenamiento de objetos (S3, R2) o un disco persistente. Las imágenes subidas que no se llegan a usar no se borran. Avatares y posts aún no la usan: el front sigue pidiendo una URL. Retirar una imagen (moderación) aún no tiene herramienta; cuando la tenga, quitar un logo de la lista exige subir el número mayor de su versión.
- Un repost es una marca sobre el post (tabla `reposts`), no un post nuevo. Sale en "My network" y en el perfil; "Discover" no muestra reposts.
- Las timelines no deduplican: un post puede salir como post y como repost de varias personas en la misma lista.
- "Discover" y las sugerencias de a quién seguir son deliberadamente simples (orden cronológico y número de seguidores). Las categorías que el front muestra junto a cada tendencia ("NFTs", "Launchpad") son editoriales y la API no las da.
- Un post borrado conserva su fila, vacía y con `deleted_at`, para que sus replies sigan apuntando a él. Toda consulta de posts tiene que filtrar `deletedAt: null`.
- Las notificaciones se consultan por petición; no hay tiempo real (WebSocket o SSE) ni se pueden marcar como leídas de una en una.
- El tipo `reply` no está en los mocks del front, que solo conocen `like`, `repost`, `follow`, `sale`, `bid` y `mention`. El front tendrá que pintarlo, por ejemplo igual que una mención. Los tipos `sale` y `bid` llegarán con el marketplace.
- Los mocks del front usan `postText` en las notificaciones de like y repost; la API da el post entero en `post`.
- El indexador solo lee bloques ya confirmados y nunca deshace lo leído. Si una cadena reemplaza un bloque indexado, se detiene y hay que subir `confirmations` y reindexar (`npm run launchpad:reset -- <cadena>`).
- Los números de bloque se guardan como enteros de 32 bits. Bastan para años, pero una cadena de bloques muy rápidos como Robinhood Chain los agotaría en torno a 7 años.
- Nadie finaliza todavía las ventas exitosas automáticamente; si nadie llama a `finalize` en 7 días, la venta pasa a fallida. Falta una tarea que lo haga, que necesitará una wallet con fondos en el servidor.
- No se puede borrar una cuenta. Cuando se pueda, habrá que ajustar los contadores de follows de los demás usuarios, porque el borrado en cascada no los toca.

Requisitos de la máquina: Node 22.22.3 o superior para el CLI de NestJS (`npm run build`, `npm run start:dev`) y Docker Desktop en marcha para la base de datos y los tests e2e. Desde el 2026-10-10 la máquina tiene Node 26.

### `somewhere.finance-contracts`

Contratos para lanzar tokens fungibles en las cadenas EVM, empezados el 2026-10-11. Solidity 0.8.28, Hardhat 3, OpenZeppelin 5; tests en TypeScript con viem y en Solidity con forge-std. El `README.md` resume las reglas y `docs/ARCHITECTURE.md` contiene la auditoría, el diseño, las invariantes y el estado.

El usuario aportó una especificación (`docs/prompt.txt` y `docs/public.txt` en la carpeta raíz, escritas con ChatGPT) que define el alcance y **el proceso a seguir**: auditar, proponer, esperar aprobación, implementar por etapas pequeñas e informar solo de las pruebas realmente ejecutadas. No se debe prometer que el protocolo elimina el fraude.

Productos previstos:

- **Somewhere Launchpad**, ventas a precio fijo. Implementado.
- **Somewhere Parabolic**, lanzamientos con curva de precio. Sin empezar; arquitectura aparte.
- **Somewhere Trust Graph**, reputación de creadores y puntuación técnica de tokens. Sin empezar; es sobre todo backend.

Reglas del Launchpad, decididas por el usuario y forzadas por el contrato:

- Al menos el 70% de lo recaudado va a liquidez, bloqueada para siempre (los tokens del pool van a `0x…dEaD`).
- El resto, menos la comisión, va al creador con vesting: tramos mensuales iguales, mínimo 3 y máximo 48, el primero a los 30 días del listado. Los tokens del creador (hasta el 1% del supply) siguen el mismo calendario.
- Comisión del 0,5%, con tope del 1%. Queda apartada en la venta y se retira con `collectFee`.
- Venta fallida: reembolso íntegro y sin comisión. Si una venta exitosa no se lista en 7 días, pasa a fallida sola.
- Mínimo y máximo por wallet, opcionales. Lo que no cabe se devuelve en la misma transacción.
- El token se lista al precio de la venta. Sin proxies ni actualizaciones.
- Cuanto más largo el vesting, mejor puntuación tendrá el token en el Trust Graph.

Estado al 2026-10-12: 67 tests pasan en la red simulada (51 unitarios, 7 de fuzzing y 9 invariantes), y se comprobó con seis fallos deliberados que los detectan. Además, 3 tests ejecutan un lanzamiento completo contra el Uniswap V2 real de Sepolia sobre una copia local de esa cadena (`npm run test:fork`, con `SEPOLIA_FORK_URL`).

Secretos: las URL de nodo y las claves de despliegue van en el almacén cifrado de Hardhat (`npx hardhat keystore set <NOMBRE>`), nunca en archivos. `hardhat.config.ts` solo contiene los nombres: `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `TEST_WALLET_1_PRIVATE_KEY` y `TEST_WALLET_2_PRIVATE_KEY`. El 2026-10-12 el usuario pegó por error tres claves privadas de wallets de prueba en ese archivo; se retiraron antes de cualquier commit y el usuario decidió seguir usándolas solo para pruebas. Esas wallets no deben usarse nunca con fondos reales. Claude no ejecuta `keystore set` ni despliega: piden una contraseña tecleada a mano, así que lo hace el usuario.

Límites conocidos:

- Sin auditar y sin desplegar en ninguna red. No se ha pasado análisis estático.
- Uniswap V2 tiene fábrica oficial en Sepolia (probada), BNB Chain y Robinhood Chain (sin probar); las direcciones están en el `README.md` del proyecto.
- Una venta exitosa hay que finalizarla en 7 días; el backend tendrá que hacerlo automáticamente.
- Solo EVM. Solana necesita programas propios en otro proyecto.
- El back todavía no indexa los eventos de estos contratos y el front sigue mostrando el launchpad con mocks.

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
- **Reglas del launchpad** que el front promete: liquidez gestionada por contrato, enviada al exchange de la red (Uniswap, Raydium, PancakeSwap) y bloqueada; los desarrolladores retienen como máximo el 1% del supply. Robinhood Chain no tiene exchange asignado todavía. Los contratos de `somewhere.finance-contracts` ya hacen cumplir estas reglas en las cadenas EVM.

## 5. Decisiones tomadas

1. El backend va en un repo aparte: `somewhere.finance-back`.
2. Base de datos: PostgreSQL.
3. Lenguaje y framework: TypeScript con NestJS. La duda entre TypeScript y JavaScript quedó resuelta así.
4. Se empieza por la parte off-chain. Lo on-chain va después.
5. Los NFFC se comunican como indica la sección 2.
6. Los contratos van en un proyecto aparte, `somewhere.finance-contracts`, no en el backend.
7. Orden de lo cripto (acordado el 2026-10-11): primero los tokens fungibles (Launchpad, después Parabolic, después Trust Graph). Subastas, compraventa de NFT y NFFC quedan pendientes para después. Se empieza por EVM en testnet; Solana será un proyecto aparte.
8. **Multired y RWA, requisito vital (2026-10-15).** Nada en el stack puede asumir Ethereum ni la moneda nativa: Somewhere trabaja en todas las redes y entre redes ("a través de todos los mundos"), incluidas las no EVM como Solana, y usa RWA. Los tokens se pueden emparejar con cualquier activo permitido, incluidas acciones tokenizadas. Las redes se modelan por familia (evm, solana…) y los activos explícitamente (red, dirección o mint, símbolo, decimales, tipo).
9. **Fábrica al estilo long.xyz con las reglas de Somewhere (2026-10-15), opción B:** contratos propios que copian el concepto, no el código. Se adoptan la reserva de ticker y la validación de fábrica oficial; la subasta dinámica, más adelante, como alternativa a la curva de Parabolic. Referencias revisadas: long.xyz (Robinhood Chain, sobre Doppler y Uniswap v4) y StonkFun (Solana, sobre Raydium LaunchLab).
10. **Acciones tokenizadas de Robinhood verificadas en la red (2026-10-15):** ERC-20 de 18 decimales tras un beacon proxy actualizable (`0xe10b6f6B275de231345c20D14Ab812db62151b00`, que es también el registro de acceso). Sin lista blanca: un contrato nuevo puede recibirlas (transferencia simulada con éxito, y muchos contratos ya las custodian). Riesgos del emisor: lista negra por dirección, pausa global y cambio de implementación en cualquier momento. Si bloquea o pausa durante una venta, ni el listado ni los reembolsos funcionarían: hay que tratarlo en el diseño de la v3 y mostrarlo en la puntuación de seguridad.
11. **Billetera (2026-10-15):** solución del mercado (Privy, Dynamic o Turnkey), no custodial, conviviendo con MetaMask, Phantom y demás wallets externas, con varias wallets por cuenta. Proveedor por elegir.
11b. **Proveedor de billetera elegido: Privy (2026-10-16).** Falta el App ID de la cuenta del usuario para integrarlo.
12. **Verificación por niveles (2026-10-15):** como en la evaluación de riesgos (mirar, social, comprar, crear). Somewhere no guarda información sensible: igual que las claves de las wallets, la verificación la hacen terceros y la API solo guarda el resultado.
13. **Modelo de pago estilo fomo.family, con mejoras de Somewhere (2026-10-16):** el USDC es la moneda central del usuario y todo se muestra en dólares, con el importe real en pequeño. El usuario puede tener además la moneda nativa de cada red en la que opera; la interfaz le ayuda a gestionar sus activos y le recomienda tener algo de moneda nativa para pagar menos comisiones. Si no la tiene, el gas se cobra del USDC con una comisión mayor, mostrada antes de firmar. Comprar con lo que tenga (cambio y aportación en un paso) llegará después. Mejoras sobre Fomo: comisiones visibles antes de firmar y fijadas en la cadena, no en una web; autocustodia con exportación de claves; wallets externas también; aviso de qué emisor puede congelar cada activo; protección contra deslizamiento y bots.
14. **Diseño de la v3 del Launchpad aprobado (2026-10-16):** lista de activos permitidos por red con mínimo propio; USDC como par sugerido por defecto; moneda nativa envuelta en WETH por dentro (una sola contabilidad); compra con ERC-20 midiendo lo recibido; ventas como clones EIP-1167; ticker reservado por red en la cadena, liberado si la venta se cancela o falla, y comprobado entre redes en el back; `saleOf`/`isOfficial` en la cadena; comisión y vesting en el activo del par; hueco `requiredTier` para la verificación. Antes de programarla: comprobar en la cadena cómo trata Robinhood los splits y la dirección del factory de Uniswap V2 en Robinhood Chain. Solana: LaunchLab de Raydium (modelo StonkFun) si acepta cualquier mint como par.
14b. **Comprobaciones en la cadena para la v3 (2026-10-16):**
   - Robinhood Stock Tokens (implementación `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2` tras el beacon): los splits y dividendos se aplican con un multiplicador de pantalla (`uiMultiplier`, `balanceOfUI`, `totalSupplyUI`, `updateMultiplier` con `effectiveAt`); `balanceOf` no cambia, así que la venta puede contar en unidades reales. Para mostrar acciones hay que multiplicar por `uiMultiplier` (≈1,000775 en NVDA el 2026-10-16). Admiten `permit` (EIP-2612). El emisor tiene `adminBurn(address,uint256)`: puede quemar tokens de cualquier dirección, también de una venta; la v3 reparte cualquier pérdida a prorrata en los reembolsos en lugar de dejar sin nada a los últimos.
   - Uniswap V2 en Robinhood Chain: factory `0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f`, router `0x89e5db8b5aa49aa85ac63f691524311aeb649eba`, WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` (verificado: el router apunta al factory, 115.312 pares, existe NVDA/WETH).
   - La stablecoin nativa de Robinhood Chain es USDG de Paxos (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimales), no USDC. "Moneda central" significa el dólar principal de cada red: USDC donde Circle lo emite, USDG en Robinhood Chain. El usuario ve dólares.
15. **Sesión con el token de Privy, aplazada (2026-10-16):** quitar la segunda firma y abrir nuestra sesión verificando el token de Privy en el back, con la cuenta como nuestra y Privy como una de sus formas de acceso. Va junto con varias wallets por cuenta.

## 6. Siguiente trabajo

El 2026-10-11 el usuario decidió pasar a lo cripto. El Launchpad tiene sus contratos escritos y probados en local; para que funcione de punta a punta falta, en este orden:

1. Desplegar en Sepolia. Los parámetros están en `ignition/parameters/sepolia.json`, a falta de la dirección pública de la wallet de despliegue. El usuario tiene que guardar la URL del nodo y las claves en el almacén de Hardhat y lanzar él mismo el comando de despliegue.
2. Probar un lanzamiento a mano en Sepolia con las wallets de prueba.
3. Back: hecho el indexador y las rutas (2026-10-12). Falta la tarea que finalice las ventas exitosas dentro del plazo de 7 días.
4. Front: hecho (2026-10-12) con viem, decisión del usuario. Para desarrollar: `npm run node` y `npm run demo:local` en contratos, y pegar en el `.env` del back la línea `EVM_CHAINS` que imprime.
5. Desplegado en Sepolia el 2026-10-14: Launchpad en `0x83c968b3E5EeBaaBe78a6f5f9235207d942804e1`, bloque 11915040, verificado leyendo el contrato en la red. El usuario probó el ciclo con MetaMask real en Sepolia con éxito (2026-10-14).
6. Detalles de esa prueba, hechos el 2026-10-15: imagen de los tokens (subida real, al crear el lanzamiento o después; logo redondo en la tarjeta y en la página, con las iniciales del símbolo si no hay imagen) y un recuadro de mensajes (`components/shared/FormMessage.jsx`) con espacio reservado, para que nada se mueva cuando aparece un error.
7. Aprobado y hecho el 2026-10-15 en todo el stack: imagen fija para siempre, lista de tokens, botón "Add to wallet" (EIP-747) y cancelación por el creador solo antes del inicio (decisión D17 de `docs/ARCHITECTURE.md`). La cancelación cambia el contrato `TokenSale`: la v2 se desplegó en Sepolia el 2026-10-15 en `0xB393ef85b97f9A0391cC612Eb97707E7078E0261`, bloque 11916640 (registro en `ignition/deployments/sepolia-v2/`), verificada leyendo el contrato en la red. La v1 (`0x83c9…04e1`) queda sin uso. Probado en local de punta a punta: contratos reales, indexador, API y navegador con una wallet de prueba.
8. Segunda ronda de observaciones del usuario, hecha el 2026-10-15: calendario propio (`components/shared/DateTimePicker.jsx`) con Accept y Cancel; sin las burbujas de validación del navegador, con avisos dorados en `FormMessage`; "Add to wallet" desde la creación del token salvo si está cancelado; descripción e imagen solo al crear; notificaciones de compra; y la conversación del lanzamiento con reacciones. Probado de punta a punta en una cadena local con dos usuarios.
9. Lo que queda del Launchpad: las pantallas de vesting y de comisión; la tarea del back que finaliza ventas; aligerar viem en el front; y la auditoría antes de cualquier red real.

Después: Somewhere Parabolic y el Trust Graph. Lo de NFT queda pendiente.

Quedó aparcado de lo social, sin orden acordado:

- Tiempo real para notificaciones y feeds.
- Usar la subida de imágenes (ya existe en el back) para avatares y posts, y el recuadro `FormMessage` en el resto de formularios.
- Las opiniones bullish/bearish de la terminal de trading, que son sociales pero cuelgan de un token.
- Buscador de usuarios y posts; listas de followers y following en el perfil (la API ya las da, el front no las muestra).

Forma de trabajo: una rama por paso (`features/<tema>`) en cada repo que se toque, pull request a `main`, y la rama siguiente sale del `main` ya actualizado. Los commits y los merges los hace el usuario.

## 7. Análisis interno de los NFFC

Valoración que se le dio al usuario cuando la pidió. Es material interno, escrito en términos técnicos a propósito; no es copy ni base para copy.

- **A favor:** tienen valor neto calculable, lo que da un suelo de precio real; unen la parte social con la de trading (un creador publica uno y sus seguidores lo compran); encajan con la narrativa de acciones tokenizadas de Robinhood Chain.
- **Riesgo principal, regulatorio:** un conjunto de acciones es casi seguro un valor, y agruparlas se parece a un fondo. Un creador que las combina puede parecer un asesor de inversiones sin licencia. Se le recomendó un abogado de valores antes de escribir el contrato. La forma de comunicarlos de la sección 2 no elimina este riesgo.
- **Por verificar:** si las acciones tokenizadas del emisor elegido pueden ser custodiadas por un contrato de terceros. Si no, el NFFC no se puede construir como está pensado.
- **Problema de diseño:** el contenido es naturalmente fungible; hacerlo único fragmenta la liquidez, y si es redimible su precio converge al valor neto.
- **Sugerencias:** que lo único sea la curación del creador con historial público; decidir pronto si es redimible; mirar ERC-6551 como base técnica.
- Nada de esto bloquea el backend off-chain.

## 7b. Multired en el back y el front (2026-10-16)

Primer paso del requisito vital de la decisión 8:

- Configuración `CHAINS` por familias (`evm`, `solana`), cada red con su moneda nativa (`symbol`, `name`, `decimals`). `EVM_CHAINS` se sigue leyendo. Solo las redes EVM con `launchpad` se indexan.
- Tabla `assets` (red, dirección o mint, símbolo, decimales, tipo: native, crypto, stablecoin, stock, rwa, emisor). Cada lanzamiento apunta a su `quoteAsset` y guarda `tokenDecimals`. Las columnas "native" pasaron a "quote" (`liquidity_quote`, `creator_quote`, `vesting_released_quote`, `quote_amount` en notificaciones), con migración que renombra sin borrar.
- El front lee cada importe con los decimales de su activo (`lib/chain/amounts.js`: `formatQuote`, `formatTokens`) y el formulario de creación tiene "Paired with".
- Los tests e2e ya no leen las redes del `.env`.
- Siguiente: contrato v3 con el activo del par como parámetro (lista de activos permitidos por red, acciones tokenizadas incluidas).

## 7c. Privy en el front (2026-10-16)

- `@privy-io/react-auth` 3.46.0 (fijada) con los paquetes de Solana que pide. `components/providers/AppProviders.jsx` envuelve la app con `PrivyProvider`: email o wallet (MetaMask, Phantom, Coinbase, WalletConnect para EVM, extensiones detectadas), y billetera embebida EVM y Solana para quien no tiene ninguna. WalletConnect para Solana no se puede activar a la vez que el de EVM en esta versión.
- El login sigue siendo nuestro: la wallet que Privy conecta firma el reto de la API (`lib/wallet/privyWallets.js`). `ActiveWalletBridge` deja como wallet de las transacciones la de la sesión (`lib/wallet/activeWallet.js`).
- App ID en `.env.local` del front (`NEXT_PUBLIC_PRIVY_APP_ID`). Probado: la ventana de Privy abre con el App ID real y se cierra junto con la nuestra. Falta que el usuario pruebe un login real (email y MetaMask) y revisar en el panel de Privy los orígenes permitidos para producción.

## 7d. Launchpad v3 en el back y el front (2026-10-16)

- Contratos: `LaunchpadV3`, `TokenSaleV3`, `CreatorVestingV3` (ver `somewhere.finance-contracts/docs/ARCHITECTURE.md`, sección 13). Sin desplegar todavía en Sepolia; módulo `ignition/modules/LaunchpadV3.ts`, parámetros `sepolia-v3.json` y script `scripts/allow-quote-assets.ts`.
- Back: `CHAINS` admite `launchpads: [{ address, version, startBlock }]` y `assets` (etiquetas de tokens). Un cursor por red y contrato; los activos permitidos salen de `QuoteAssetUpdated` (`launchpad_quote_assets`); WETH se muestra como la moneda nativa. `GET /api/launches/tickers/:symbol` dice qué lanzamientos de cualquier red usan un ticker. Migración `20261016180000_launchpad_v3`, sin borrar datos.
- Front: compra con `permit` (una firma) si el token lo admite (EIP-5267), si no aprobación exacta y compra; con moneda nativa, `contributeNative`. Formulario con el activo sugerido (stablecoins primero), el mínimo de cada activo, tickers A–Z/0–9 y aviso de tickers usados en otras redes; aviso de emisores que pueden congelar.
- Probado en local de punta a punta en el navegador: compra en MUSD con permit, aviso de saldo, creación v3 en ETH, compra con devolución del sobrante, listado y reclamo.
- Pendiente: desplegar la v3 en Sepolia (paso del usuario) y añadirla a `CHAINS` tras la v2; probar la aprobación en dos pasos con el USDC de Sepolia si no expone `eip712Domain`; precios en dólares.

## 8. Riesgos de producción

Evaluación hecha el 2026-10-15 a petición del usuario, tras perderse datos con un reset.

Ya resuelto el 2026-10-15: base de datos propia para los tests e2e (`somewhere_finance_test`, con negativa a correr contra otra); `launchpad:reset` con confirmación y solo en local; límites de peticiones por IP y cuota diaria de imágenes; avatares e imágenes de posts solo con subidas propias; aviso en el front cuando la wallet que firma no es la de la sesión; números de bloque a 64 bits. Cada corrección de seguridad queda en el `SECURITY-HISTORY.md` de su repo (ignorado por git).

Pendiente antes de abrir al público:

- La tarea que lista las ventas exitosas (sin ella, una venta olvidada pasa a reembolso a los 7 días). Lo más urgente del producto.
- Monitorización y alertas: errores (Sentry o similar), indexador parado o retrasado, proveedor de nodo caído.
- Que solo un servidor indexe a la vez (bloqueo en PostgreSQL o proceso aparte) y contadores de límites en Redis si hay varios servidores.
- Proveedor de nodo de pago y uno de reserva.
- Almacenamiento de objetos (R2 o S3, con versiones) para las imágenes, y limpieza de las que nadie usa.
- Copias de seguridad con restauración a cualquier momento (PITR), probadas.
- Regla de migraciones: una migración aplicada nunca se edita; las destructivas, en dos pasos y ensayadas sobre una copia real.
- Herramienta de moderación (retirar imágenes y comentarios, con registro) y denuncias.
- Lista de tokens solo con tokens revisados y alertas de nombres que imitan a tokens conocidos.
- Cabeceras de seguridad (CSP) en el front; valorar sesión en cookie `httpOnly` en vez de `localStorage`.
- Valorar basar el id de un lanzamiento en el hash de su transacción en vez de la hora del bloque (resistente a reorganizaciones).
- Gestor de secretos en los servidores; nunca reutilizar las wallets de prueba.

Pendiente antes de dinero real: auditoría externa de los contratos, y dueño y receptor de comisiones del `Launchpad` en una multifirma (Safe).

## 9. Pendientes menores

Front:

- Ocho componentes sin usar en `components/pages/feed/`, restos de una landing anterior: `ExploreChains`, `FeaturedNFTs`, `FinalCTA`, `HowItWorks`, `LiveAuctions`, `MarketplaceStats`, `TopCreators`, `TrendingCollections`.
- `components/layout/Footer.jsx` no se usa en ningún sitio, y enlaza a `/creators`, que no existe.
- Los logs de `.playwright-mcp/` están versionados en git.
- Neon Bazaar aparece en BSC en collections y en Solana en launchpad.
- Holders, trades y opiniones de la terminal son los mismos para cualquier token.

Landing:

- El tagline del cierre (`components/dom/FinalCta.jsx`) dice "Across every chains, trought all the worlds.", con erratas y distinto del tagline del brief.
- Los logos de las siete empresas son marcas reales sin permiso confirmado; `public/logos/README.md` documenta la reserva.
