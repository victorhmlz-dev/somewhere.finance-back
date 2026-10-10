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
| `npm run test:e2e` | Tests contra la API y la base de datos reales (`test/`) |
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

## Paginación

Las listas aceptan `?limit=` (de 1 a 50, por defecto 20) y `?cursor=`, y responden `{ items, nextCursor }`. Para la página siguiente se envía `nextCursor` como `cursor`; cuando es `null` no hay más.
