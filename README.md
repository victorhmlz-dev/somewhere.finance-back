# somewhere.finance-back

Backend de Somewhere Finance. Stack: TypeScript, NestJS 12, PostgreSQL 17, Prisma 7.

## Requisitos

- Node.js 22.22.3 o superior. Con una versión anterior de la rama 22 la app y los tests funcionan, pero el CLI de NestJS (`npm run build`, `npm run start:dev`) falla al arrancar.
- Docker Desktop, para la base de datos.

## Puesta en marcha

```bash
cp .env.example .env     # y rellena JWT_SECRET
npm install
npm run db:up            # PostgreSQL en Docker, puerto 5433
npm run db:deploy        # aplica las migraciones
npm run start:dev        # API en http://localhost:3001/api
```

`GET /api/health` responde `{"status":"ok","database":"up"}` cuando todo está en pie.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run start:dev` | Arranca la API y recarga al guardar |
| `npm run build` | Compila a `dist/` |
| `npm test` | Tests unitarios (`src/**/*.spec.ts`) |
| `npm run test:e2e` | Tests contra la API y la base de datos reales (`test/`), un archivo detrás de otro |
| `npm run lint` | oxlint |
| `npm run db:up` / `db:down` | Levanta o para PostgreSQL |
| `npm run db:migrate` | Crea y aplica una migración a partir de los cambios en `prisma/schema.prisma` |
| `npm run db:generate` | Regenera el cliente de Prisma en `src/generated/` |
| `npm run db:studio` | Abre un explorador de la base de datos |

Después de `npm run db:migrate` hay que ejecutar `npm run db:generate` para que el código vea los modelos nuevos.

## Estructura

```
prisma/schema.prisma   Modelo de datos; las migraciones salen de aquí
src/config/            Lectura y validación de variables de entorno
src/prisma/            Conexión a la base de datos
src/auth/              Login por firma de wallet y sesión por JWT
src/users/             Perfiles y follows
src/posts/             Posts, replies, likes, reposts y extracción de hashtags
src/feed/              Timelines, tendencias y sugerencias de a quién seguir
src/common/            Piezas compartidas, como la paginación
src/health/            Comprobación de estado
test/                  Tests e2e
```

## Login por wallet

1. `POST /api/auth/challenge` con `{ "family": "evm" | "solana", "address": "...", "chainId": 1 }` (`chainId` es opcional y solo aplica a EVM). Devuelve `{ nonce, message, expiresAt }`.
2. El front pide a la wallet que firme `message` tal cual.
3. `POST /api/auth/verify` con `{ "nonce": "...", "signature": "..." }`. La firma va en hexadecimal con `0x` para EVM y en base58 para Solana. Devuelve `{ accessToken, user }`. Si la wallet es nueva, se crea el usuario.
4. Las rutas protegidas esperan la cabecera `Authorization: Bearer <accessToken>`. `GET /api/auth/me` devuelve el usuario de la sesión.

Un reto caduca a los 5 minutos y solo sirve una vez. Una dirección EVM es la misma en Ethereum, BNB Chain y Robinhood Chain, así que una wallet se identifica por familia (`evm` o `solana`), no por cadena.

## Perfiles y follows

| Ruta | Sesión | Qué hace |
|---|---|---|
| `GET /api/users/:handle` | Opcional | Perfil público, con `followingCount`, `followersCount` e `isFollowing` |
| `PATCH /api/users/me` | Sí | Edita `name`, `handle`, `bio` y `avatar`; solo cambia los campos enviados |
| `PUT /api/users/:handle/follow` | Sí | Sigue al usuario y devuelve su perfil |
| `DELETE /api/users/:handle/follow` | Sí | Lo deja de seguir y devuelve su perfil |
| `GET /api/users/:handle/followers` | Opcional | Quién lo sigue, del más reciente al más antiguo |
| `GET /api/users/:handle/following` | Opcional | A quién sigue, del más reciente al más antiguo |

`isFollowing` indica si el usuario de la sesión sigue a ese usuario; sin sesión siempre es `false`. En las rutas de sesión opcional, un token presente pero inválido responde 401.

El handle tiene de 3 a 15 caracteres (letras, números y guion bajo) y se guarda en minúsculas. `avatar` es una URL `http` o `https`, o `null` para quitarlo. Seguir o dejar de seguir dos veces no cambia nada.

## Posts

| Ruta | Sesión | Qué hace |
|---|---|---|
| `POST /api/posts` | Sí | Publica un post con `{ text, image, replyToId }`; con `replyToId` es una reply |
| `GET /api/posts/:id` | Opcional | Devuelve el post |
| `DELETE /api/posts/:id` | Sí | Lo borra; solo puede su autor |
| `GET /api/posts/:id/replies` | Opcional | Sus replies, de la más antigua a la más reciente |
| `PUT /api/posts/:id/like` y `DELETE` | Sí | Da o quita el like y devuelve el post |
| `PUT /api/posts/:id/repost` y `DELETE` | Sí | Hace o deshace el repost y devuelve el post |

Un post tiene esta forma:

```json
{
  "id": "…",
  "author": { "id": "…", "name": "…", "handle": "…", "avatar": null, "verified": false, "bio": "" },
  "text": "…",
  "image": null,
  "createdAt": "2026-10-11T00:00:00.000Z",
  "replyTo": null,
  "stats": { "replies": 0, "reposts": 0, "likes": 0, "views": 0 },
  "isLiked": false,
  "isReposted": false
}
```

- El texto admite hasta 280 caracteres. Un post necesita texto, imagen (una URL `http` o `https`) o ambos.
- En una reply, `replyTo` es `{ id, handle }`: el post al que responde y el handle de su autor.
- `isLiked` e `isReposted` se refieren al usuario de la sesión; sin sesión son `false`.
- Cada vez que un post se sirve, solo o dentro de una lista, suma una view.
- Dar like o hacer repost dos veces no cambia nada; quitarlo dos veces, tampoco.
- Un post borrado responde 404 y desaparece de todas las listas. Su texto y su imagen se eliminan de la base de datos, pero la fila se conserva para que sus replies sigan indicando a qué respondían.

## Timelines

| Ruta | Sesión | Qué muestra |
|---|---|---|
| `GET /api/feed/discover` | Opcional | Los posts de todo el mundo; es la pestaña "Discover" |
| `GET /api/feed/network` | Sí | Posts y reposts del usuario y de quienes sigue; es la pestaña "My network" |
| `GET /api/users/:handle/posts` | Opcional | Posts y reposts de ese usuario, para su perfil |
| `GET /api/hashtags/:tag/posts` | Opcional | Posts y replies que llevan ese hashtag; `tag` va sin `#` |

