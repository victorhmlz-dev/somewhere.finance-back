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
- El indexador guarda en `chain_cursors.launchpad` el contrato que lee y se detiene si `EVM_CHAINS` nombra otro (2026-10-15).
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

## 8. Pendientes menores

Front:

- Ocho componentes sin usar en `components/pages/feed/`, restos de una landing anterior: `ExploreChains`, `FeaturedNFTs`, `FinalCTA`, `HowItWorks`, `LiveAuctions`, `MarketplaceStats`, `TopCreators`, `TrendingCollections`.
- `components/layout/Footer.jsx` no se usa en ningún sitio, y enlaza a `/creators`, que no existe.
- Los logs de `.playwright-mcp/` están versionados en git.
- Neon Bazaar aparece en BSC en collections y en Solana en launchpad.
- Holders, trades y opiniones de la terminal son los mismos para cualquier token.

Landing:

- El tagline del cierre (`components/dom/FinalCta.jsx`) dice "Across every chains, trought all the worlds.", con erratas y distinto del tagline del brief.
- Los logos de las siete empresas son marcas reales sin permiso confirmado; `public/logos/README.md` documenta la reserva.
