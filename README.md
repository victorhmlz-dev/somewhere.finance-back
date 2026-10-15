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
| `npm run test:e2e` | Tests contra la API y una base de datos solo para tests (`test/`), un archivo detrás de otro |
| `npm run lint` | oxlint |
| `npm run db:up` / `db:down` | Levanta o para PostgreSQL |
| `npm run db:migrate` | Crea y aplica una migración a partir de los cambios en `prisma/schema.prisma` |
| `npm run db:generate` | Regenera el cliente de Prisma en `src/generated/` |
| `npm run db:studio` | Abre un explorador de la base de datos |
| `npm run abi:sync` | Copia los eventos de los contratos compilados a `src/launchpad/abi.ts` |
| `npm run launchpad:reset -- <cadena>` | Borra la copia de una cadena para leerla de nuevo; conserva lo que añadió la gente. Solo para desarrollo |

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
src/notifications/     Notificaciones
src/launchpad/         Lanzamientos de tokens: indexador de la cadena y rutas
src/uploads/           Subida de imágenes y su descarga
src/reactions/         Reacciones con emoji a posts y lanzamientos
scripts/               Utilidades de desarrollo
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
| `POST /api/posts` | Sí | Publica un post con `{ text, image, replyToId, launchId }`; con `replyToId` es una reply y con `launchId`, un comentario sobre ese lanzamiento |
| `GET /api/posts/:id` | Opcional | Devuelve el post |
| `DELETE /api/posts/:id` | Sí | Lo borra; solo puede su autor |
| `GET /api/posts/:id/replies` | Opcional | Sus replies, de la más antigua a la más reciente |
| `PUT /api/posts/:id/like` y `DELETE` | Sí | Da o quita el like y devuelve el post |
| `PUT /api/posts/:id/repost` y `DELETE` | Sí | Hace o deshace el repost y devuelve el post |
| `PUT /api/posts/:id/reactions/:kind` y `DELETE` | Sí | Pone o quita una reacción con emoji y devuelve el post |

Un post tiene esta forma:

```json
{
  "id": "…",
  "author": { "id": "…", "name": "…", "handle": "…", "avatar": null, "verified": false, "bio": "" },
  "text": "…",
  "image": null,
  "createdAt": "2026-10-11T00:00:00.000Z",
  "replyTo": null,
  "launch": null,
  "stats": { "replies": 0, "reposts": 0, "likes": 0, "views": 0 },
  "isLiked": false,
  "isReposted": false,
  "reactions": [{ "kind": "rocket", "count": 0, "reacted": false }, "…"]
}
```

- El texto admite hasta 280 caracteres. Un post necesita texto, imagen (una URL `http` o `https`) o ambos.
- En una reply, `replyTo` es `{ id, handle }`: el post al que responde y el handle de su autor.
- `isLiked` e `isReposted` se refieren al usuario de la sesión; sin sesión son `false`.
- Cada vez que un post se sirve, solo o dentro de una lista, suma una view.
- Dar like o hacer repost dos veces no cambia nada; quitarlo dos veces, tampoco.
- `launch` es `{ id, name, symbol, image }` cuando el post comenta un lanzamiento. Las replies a un comentario heredan su lanzamiento; por eso una reply no puede llevar `launchId`. El creador del lanzamiento recibe una notificación por cada comentario y cada reply, salvo que ya la reciba como reply a su post o como mención.
- Los comentarios son posts normales: salen en el perfil de su autor y en los feeds de sus seguidores.
- `reactions` lista las seis reacciones (`rocket`, `fire`, `gem`, `eyes`, `joy`, `thumbs_down`) con cuántos la usaron y si el usuario de la sesión es uno de ellos. Un usuario puede usar varias en el mismo post, cada una una vez.
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

## Notificaciones

Todas las rutas piden sesión y se refieren al usuario de esa sesión.

| Ruta | Qué hace |
|---|---|
| `GET /api/notifications` | Lista paginada, de la más reciente a la más antigua. Acepta `?tab=all`, `verified` o `mentions` |
| `GET /api/notifications/unread-count` | `{ count }`, para el indicador del menú |
| `POST /api/notifications/read` | Marca todas como leídas |

Una notificación tiene esta forma:

```json
{
  "id": "…",
  "type": "like",
  "actors": [{ "id": "…", "name": "…", "handle": "…", "avatar": null, "verified": false, "bio": "" }],
  "otherActorCount": 12,
  "actorAddress": null,
  "post": { "…": "un post, como arriba" },
  "launch": null,
  "reaction": null,
  "purchase": null,
  "createdAt": "2026-10-11T00:00:00.000Z",
  "isUnread": true
}
```

- `type` es `like`, `repost`, `follow`, `mention`, `reply`, `launch_purchase` (alguien compró tu token), `purchase` (compraste un token), `launch_comment` (alguien comentó tu lanzamiento) o `reaction` (alguien reaccionó a tu post o a tu lanzamiento).
- `launch` es `{ id, name, symbol, image, nativeSymbol }` en las notificaciones de compras, comentarios y reacciones a un lanzamiento. `reaction` es el emoji de una `reaction`.
- `purchase` es `{ nativeAmount, tokenAmount }` (en la unidad mínima) para una sola compra. Las compras de un mismo día a un lanzamiento se agrupan como los likes y entonces no llevan importes.
- Una compra hecha desde una wallet sin perfil de Somewhere no tiene `actors`: trae la dirección en `actorAddress`. Una `purchase` tampoco tiene `actors`: la hizo quien la recibe.
- Las compras se notifican con la fecha de su bloque, no con la de cuando el indexador las leyó.
- `actors` trae hasta tres usuarios, del más reciente al más antiguo, y `otherActorCount` cuántos más hay: "Aria, Yuki y 12 más".
- `post` es el post que recibió el like o el repost, o el post que menciona o responde. En un `follow` es `null`.
- Los likes y los reposts que un post recibe en un mismo día (UTC) forman una sola notificación, y lo mismo los follows de un día. Las menciones y las replies van siempre sueltas.
- La pestaña `verified` solo cuenta lo que hicieron usuarios verificados; `mentions` incluye menciones, replies y comentarios a tus lanzamientos.
- Nadie recibe notificaciones de lo que se hace a sí mismo. Una reply que además menciona al autor del post genera una sola notificación, de tipo `reply`.
- Al deshacer lo que causó una notificación (quitar el like, dejar de seguir, borrar el post), la notificación desaparece.
- Una mención es `@` seguido de un handle; no distingue mayúsculas.

## Launchpad

Los lanzamientos de tokens viven en los contratos de `somewhere.finance-contracts`. La API no los crea ni los modifica: un indexador copia a PostgreSQL lo que ocurre en la cadena, leyendo los eventos de los contratos, y las rutas sirven esa copia. Crear un lanzamiento, contribuir, retirar tokens y pedir un reembolso son transacciones que la wallet del usuario envía a los contratos.

| Ruta | Sesión | Qué hace |
|---|---|---|
| `GET /api/launches` | Opcional | Lanzamientos, del más reciente al más antiguo, paginados |
| `GET /api/launches/chains` | No | Cadenas configuradas, con la dirección del contrato `Launchpad` de cada una |
| `GET /api/launches/token-list` | No | Los tokens de todos los lanzamientos listados, en el formato de lista de tokens que importan wallets y exchanges |
| `GET /api/launches/:id` | Opcional | Un lanzamiento |
| `POST /api/launches/details` | Sí | Manda la descripción y la imagen con el hash de la transacción que crea el lanzamiento, antes de que el indexador lo lea |
| `PUT /api/launches/:id/details` | Sí | Pone la descripción y la imagen de un lanzamiento ya indexado |
| `GET /api/launches/:id/comments` | Opcional | Los comentarios que abren conversación, del más reciente al más antiguo; las replies se leen con `GET /api/posts/:id/replies` |
| `PUT /api/launches/:id/reactions/:kind` y `DELETE` | Sí | Pone o quita una reacción con emoji y devuelve el lanzamiento |

Filtros de la lista: `chain` (clave de la cadena), `status` (`upcoming`, `live` o `ended`), `creator` (dirección de wallet) y `q` (texto en el nombre o el símbolo).

Sobre la respuesta:

- **Los importes son cadenas de texto** en la unidad mínima (wei para la moneda nativa, 18 decimales para el token), porque no caben en un número.
- `status` es `upcoming`, `live`, `succeeded`, `failed`, `finalized` o `cancelled`, calculado en cada petición con la misma lógica que el contrato: una venta cambia de estado al pasar el tiempo, sin que haya ningún evento.
- `cancelledAt` indica cuándo el creador canceló la venta, algo que solo puede hacer antes de que empiece. El filtro `ended` incluye las canceladas.
- `finalizeBy` indica hasta cuándo se puede listar una venta exitosa. Pasado ese plazo de 7 días la venta pasa a fallida.
- `myContribution` es lo que aportó el usuario de la sesión con sus wallets, y si ya retiró tokens o reembolso.
- `creator.user` es el perfil de Somewhere del creador, si su wallet pertenece a algún usuario.
- La descripción y la imagen son lo único que no está en la cadena. **Se ponen juntas, una sola vez, solo por el creador y solo antes de que empiece la venta**, y después no cambian nunca: así nadie puede cambiar el logo de un token para hacerse pasar por otro. La imagen tiene que ser una subida a esta API (`POST /api/uploads/images`); cualquier otro enlace se rechaza con 400. Un segundo intento, o uno con la venta empezada, se rechaza con 409. `detailsSetAt` dice cuándo se pusieron.
- El front las manda con `POST /api/launches/details` en cuanto se confirma la transacción. Si el lanzamiento aún no está indexado, la API responde 202 y las guarda aparte; el indexador las aplica al leerlo, solo si la wallet creadora es de quien las mandó. Cualquiera puede mandar detalles para cualquier transacción, pero solo se aplican los del creador, así que nadie puede adelantarse para bloquearlo. Los que no llegan a aplicarse se borran a las 24 horas.
- `reactions` lista las reacciones al lanzamiento, igual que en los posts.

### Lista de tokens

