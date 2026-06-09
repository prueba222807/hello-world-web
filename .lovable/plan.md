## Resumen

Dos entregables grandes:

1. **Flujo de trazabilidad de pedidos** estilo InvoiceFlowTracker, adaptado a SalesFlow. Disparo: cuando el vendedor **confirma** un pedido entra al flujo (facturación → bodega → conductor → cliente → facturación → cartera → finalizada), con **timeline de eventos**, **aceptación/rechazo por el receptor**, **firma + foto + geo** obligatorias según paso, y **notificaciones realtime**.
2. **Reporteador con descarga Excel**: ventas por vendedor, por producto, por cliente y trazabilidad/tiempos de flujo. Filtros por rango de fechas. Fuente: solo pedidos con factura Siigo emitida (`status` posterior a `invoiced`).

Lo divido en fases para poder probar incrementalmente.

---

## Fase A — Modelo de datos del flujo

Reutilizo `orders` + `order_handoffs` actuales y agrego lo que falta para igualar el modelo del referencia:

**Migración nueva (una sola):**
- Extender enum `order_status` con: `awaiting_warehouse`, `in_warehouse`, `awaiting_driver`, `in_transit`, `delivered`, `awaiting_billing_return`, `returned_to_billing`, `awaiting_collections`, `with_collections`, `finalized`, `rejected`. (Mantengo los existentes para no romper código).
- Nueva tabla `order_events` (timeline puro, separada de handoffs):
  - `id, order_id, event_type, from_status, to_status, actor_id, actor_role, receiver_id, signature_url, observations, visible_date, event_at, lat, lng, accuracy`.
  - Enum `order_event_type`: `confirmation`, `bill_to_warehouse`, `warehouse_receives`, `warehouse_to_driver`, `driver_receives`, `driver_delivers_customer`, `warehouse_delivers_customer`, `driver_returns_billing`, `billing_receives_return`, `billing_to_collections`, `collections_receives`, `transfer_pending`, `transfer_accepted`, `transfer_rejected`.
- Nueva tabla `order_evidences` (`event_id`, `order_id`, `file_url`, `file_name`, `file_type`, `uploaded_by`, `lat/lng/accuracy/captured_at`). Bucket Storage `order-evidence`.
- Nueva tabla `notifications` (`user_id`, `order_id`, `type`, `title`, `body`, `read_at`, `created_at`) + habilitar realtime.
- Nueva tabla `app_flow_settings` (singleton): `confirmation_mode` = `signature` | `acceptance` (controlable por admin), `client_delivery_requires_photo`, `client_delivery_requires_geo`.
- Campos en `orders`: `pending_status`, `pending_holder_user` (cuando hay transferencia esperando aceptación).
- Grants + RLS por rol: cada rol ve sus pedidos vigentes, admin/facturación ven todo, evidencias y eventos heredan visibilidad del pedido.

## Fase B — Server functions del flujo (`src/lib/orders/flow.functions.ts`)

Una sola API limpia, reemplaza handoffs viejos progresivamente:

- `confirmOrder({order_id})` — vendedor; crea evento `confirmation`, status `awaiting_billing` (o entra directo si flujo arranca en facturación).
- `availableActions({order_id})` — devuelve acciones permitidas para mi rol según status (espejo de `NEXT_ACTIONS` de referencia).
- `executeAction({order_id, action, receiver_id?, signature_data_url?, photo_urls[], observations, visible_date, geo})` — valida rol, registra evento, sube firma, mueve status. Si `confirmation_mode='acceptance'` y la acción tiene receptor → deja status `pendiente_aceptacion` y guarda `pending_status` + `pending_holder_user`, no firma.
- `respondTransfer({order_id, decision, observations, geo})` — el receptor acepta (aplica `pending_status`) o rechaza (vuelve al emisor con evento `transfer_rejected`).
- `listOrderTimeline({order_id})` — eventos + evidencias + perfiles.
- `myInbox({role})` — pendientes para mí (transferencias en `pendiente_aceptacion` dirigidas a mí + pedidos que tengo asignados).
- `adminEditEvent / deleteEvent` — solo admin (corrige errores como en el referencia).
- `uploadEvidence` server fn que sube a Storage `order-evidence` (firma del frontend con `supabase.storage`).

Helpers cliente `src/lib/order-flow.ts`: replicar `STATUS_LABELS`, `EVENT_LABELS`, `ROLE_LABELS`, `getAvailableActions`, `formatDateTime`, `durationBetween`. Capturar geo con `src/lib/geo.ts` existente.

## Fase C — UI del flujo

Reusar layouts existentes (`admin-layout`, `vendedor-layout`) y agregar:

- `/pedidos/$id` (existente): rediseñar para que sea **el detalle estilo InvoiceDetail del referencia**:
  - Header con número, status badge, cliente.
  - Tarjeta "Acción disponible" con `ActionDialog` (firma con `SignaturePad` reusado, captura geo, subida de evidencia multifoto, fecha visible, observaciones, selector de receptor).
  - Tarjeta "Pendiente de aceptación" cuando aplica, con panel **Aceptar/Rechazar** si soy el receptor.
  - Tarjeta info del pedido + botón PDF Siigo.
  - Timeline vertical con eventos, firma thumbnail, evidencias clickables, enlace a Google Maps por evento.
  - Panel admin (editar/anular eventos, reasignar holder).
- `/admin/solicitudes` (existente): extender con bandejas por rol.
- Nuevas rutas dedicadas (mobile-first) bajo `_authenticated`:
  - `/bandeja` — inbox unificado de pendientes por aceptar para mi rol.
  - `/bodega`, `/conductor`, `/cartera`, `/facturacion` (si no existen completas): cola activa + pendientes.
- `NotificationBell` en headers de admin y vendedor (suscripción realtime a `notifications`).
- `MobileBottomNav` para roles operativos (bodega/conductor/cartera) con accesos rápidos.
- Toggle "modo confirmación" en `/admin/ajustes` (firma vs aceptación).

Componentes nuevos: `src/components/flow/SignaturePad.tsx`, `EvidenceUploader.tsx` (con captura cámara + geo prefetch), `StatusBadge.tsx`, `TimelineEvent.tsx`, `ActionDialog.tsx`, `AcceptRejectPanel.tsx`, `NotificationBell.tsx`.

## Fase D — Reporteador con descarga Excel

Nueva ruta `/admin/reportes` (admin/facturacion/cartera), mobile-friendly:

- Filtros: rango de fechas (entrega o emisión), vendedor (multi), producto (multi), cliente (multi), estado.
- 4 reportes (cada uno con su botón "Descargar Excel"):
  1. **Ventas por vendedor**: agregados (total facturado, # pedidos, ticket promedio) + detalle.
  2. **Ventas por producto**: unidades, monto, IVA, % participación + detalle por línea.
  3. **Ventas por cliente**: total, # facturas, último pedido + detalle.
  4. **Trazabilidad / tiempos**: por pedido, tiempos entre cada paso (facturación→bodega, bodega→conductor, etc.), entregas por conductor, pendientes por rol.
- Fuente: solo pedidos con `siigo_invoice_id IS NOT NULL` (factura confirmada).

**Server fns** en `src/lib/reports/reports.functions.ts`:
- `reportSalesBySeller`, `reportSalesByProduct`, `reportSalesByCustomer`, `reportTraceability`. Cada uno devuelve `{ summary[], detail[] }` ya agregado en SQL para que el cliente solo arme el Excel.

**Cliente**: `src/lib/reports/export-excel.ts` usando `xlsx` (instalar). Cada exportador genera workbook multi-hoja (Resumen + Detalle) con anchos de columna y totales. Estilo replicado del `export-excel.ts` del referencia.

## Detalles técnicos

- **Storage**: bucket público `order-evidence` (firmas y fotos). Para firmas, subir el dataURL como blob PNG.
- **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`. Hook `useNotifications()` con `supabase.channel`.
- **Triggers DB**: trigger en `order_events` que inserta `notifications` para el receptor cuando hay `transfer_pending`.
- **Geo**: usar `src/lib/geo.ts` existente; obligatoria solo para `driver_delivers_customer` y `warehouse_delivers_customer`.
- **Firma**: canvas → `toDataURL('image/png')` → upload Storage → URL al evento.
- **Compatibilidad**: dejo `order_handoffs` viejo intacto pero la UI nueva usa `order_events`. Migración suave: pedidos viejos siguen visibles, pedidos nuevos confirmados usan flujo nuevo.

## Orden de ejecución

1. **A** (migración modelo) — 1 paso, requiere tu OK del SQL.
2. **B** (server fns flujo) — sin UI, testeable con invoke.
3. **C** (UI detalle + dialogs + inbox + notificaciones).
4. **D** (reportes + Excel).

Cada fase queda funcional al cerrarse.

## Preguntas antes de arrancar

1. ¿Apruebo y arranco con **Fase A** (la migración) y voy a la siguiente solo cuando confirmes la base, o quieres que dispare las 4 fases seguidas sin pausa?
2. **Notificaciones**: ¿realtime in-app es suficiente, o quieres también email cuando llega un pendiente?
3. **Trazabilidad en reportes**: ¿incluyo solo pedidos finalizados o todos los facturados (incluyendo en curso) marcando "tiempo hasta hoy" para los abiertos?