Las cuatro van del más reciente al más antiguo, están paginadas y devuelven entradas con esta forma:

```json
{ "id": "…", "post": { "…": "un post, como arriba" }, "repostedBy": null }
```

- `repostedBy` es el usuario que hizo el repost, o `null` si la entrada es el post en sí.
- Un mismo post puede salir varias veces en una timeline (como post y como repost de varias personas). Por eso `id` identifica la entrada, no el post: es lo que hay que usar como `key` en el front.
- Las replies solo aparecen en la timeline de un hashtag. "Discover" tampoco muestra reposts.
- "Discover" es cronológico; no hay algoritmo de ranking.

## Tendencias y sugerencias

| Ruta | Sesión | Qué hace |
|---|---|---|
| `GET /api/hashtags/trending` | No | Hashtags con más posts en las últimas 24 horas: `{ items: [{ hashtag, tag, postCount }] }` |
| `GET /api/feed/who-to-follow` | Opcional | Usuarios con más seguidores; con sesión, sin el propio usuario ni los que ya sigue |

Las dos aceptan `?limit=` (de 1 a 20); por defecto devuelven 10 tendencias y 3 sugerencias.

Un hashtag es un `#` seguido de letras, números o guiones bajos (hasta 50, con al menos una letra). `#NOVA` y `#nova` cuentan como el mismo; en las tendencias se muestra escrito como lo escribe la mayoría.

## Paginación

Las listas aceptan `?limit=` (de 1 a 50, por defecto 20) y `?cursor=`, y responden `{ items, nextCursor }`. Para la página siguiente se envía `nextCursor` como `cursor`; cuando es `null` no hay más.