`GET /api/launches/token-list` publica los tokens de los lanzamientos listados en el [formato estándar de listas de tokens](https://tokenlists.org) (el de Uniswap), que cualquier wallet o exchange puede importar con esa URL. Un test la valida contra el esquema oficial.

- Solo entran los tokens ya listados, ordenados por fecha de listado. Una venta que no llega a listarse nunca aparece.
- El formato limita el nombre a 60 caracteres y no admite espacios en el símbolo; los pocos tokens que no cumplen se dejan fuera para que la lista siga siendo válida.
- La versión se calcula de la propia lista: el número menor cuenta los tokens y el de parche las imágenes. Como un token listado nunca sale y su imagen solo se pone una vez, la versión solo sube.

### Configurar las cadenas

`EVM_CHAINS` es una lista JSON con las cadenas a leer. Vacía, la API funciona sin Launchpad.

```json
[{
  "key": "sepolia",
  "chainId": 11155111,
  "name": "Sepolia",
  "nativeSymbol": "ETH",
  "rpcUrl": "https://…",
  "launchpad": "0x…",
  "startBlock": 0,
  "confirmations": 5,
  "logBlockRange": 10
}]
```

- `launchpad` es la dirección del contrato desplegado y `startBlock` el bloque en que se desplegó.
- `confirmations` es cuántos bloques espera el indexador antes de leer uno. Lo que el indexador lee no lo deshace, así que en una red real tiene que ser lo bastante alto para que el bloque ya no pueda cambiar. Solo una cadena local admite `0`.
- `logBlockRange` es cuántos bloques pide el indexador al nodo de una vez (por defecto 2000). Los planes gratuitos de los proveedores lo limitan: en Alchemy gratis, a 10.
- Si una cadena reemplaza un bloque ya leído, el indexador se detiene y lo dice en el log.
- El indexador recuerda qué contrato `Launchpad` leyó. Si `EVM_CHAINS` pasa a nombrar otro para la misma cadena, lee el nuevo desde su `startBlock` sin borrar nada: los lanzamientos del anterior se quedan en la base de datos, sin mostrarse, con todo lo que la gente añadió. Cambiar de contrato no requiere `launchpad:reset`.

### Lo que la gente añade nunca se pierde al releer la cadena

La tabla `launches` es una copia de la cadena: se puede borrar y volver a leer. Lo que la gente añade sobre un lanzamiento vive aparte y lo apunta por su id: la descripción y la imagen (`launch_profiles`), los comentarios (`posts.launch_id`), las reacciones y las notificaciones. Ninguna de esas tablas tiene clave foránea hacia `launches`, así que borrar la copia no las toca.

El id de un lanzamiento sale de la propia cadena (`src/launchpad/launch-id.ts`): un UUIDv7 con la hora de su bloque, su número y un hash de cadena, contrato y número. Releer la cadena le da el mismo id, y todo lo añadido vuelve a encontrarlo. Las notificaciones de compra guardan la clave de su evento (`source_key`), así que releer la cadena no las repite. Hay un test que borra la copia, la vuelve a leer y comprueba que descripción, imagen, comentarios, reacciones y notificaciones siguen igual.
- Los errores del indexador no muestran la URL del nodo, porque suele llevar la API key del proveedor.

### Desarrollo con una cadena local

1. En `somewhere.finance-contracts`: `npm run node` (déjalo abierto) y, en otra terminal, `npm run demo:local`. El segundo crea un Launchpad con tres lanzamientos de ejemplo e imprime la línea `EVM_CHAINS=…`.
2. Pega esa línea en el `.env` de este proyecto y arranca la API.

Cada vez que se reinicia la cadena local empieza de cero, y hay que borrar lo indexado de la anterior: `npm run launchpad:reset -- local`. El script solo borra la copia de la cadena y se niega a funcionar con `NODE_ENV=production`.

Si cambia un evento de los contratos, `npm run abi:sync` regenera `src/launchpad/abi.ts` a partir de los contratos compilados.

## Imágenes

| Ruta | Sesión | Qué hace |
|---|---|---|
| `POST /api/uploads/images` | Sí | Guarda una imagen enviada como `multipart/form-data` en el campo `file` y devuelve `{ url }` |
| `GET /api/uploads/:nombre` | No | Sirve una imagen guardada |

- Acepta PNG, JPEG, GIF y WebP de hasta 2 MB. El formato se lee del contenido del archivo, no del nombre ni del tipo que manda el navegador. SVG no se acepta porque puede llevar scripts.
- Cada imagen se decodifica y se vuelve a escribir en su formato con `sharp` antes de guardarla. Solo queda la imagen: se pierden los metadatos ocultos (como la posición GPS de una foto) y cualquier cosa añadida al archivo. Las de más de 2048 px de lado se reducen.
- El archivo se nombra con el SHA-256 de lo guardado. Un enlace siempre muestra la misma imagen, cualquiera puede comprobarlo, y la misma imagen subida dos veces se guarda una. Por eso se sirve con caché de un año.
- La `url` devuelta es la que se guarda después en un perfil (`avatar`), un post (`image`) o un lanzamiento (`image`). Los tres solo aceptan imágenes subidas aquí (400 para cualquier otro enlace): una imagen de otro sitio puede cambiar después y le dice a su dueño quién la mira. Los avatares antiguos con enlaces de fuera se conservan hasta que el usuario cambie el suyo.
- Cada subida queda registrada en `uploads`, con quién la hizo. Un usuario puede subir `UPLOAD_DAILY_LIMIT` imágenes en 24 horas (30 por defecto); pasado el límite responde 429. Se construye con `PUBLIC_API_URL` (por defecto `http://localhost:<PORT>/api`).
- Los archivos van a la carpeta `UPLOAD_DIR` (por defecto `uploads/`, ignorada por git). En producción hará falta un almacenamiento de objetos (S3, R2…) o un disco persistente; las imágenes subidas que nadie llega a usar todavía no se borran.

## Límites de peticiones

Cada IP puede hacer 120 peticiones por minuto a cada ruta. Algunas tienen un límite menor (`src/common/rate-limits.ts`): pedir y verificar el reto de login, 10; subir imágenes, 20; publicar posts, 20; mandar los detalles de un lanzamiento, 10. Pasado el límite la API responde 429 con "Too many requests. Wait a minute and try again.".

- Los contadores viven en la memoria de cada servidor. Con varios servidores harán falta en un almacén compartido, como Redis.
- Detrás de un balanceador o una CDN, `TRUST_PROXY` es cuántos hay delante, para contar por la IP real del cliente (`X-Forwarded-For`). Con un número equivocado, un cliente podría falsear su IP.
- `RATE_LIMIT_ENABLED=false` los apaga; solo lo usan los tests.

## Tests y base de datos

Los tests e2e nunca usan la base de datos del `.env`. Usan la de `TEST_DATABASE_URL` o, si no está, la del `.env` con `_test` añadido al nombre (`somewhere_finance_test`), que se crea y se migra sola antes de empezar (`test/support/`). Se niegan a correr contra una base de datos cuyo nombre no acabe en `_test` o que no esté en esta máquina. También guardan las imágenes en una carpeta temporal.

## Paginación

Las listas aceptan `?limit=` (de 1 a 50, por defecto 20) y `?cursor=`, y responden `{ items, nextCursor }`. Para la página siguiente se envía `nextCursor` como `cursor`; cuando es `null` no hay más.
