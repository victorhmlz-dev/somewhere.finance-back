# Traspaso de contexto: backend de Somewhere Finance

Este documento resume una conversación previa entre Victor (el usuario) y Claude, mantenida el 2026-10-07 en el repo del front. Léelo entero antes de proponer nada: contiene el análisis del front, las decisiones ya tomadas y la única pregunta que quedó abierta.

El usuario escribe en español; respóndele en español.

## 1. El producto

Somewhere Finance es una red social tipo X fusionada con un marketplace cripto multichain. Cadenas soportadas: Ethereum, Solana, BNB Chain y Robinhood Chain (en el código aparece como `robinhood`).

Tipos de activo:

- `nft`: NFT normal.
- `token`: token fungible, se negocia en la terminal de trading y se lanza en el launchpad.
- `nffc`: "Non Fungible Financial Collectibles", término acuñado por el usuario. Es una canasta de acciones tokenizadas envuelta en un NFT con características únicas. Hay que modelarlo como un activo con subyacentes, no como un NFT cualquiera.

## 2. Estado actual

Carpeta raíz: `D:\Projects\somewhere.finance\`

- `somewhere.finance-front`: el front. Es solo una maqueta, sin funcionalidad real.
- `landing`: no se revisó.
- `somewhere.finance-back`: **no existe todavía**. Es lo que toca crear.

### El front

- Next.js 15 (App Router), React 19, JavaScript sin TypeScript, CSS plano con BEM, alias `@/` a la raíz.
- No hay backend, wallet, fetch ni llamadas a cadena. Todo sale de archivos mock en `data/`.
- Rutas: `/` (feed), `/explore`, `/collections`, `/auctions`, `/launchpad`, `/trading`, `/notifications`, `/profile`. No hay rutas dinámicas de detalle.
- Estructura paralela por página: `components/pages/<pagina>/`, `data/pages/<pagina>/`, `hooks/pages/<pagina>/`, `styles/components/pages/<pagina>/`.
- `lib/services/` tiene tres funciones asíncronas que devuelven mocks y que nadie importa. Es el punto natural para conectar la API.
- `lib/blockchain/` tiene cuatro módulos (uno por cadena) que solo lanzan "not implemented yet".
- `.env.example` define `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` y una URL de RPC por cadena.

Botones sin acción hoy: Connect Wallet, Post, Follow, Place Bid, Buy Now, Mint, Edit profile, comprar/vender.

## 3. Lo que el front le exige al backend

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
- **Autenticación por wallet.** El único acceso que muestra el front es "Connect Wallet": login por firma de mensaje, con formatos distintos para EVM y Solana.
- **Tiempo real.** Subastas, trades, precio y notificaciones piden WebSocket o SSE.
- **Filtros en servidor.** Los hooks `hooks/pages/collections/useCollectionFilters.js` y `hooks/pages/auctions/useAuctionFilters.js` ya definen los parámetros: búsqueda, tipo, cadenas, rango de precio en USD, antigüedad o tiempo restante, creador, solo verificadas, y orden.
- **Reglas del launchpad** que el front promete: liquidez gestionada por contrato, enviada al exchange de la red (Uniswap, Raydium, PancakeSwap) y bloqueada; los desarrolladores retienen como máximo el 1% del supply.

## 4. Decisiones ya tomadas por el usuario

1. El backend va en un repo aparte: `D:\Projects\somewhere.finance\somewhere.finance-back`.
2. Base de datos: PostgreSQL.
3. Lenguaje: Java o Node. La conversación se inclinó hacia Node; no se confirmó formalmente.
4. Se empieza por la parte off-chain. Lo on-chain va después.

## 5. Pregunta abierta: TypeScript o JavaScript

Es lo último que se discutió y **el usuario no ha respondido**. No asumas ninguna de las dos.

- El usuario domina mejor JavaScript y preguntó por qué TypeScript.
- Recomendación de Claude: TypeScript con NestJS, por los errores de forma de dato (importes, direcciones, identificadores de cadena), el acceso tipado a PostgreSQL, las librerías de cadena y los refactors que vendrán con lo on-chain.
- Alternativa si elige JavaScript: Fastify en lugar de NestJS (NestJS con JavaScript es incómodo), con validación de esquemas en cada endpoint.
- Criterio que se le dio: TypeScript si está dispuesto a leer tipos desde el primer día; JavaScript si prefiere entender cada línea sin fricción.

Lo primero que hay que hacer es obtener esa respuesta.

## 6. Primer hito propuesto (pendiente de confirmar)

1. Scaffold de `somewhere.finance-back`, con PostgreSQL en Docker y migraciones.
2. Login por firma de wallet (EVM y Solana) con sesión por JWT.
3. Usuarios y perfiles, follows.
4. Posts, likes, reposts, replies y hashtags, con los feeds "Discover" y "My network".
5. Notificaciones.

## 7. Opinión que se dio sobre los NFFC

El usuario pidió una valoración de la idea. Resumen de lo que se le dijo, para no contradecirlo sin motivo:

- **A favor:** tienen valor neto calculable, lo que da un suelo de precio real; unen la parte social con la de trading (un creador publica una canasta y sus seguidores la compran); encajan con la narrativa de acciones tokenizadas de Robinhood Chain.
- **Riesgo principal, regulatorio:** una canasta de acciones es casi seguro un valor, y agruparlas se parece a un fondo. Un creador que arma canastas puede parecer un asesor de inversiones sin licencia. Se le recomendó un abogado de valores antes de escribir el contrato.
- **Por verificar:** si las acciones tokenizadas del emisor elegido pueden ser custodiadas por un contrato de terceros. Si no, el NFFC no se puede construir como está descrito.
- **Problema de diseño:** una canasta es naturalmente fungible; hacerla única fragmenta la liquidez, y si es redimible su precio converge al valor neto.
- **Sugerencias:** que lo único sea la curación del creador con historial público de rendimiento; decidir pronto si es redimible; mirar ERC-6551 como base técnica.
- Nada de esto bloquea el backend off-chain.

## 8. Pendientes menores detectados en el front

No son parte del trabajo de backend; están aquí por si el usuario los menciona.

- Ocho componentes sin usar en `components/pages/feed/`, restos de una landing anterior: `ExploreChains`, `FeaturedNFTs`, `FinalCTA`, `HowItWorks`, `LiveAuctions`, `MarketplaceStats`, `TopCreators`, `TrendingCollections`.
- `Footer` se importa en `app/layout.js` pero no se renderiza, y enlaza a `/creators`, que no existe.
- Los logs de `.playwright-mcp/` están versionados en git.
- Neon Bazaar aparece en BSC en collections y en Solana en launchpad.
- Holders, trades y opiniones de la terminal son los mismos para cualquier token.
