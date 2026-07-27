# Manual de uso — ERP de Solares (OASIS DE MACHIN)

Guía corta para el día a día. Todo el sistema está en español y los montos en
pesos dominicanos (RD$).

## Entrar

1. Abrir la dirección del sistema en el navegador.
2. En **Acceso**, escribir el correo y la contraseña que le entregó gerencia.
3. Si la contraseña no sirve, gerencia la restablece; no hay "olvidé mi
   contraseña" automático.

Cada persona tiene un **rol** y solo ve lo que le toca:

| Rol | Para qué |
|---|---|
| **Vendedor** | Consulta el inventario, registra sus clientes y ve sus ventas, cobros y comisiones. |
| **Administración** | Todo lo del vendedor, más registrar ventas, armar planes de pago y **cobrar** (registrar pagos y emitir recibos). |
| **Gerencia** | Todo, más cancelar ventas, reversar pagos, marcar comisiones pagadas, cambiar configuración, crear usuarios y ver la bitácora. |

---

## Vendedor

- **Inventario (`Solares`)**: ver qué solares hay libres, su manzana, área y
  precio. Se busca por manzana, estado, número o rango de precio.
- **Clientes**: registrar un cliente. La cédula puede quedar **pendiente** si no
  la tiene a mano y completarse después. El sistema avisa si el dígito
  verificador no cuadra, pero deja guardar (hay cédulas viejas válidas).
- **Mis ventas**: ver el estado de cada venta, el plan de cuotas y lo cobrado.
- **Mis comisiones**: ver lo que se le debe y lo ya pagado.

El vendedor **no cobra ni registra ventas**: eso lo hace administración.

---

## Administración

Además de lo anterior:

### Registrar una venta

1. **Ventas → Nueva venta**.
2. Elegir solar, cliente y vendedor; escribir el precio pactado y la fecha.
3. El sistema propone la **separación (5%)** y la **inicial en 6 cuotas**; se
   puede ajustar el monto pactado.
4. Antes de guardar se muestra la **vista previa del plan de pagos**. Revisar que
   la suma de las cuotas dé exactamente el precio pactado (siempre cuadra al
   centavo; el redondeo va en la última cuota de cada bloque).
5. Guardar: el solar pasa a **Separado**.

### Cobrar

1. Entrar a la venta → **Cobrar**.
2. Escribir el monto, la fecha y el método (efectivo o transferencia).
3. El sistema reparte el pago entre las cuotas (la más vieja primero) y muestra
   el reparto **antes** de guardar. Se puede repartir a mano si el cliente paga
   una cuota específica.
4. Al guardar se emite el **recibo** automáticamente. Un pago **siempre** deja
   recibo.
5. Lo que sobre de un pago queda como **saldo a favor** de la venta.

El estado de la venta avanza solo con el dinero: pagada la separación pasa a
**Inicial**, completada la inicial a **Capital**, y pagado todo a **Saldado**.

### Recibos

- **Recibos**: listado y descarga del PDF. El PDF trae el monto en letras y dice
  que es de control interno (no es comprobante fiscal / NCF).
- Un recibo **no se edita ni se borra**. Si hubo un error, gerencia lo **reversa**.

---

## Gerencia

Además de todo lo anterior:

- **Cancelar una venta**: desde la venta, con **motivo obligatorio**. Libera el
  solar y retira la comisión pendiente. Una venta con dinero cobrado no se
  cancela hasta reversar los pagos.
- **Reversar un pago** (`Pagos → [pago] → Reversar`): con motivo obligatorio.
  Devuelve las cuotas a como estaban, baja lo recibido y emite una **nota de
  crédito** contra el recibo original. Nada se borra; queda todo a la vista.
  Tras un reverso, si hace falta bajar el estado de la venta, se ajusta a mano.
- **Comisiones**: ver lo pendiente y lo pagado por vendedor, y marcar una
  comisión **pagada** (o devolverla a pendiente). La comisión nace sola (3% del
  precio pactado) cuando la venta llega a Capital.
- **Configuración**: cambiar el porcentaje de comisión, el de separación y el
  número de cuotas de la inicial y del capital. El cambio afecta solo lo nuevo;
  los planes y comisiones ya registrados no se recalculan.
- **Usuarios**: asignar roles. Un usuario nuevo entra como vendedor.
- **Bitácora**: rastro de toda operación de dinero, venta, recibo, comisión y
  cambio de estado, con autor, fecha y el antes/después.
- **Reportes** (`Reportes`): tablero con inventario por estado, cartera
  pendiente, cuotas vencidas y recaudo por mes. Cada sección se exporta a Excel
  (CSV).

---

## Cosas que el sistema garantiza (y por qué)

- **El dinero cuadra siempre.** La suma de las cuotas es el precio pactado; una
  cuota nunca recibe de más; lo que sobra es saldo a favor. Los montos son
  decimales exactos, no aproximados.
- **Nada de dinero se pierde ni se edita a escondidas.** Pagos y recibos son
  inmutables; se corrige reversando, no borrando. Todo queda en la bitácora.
- **Cada quien ve lo suyo.** Un vendedor no ve las ventas ni los cobros de otro.
- **La cédula es única.** No se registran dos clientes con la misma cédula.

---

## ¿Algo no cuadra?

Los datos que se cargaron del Excel entraron **como estaban**, sin inventar
cifras. Las diferencias entre hojas quedaron listadas para revisar (planes de
pago y pagos históricos los va cargando administración por el sistema a medida
que se confirman). Ante una duda de cifras, revisar la bitácora (gerencia) antes
de corregir.
