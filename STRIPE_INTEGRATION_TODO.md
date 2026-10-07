# Stripe: lo que falta para cobrar

Única fuente de verdad de los pasos pendientes de Stripe. Integración: **Checkout alojado por Stripe** (el cliente paga en la página de Stripe y vuelve a la web).

## Valores a sustituir

Ninguno. La sesión de pago ya existía en el proyecto y sus valores son reales, no de ejemplo:

**Fichero:** [src/pages/api/checkout.ts](src/pages/api/checkout.ts)

| Campo | Valor actual | Comentario |
|-------|--------------|------------|
| mode | `payment` | Pagos sueltos (no hay suscripciones). |
| success_url | `{origen}/pedido/gracias?session_id={CHECKOUT_SESSION_ID}` | Página de «Gracias» de la web. |
| cancel_url | `{origen}/carrito` | Vuelve al carrito. |
| line_items | Precio calculado en el servidor (`price_data`) por cada línea del pedido | No usa Price IDs del Dashboard a propósito: el precio sale de la carta en Postgres (con las ofertas de Este mes). |

## Parámetros configurados

Configurados en el Checkout Studio y puestos tal cual.

**Fichero:** [src/pages/api/checkout.ts](src/pages/api/checkout.ts)

| Parámetro | Valor |
|-----------|-------|
| ui_mode | `hosted_page` (SDK `stripe` 22.6.1, ≥ 21) |
| billing_address_collection | `auto` |
| phone_number_collection | `{ enabled: true }` |
| automatic_tax | `{ enabled: false }` |
| allow_promotion_codes | `false` |
| submit_type | `auto` |
| saved_payment_method_options | `{ payment_method_save: "enabled" }` |
| integration_identifier | `hosted_mobile_app_0001` |
| origin_context | `mobile_app` |

`payment_method_collection` (`always`) **no** se incluye: solo vale con `mode: "subscription"`.

Se conservan, aunque no salen en el Studio: `customer_email` y `locale: "es"` (rellenan la página de pago) y `metadata` (el webhook la necesita para saber a qué pedido corresponde el pago y avisar al obrador; sin ella los pedidos no se marcarían como pagados).

### A revisar en el Studio

- **`origin_context: mobile_app`**: esto es una web, no una app móvil. Si se eligió por error, cambiarlo a `web` en el Studio (y aquí).
- **`phone_number_collection: enabled`**: la web ya pide el teléfono en el checkout; Stripe lo volverá a pedir.
- **`payment_method_save: enabled`**: según [la documentación de Stripe](https://docs.stripe.com/payments/checkout/save-during-payment), sin `customer` ni `customer_creation: "always"` la sesión no guarda la tarjeta. No da error, pero tampoco guarda nada.

## Puesta en marcha

1. **Claves** (Vercel → proyecto → Settings → Environment Variables, entorno Production; luego volver a desplegar):
   - `STRIPE_SECRET_KEY` — Dashboard → Desarrolladores → Claves de API (`sk_test_…` para probar, `sk_live_…` para cobrar).
   - `STRIPE_WEBHOOK_SECRET` — Dashboard → Desarrolladores → Webhooks → añadir endpoint `https://hornosanlorenzo.vercel.app/api/webhook` con el evento `checkout.session.completed`; la firma empieza por `whsec_…`.
   - La clave publicable (`pk_…`) **no** hace falta: el pago es en la página de Stripe.
2. **Correo del pedido** (opcional pero recomendable): `RESEND_API_KEY`, `ORDER_NOTIFICATION_EMAIL`, `ORDER_FROM_EMAIL`. Sin ellas se cobra, pero no llega aviso al obrador.
3. **Versión de la API**: el cliente de Stripe se crea sin `apiVersion` (usa la del SDK).

## Cómo funciona

1. El cliente confirma el pedido en `/pedido` → `POST /api/checkout`.
2. El servidor recalcula precios desde la carta, guarda el pedido y crea la sesión de Stripe con los datos de entrega en `metadata`; devuelve la URL de pago.
3. El navegador va a la página de Stripe; al pagar vuelve a `/pedido/gracias`.
4. Stripe avisa a `/api/webhook` (`checkout.session.completed`): se marca el pedido como pagado y se manda el correo al obrador.

Sin `STRIPE_SECRET_KEY`, el checkout anota el pedido como «sin pago» y no cobra (situación actual en producción).

No se ha creado ningún fichero nuevo de código: solo cambian los parámetros de la sesión en `src/pages/api/checkout.ts`.

## Pruebas

Con claves `sk_test_…`:

| Tarjeta | Resultado |
|---------|-----------|
| 4242 4242 4242 4242 | Pago correcto |
| 4000 0025 0000 3155 | Pide autenticación (3D Secure) |
| 4000 0000 0000 9995 | Rechazada (fondos insuficientes) |

Cualquier fecha futura, cualquier CVC y cualquier código postal. Comprobar que el pedido pasa a pagado en el panel y que llega el correo.

## Siguientes pasos

- Probar un pedido completo en modo prueba antes de poner las claves `live`.
- Revisar los tres puntos de «A revisar en el Studio».
- Pendientes de seguridad del cobro en `tasks/todo.md` («Bloquea encender los cobros»).

## Recursos

- https://support.stripe.com
- https://docs.stripe.com/mcp
