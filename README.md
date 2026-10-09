# Horno San Lorenzo — demo

Demo de pitch para presentar a Horno San Lorenzo (Alcobendas + Pozuelo) un rediseño
moderno de su sitio web actual, con flujo de pedidos por WhatsApp sin backend.

## Stack

- Astro 5 (`output: 'static'`)
- React 19 (solo islas: carrito, badge, filtros, contacto, cookies, toast)
- Tailwind v4 (vía `@tailwindcss/vite`, sin config file)
- TypeScript estricto
- Fraunces Variable + Inter Variable (self-hosted via `@fontsource-variable/*`)
- Astro Content Collections + Zod schemas
- sharp para optimización de imágenes en build
- Deploy: Vercel Hobby (estático)

## Requisitos

- Node 20.3+ (recomendado 24, ver `.nvmrc`)
- pnpm 10

## Desarrollo

```bash
pnpm install
cp .env.example .env       # rellena PUBLIC_WHATSAPP_NUMBER con tu número
pnpm dev                    # http://localhost:4321
```

## Comandos

```bash
pnpm dev       # servidor de desarrollo
pnpm build     # build estático en dist/
pnpm preview   # sirve dist/ localmente
pnpm check     # astro check (typescript + content)
```

## Despliegue (Vercel)

```bash
pnpm dlx vercel --prod
```

Variables de entorno necesarias en Vercel:

- `PUBLIC_WHATSAPP_NUMBER` — número en formato `wa.me` (sin `+`), ej. `34666123456`
- `PUBLIC_SITE_URL` — URL canónica (`https://hornosanlorenzo.vercel.app`; también la usan `robots.txt` y los sitemaps)

> Para el pitch, `PUBLIC_WHATSAPP_NUMBER` apunta al móvil de Óscar. Cuando el cliente
> firme, se sustituye por el suyo. Ver el spec para el porqué.

## Imágenes (importante para la demo)

Las imágenes en `public/images/` son **placeholders** generados con `picsum.photos`
(seed determinista por slug). No son bakery-themed.

**Antes del pitch:** sustituir cada `.jpg` por una foto de Unsplash curada para su
categoría (búsquedas sugeridas: "sourdough", "butter croissant", "carrot cake",
"empanada", etc.) o por las fotos reales del horno si están disponibles.

Conservar los mismos nombres de archivo y dimensiones (~1200×900 px).

## Estructura

```
src/
├── content/{products,noticias}/*.md  ← Content Collections
├── content.config.ts                  ← schemas Zod
├── data/                              ← site, stores, services, categorías, tradicion
├── lib/{cart,whatsapp,format}.ts      ← lógica pura
├── hooks/useCart.ts                   ← hook React del carrito
├── layouts/                           ← BaseLayout, MarketingLayout, LegalLayout
├── components/                        ← Astro components (server)
├── islands/                           ← React components (client)
├── styles/global.css                  ← Tailwind v4 + @theme tokens
└── pages/                             ← rutas
```

## Documentación

- Spec: [`docs/superpowers/specs/2026-05-19-hornosanlorenzo-demo-design.md`](docs/superpowers/specs/2026-05-19-hornosanlorenzo-demo-design.md)
- Plan: [`docs/superpowers/plans/2026-05-19-hornosanlorenzo-demo.md`](docs/superpowers/plans/2026-05-19-hornosanlorenzo-demo.md)
