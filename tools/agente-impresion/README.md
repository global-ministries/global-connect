# Agente de impresión de etiquetas (Niños)

Programa pequeño que corre en la computadora que tiene la impresora de
etiquetas. Cada pocos segundos le pregunta a la app si hay etiquetas
pendientes de su estación, las imprime sin abrir ningún cuadro de diálogo y
le avisa a la app si salieron bien o con error.

Primera configuración: MacBook Pro + impresora térmica 4B-2054N por USB.

- No necesita instalar paquetes: solo Node.js 18 o más reciente.
- No guarda ni muestra datos de los niños. En pantalla solo verás números de
  trabajos y conteos.
- El token de la estación es una clave: no lo compartas ni lo envíes por chat.

## 1. Instala Node.js

En la Terminal escribe `node -v`. Si aparece `v18` o un número mayor, ya lo
tienes. Si no, descárgalo de <https://nodejs.org> (versión LTS) e instálalo.

## 2. Instala la impresora en la Mac

1. Descarga el driver para macOS de la 4B-2054N desde la página del fabricante
   (4BARCODE / Xprinter) e instálalo.
2. Conecta la impresora por USB y enciéndela.
3. Abre **Ajustes del Sistema → Impresoras y escáneres → Agregar impresora** y
   agrega la 4B-2054N con su driver.

## 3. Busca el nombre de la cola de impresión

Desde la carpeta del proyecto:

```sh
node tools/agente-impresion/agente.js --impresoras
```

Verás algo como `la impresora 4B_2054N está inactiva` (o `printer 4B_2054N is
idle`). El nombre de la cola es la palabra después de «impresora» / «printer»,
en este ejemplo `4B_2054N`.

## 4. Imprime una prueba (sin la app)

```sh
node tools/agente-impresion/agente.js --prueba --impresora 4B_2054N
```

Imprime tres etiquetas de muestra de 102 × 51 mm: un niño con alergia, un niño
con ñ y tildes, y la etiqueta del representante con el QR. Si tu rollo tiene
otra medida, indícala en mm:

```sh
node tools/agente-impresion/agente.js --prueba --impresora 4B_2054N --ancho 50 --alto 30
```

Revisa:

- Que las tildes y la ñ se vean bien (Rodríguez, Muñoz, JOSÉ ÁNGEL). Si salen
  símbolos raros, avísanos: la fuente de la impresora no los tiene y hay que
  imprimir el texto como imagen.
- Que el bloque negro de **ALERGIA** salga solo en la primera etiqueta.
- Que cada etiqueta quede centrada en su pegatina. Si se corre hacia la
  siguiente, mide el espacio entre etiquetas y ponlo en `gapMm` (paso 6).
- Que el teléfono lea el QR.

¿Sin impresora a mano? Guarda los bytes en un archivo para revisarlos:

```sh
node tools/agente-impresion/agente.js --prueba --guardar /tmp/prueba.tspl
```

## 5. Prepara la estación en la app

1. **Token.** La estación de impresión y su token se crean en la app:
   1. Entra a **Niños › Salones de check-in** y abre la pestaña
      **Etiquetas**.
   2. Toca **Agregar estación**, ponle el nombre de esta mesa (por ejemplo,
      «Mesa principal») y toca **Crear estación**. La app te muestra su
      token.
   3. Copia el token y pégalo en `agente.config.json` (paso 6).

   El token se muestra una sola vez: cópialo al momento. Si se pierde, abre
   la estación y toca **Crear token nuevo**; el anterior deja de funcionar.
2. **Medidas de la etiqueta.** Mide el rollo (ancho × alto de una etiqueta, en
   mm) y guárdalo en la estación. Las etiquetas se acomodan a esa medida. Sin
   medidas, el agente imprime a 102 × 51 mm y 203 dpi (el rollo de la
   4B-2054N) y lo avisa al conectarse.

## 6. Configura el agente

Copia el ejemplo y complétalo:

```sh
cp tools/agente-impresion/agente.config.example.json tools/agente-impresion/agente.config.json
```

| Campo | Qué poner |
|---|---|
| `servidor` | La dirección de la app, por ejemplo `https://tu-app.ejemplo.org`. |
| `token` | El token de la estación (64 caracteres). |
| `impresora` | El nombre de la cola del paso 3. |
| `intervaloMs` | Cada cuánto revisa la cola, en milisegundos. Por defecto `2000`. |
| `modo` | `tspl` (el único por ahora). |
| `gapMm` | Espacio entre etiquetas del rollo, en mm. Por defecto `2`. |

`agente.config.json` no se sube al repositorio. También puedes usar variables
de entorno, que tienen prioridad sobre el archivo: `GC_AGENTE_SERVIDOR`,
`GC_AGENTE_TOKEN`, `GC_AGENTE_IMPRESORA`, `GC_AGENTE_INTERVALO_MS`,
`GC_AGENTE_MODO`, `GC_AGENTE_GAP_MM`.

## 7. Ponlo a trabajar

```sh
caffeinate -i node tools/agente-impresion/agente.js
```

`caffeinate -i` evita que la Mac se duerma mientras el agente corre. Deja la
Mac conectada a la corriente y con la tapa abierta. Para detenerlo, presiona
**Ctrl-C**.

Si se cae el internet, el agente espera y vuelve a intentar solo (cada vez un
poco más, hasta 30 segundos). Una etiqueta que no se pudo confirmar no se
imprime dos veces.

## Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| `El servidor rechazó el token (401)` | El token está mal copiado, se generó uno nuevo o la estación está desactivada. Pide el token actual. |
| `sin conexión con el servidor` | Revisa el internet y la dirección en `servidor`. El agente sigue intentando. |
| `sin medidas de etiqueta: imprimo a 102 × 51 mm` | La estación no tiene medidas. Si tu rollo es de otra medida, guarda su ancho y alto en la estación. |
| `lp_salida_1: … does not exist` | El nombre de `impresora` no coincide con la cola. Revísalo con `--impresoras`. |
| La etiqueta sale en blanco | El papel térmico está al revés: la cara que imprime va hacia el cabezal. |

## Logos de las áreas

Las mascotas van en `tools/agente-impresion/logos/` (ver el README de esa
carpeta). Mientras no estén, la etiqueta muestra solo el nombre del área.
